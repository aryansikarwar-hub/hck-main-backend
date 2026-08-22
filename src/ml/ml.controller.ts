import { BadRequestException, Controller, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { randomUUID } from "crypto";
import { MlService } from "./ml.service";
import { DetectionsService } from "../detections/detections.service";
import { StructuresService } from "../structures/structures.service";
import { AlertsService } from "../alerts/alerts.service";
import { Detection } from "../detections/detection.entity";
import { CaptureSource, Severity } from "../common/enums";

const HIGH_SEVERITY: Severity[] = [Severity.HIGH, Severity.CRITICAL];

/**
 * Ingestion entry point (stands in for the PRD's separate Ingestion +
 * Preprocessing + Inference Orchestration + Severity/Tracking services,
 * folded into one NestJS controller/service chain for this build). Accepts
 * an upload, calls the ML service once, persists each prediction as a
 * Detection row in Postgres, and raises an Alert row for anything
 * high/critical.
 *
 * POST /api/ingest/:structureId  (multipart/form-data, field name "file")
 */
@Controller("ingest")
export class MlController {
  constructor(
    private readonly ml: MlService,
    private readonly detections: DetectionsService,
    private readonly structures: StructuresService,
    private readonly alerts: AlertsService
  ) {}

  @Post(":structureId")
  @UseInterceptors(FileInterceptor("file"))
  async ingest(@Param("structureId") structureId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded (expected multipart field \"file\")");

    const structure = await this.structures.findOne(structureId); // throws 404 if unknown
    const result = await this.ml.predict(file.buffer, file.originalname);

    const created: Detection[] = [];
    for (const p of result.predictions) {
      const detection: Detection = {
        id: randomUUID(),
        structureId,
        imageUrl: `pending-upload/${file.originalname}`,
        annotatedImageUrl: p.maskUrl ?? `pending-upload/${file.originalname}`,
        crackType: p.crackType,
        widthMm: p.widthMm,
        lengthCm: p.lengthCm,
        severity: p.severity as Severity,
        confidence: p.confidence,
        location: `${structure.name} (auto-located)`,
        capturedAt: new Date().toISOString(),
        capturedBy: CaptureSource.WEB,
      };
      await this.detections.create(detection);

      if (HIGH_SEVERITY.includes(detection.severity)) {
        await this.structures.bumpRisk(structureId, detection.severity);
        await this.alerts.raise({
          id: randomUUID(),
          structureId,
          structureName: structure.name,
          detectionId: detection.id,
          severity: detection.severity,
          message: `${p.crackType} crack detected (${p.widthMm}mm) — ${detection.severity} severity.`,
          createdAt: new Date().toISOString(),
          acknowledged: false,
        });
      }
      created.push(detection);
    }

    return { modelVersion: result.modelVersion, inferenceMs: result.inferenceMs, detections: created };
  }
}
