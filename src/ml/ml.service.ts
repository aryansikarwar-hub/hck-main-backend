import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";
import FormData from "form-data";
import { MlPredictResponse } from "./ml.types";

/**
 * Default inference timeout.
 *
 * The old default was 5s, which is shorter than a free-tier host takes to
 * wake a sleeping container — so a perfectly healthy ML service still timed
 * out on the first upload after an idle period. Inference itself is fast; the
 * cold start is what needs the headroom.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Single client for the one ML inference API (../ml-model/service). The
 * backend never runs model code itself — it just calls this service, which
 * is how "one accurate model, served once" stays true even as the website
 * and future mobile app both need predictions through the same backend.
 */
@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService
  ) {
    this.baseUrl = (this.config.get<string>("ML_SERVICE_URL") ?? "http://localhost:9000").replace(/\/+$/, "");

    if (!this.config.get<string>("ML_SERVICE_URL")) {
      this.logger.warn(
        "ML_SERVICE_URL is not set — falling back to http://localhost:9000, which does not exist in a deployed environment. Uploads will fail until it points at the inference service."
      );
    }
  }

  async predict(fileBuffer: Buffer, filename: string): Promise<MlPredictResponse> {
    const form = new FormData();
    form.append("file", fileBuffer, filename);

    const start = Date.now();

    let data: MlPredictResponse;
    try {
      const response = await firstValueFrom(
        this.http.post<MlPredictResponse>(`${this.baseUrl}/predict`, form, {
          headers: form.getHeaders(),
          timeout: Number(this.config.get("ML_SERVICE_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        })
      );
      data = response.data;
    } catch (error) {
      // Every failure below used to escape as a raw AxiosError, which the
      // global exception filter turned into an opaque 500 "Internal server
      // error" — telling the user nothing about what was actually wrong.
      throw this.toClientError(error, filename);
    }

    if (!data || !Array.isArray(data.predictions)) {
      this.logger.error(`ML service returned an unexpected payload for ${filename}: ${JSON.stringify(data)?.slice(0, 300)}`);
      throw new ServiceUnavailableException("The analysis service returned an unexpected response.");
    }

    this.logger.log(`ML predict for ${filename} → ${data.predictions.length} detection(s) in ${Date.now() - start}ms`);
    return data;
  }

  /** Maps an axios failure to an exception the client can act on. */
  private toClientError(error: unknown, filename: string): ServiceUnavailableException {
    const axiosError = error as AxiosError<{ detail?: string }>;
    const status = axiosError?.response?.status;
    const code = axiosError?.code;

    // The inference service answers 503 with a `detail` explaining that no
    // model has been loaded. That is the single most useful message we can
    // give the user, so pass it straight through.
    if (status === 503) {
      const detail = axiosError.response?.data?.detail;
      this.logger.error(`ML service unavailable for ${filename}: ${detail ?? "no detail"}`);
      throw new ServiceUnavailableException(
        detail ?? "No crack-detection model is loaded on the analysis service yet."
      );
    }

    if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
      this.logger.error(`ML service timed out for ${filename}`);
      return new ServiceUnavailableException(
        "The analysis service took too long to respond. It may be starting up — please try again in a minute."
      );
    }

    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
      this.logger.error(`ML service unreachable at ${this.baseUrl} (${code}). Is ML_SERVICE_URL set correctly?`);
      return new ServiceUnavailableException(
        "The analysis service is unreachable. Check that it is deployed and that ML_SERVICE_URL points at it."
      );
    }

    if (status) {
      const detail = axiosError.response?.data?.detail;
      this.logger.error(`ML service returned ${status} for ${filename}: ${detail ?? "no detail"}`);
      return new ServiceUnavailableException(
        detail ?? `The analysis service rejected the image (HTTP ${status}).`
      );
    }

    this.logger.error(`ML request failed for ${filename}`, error instanceof Error ? error.stack : String(error));
    return new ServiceUnavailableException("The analysis service could not process this image.");
  }

  async health(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get(`${this.baseUrl}/health`, { timeout: 5000 }));
      return true;
    } catch {
      return false;
    }
  }
}