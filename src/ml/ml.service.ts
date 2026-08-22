import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import FormData from "form-data";
import { MlPredictResponse } from "./ml.types";

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
    this.baseUrl = this.config.get<string>("ML_SERVICE_URL") ?? "http://localhost:9000";
  }

  async predict(fileBuffer: Buffer, filename: string): Promise<MlPredictResponse> {
    const form = new FormData();
    form.append("file", fileBuffer, filename);

    const start = Date.now();
    const { data } = await firstValueFrom(
      this.http.post<MlPredictResponse>(`${this.baseUrl}/predict`, form, {
        headers: form.getHeaders(),
        timeout: Number(this.config.get("ML_SERVICE_TIMEOUT_MS") ?? 5000),
      })
    );
    this.logger.log(`ML predict for ${filename} → ${data.predictions.length} detection(s) in ${Date.now() - start}ms`);
    return data;
  }

  async health(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get(`${this.baseUrl}/health`, { timeout: 2000 }));
      return true;
    } catch {
      return false;
    }
  }
}
