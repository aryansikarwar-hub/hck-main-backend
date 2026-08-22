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

  /**
   * The inference service's own account of itself, for the admin page.
   *
   * That page used to render a hardcoded table of model versions with invented
   * recall figures (92.4%, 89.1%, 88.7%) presented as measured results. No
   * model had ever been trained. Reading the live service instead means the
   * page can only ever show what is actually loaded — including, honestly,
   * "no model loaded" when that is the truth.
   */
  async status(): Promise<MlServiceStatus> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<{
          status?: string;
          model_version?: string;
          model_loaded?: boolean;
          engine?: MlEngine;
        }>(`${this.baseUrl}/health`, { timeout: 5000 })
      );

      const modelLoaded = Boolean(data?.model_loaded);
      // Inference services older than the classical-CV fallback don't send
      // `engine`. Infer it from model_loaded rather than defaulting to "none",
      // which would report a working service as broken.
      const engine: MlEngine = data?.engine ?? (modelLoaded ? "onnx" : "none");

      return {
        reachable: true,
        modelLoaded,
        engine,
        modelVersion: data?.model_version ?? null,
        serviceUrl: this.baseUrl,
        detail: MlService.statusDetail(modelLoaded, engine),
      };
    } catch (error) {
      const code = (error as AxiosError)?.code;
      this.logger.warn(`ML status check failed for ${this.baseUrl}: ${code ?? "unknown error"}`);
      return {
        reachable: false,
        modelLoaded: false,
        engine: "none",
        modelVersion: null,
        serviceUrl: this.baseUrl,
        detail: `The analysis service is unreachable at ${this.baseUrl}. Check ML_SERVICE_URL and that the service is deployed.`,
      };
    }
  }

  /**
   * One sentence on what the service can actually do right now.
   *
   * `modelLoaded: false` used to mean exactly one thing — uploads fail. Since
   * the classical-CV fallback exists it can also mean "uploads work, by a
   * weaker method", and saying "uploads will be rejected" in that state is
   * simply untrue.
   */
  private static statusDetail(modelLoaded: boolean, engine: MlEngine): string | null {
    if (modelLoaded) return null;

    if (engine === "opencv-heuristic") {
      return (
        "No trained weights are loaded, so the service is running its classical computer-vision " +
        "fallback: it finds cracks by shape and contrast rather than by a learned model, and its " +
        "confidence scores are geometric plausibility, not measured accuracy. Uploads work. Train a " +
        "model and point MODEL_PATH at the exported ONNX file to replace it."
      );
    }

    return (
      "The service is running but no model weights are loaded and the fallback is disabled. " +
      "Train a model and export it to ONNX, then point MODEL_PATH at it."
    );
  }
}

/** Which detector answered — see ml-model/service/heuristic.py. */
export type MlEngine = "onnx" | "opencv-heuristic" | "none";

export interface MlServiceStatus {
  reachable: boolean;
  modelLoaded: boolean;
  engine: MlEngine;
  modelVersion: string | null;
  serviceUrl: string;
  detail: string | null;
}