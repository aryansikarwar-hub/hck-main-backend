import {
  BadRequestException,
  Controller,
  InternalServerErrorException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { Roles } from "../auth/roles.decorator";
import { MAX_UPLOAD_BYTES, StorageService } from "../storage/storage.service";
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
  private readonly logger = new Logger(MlController.name);

  constructor(
    private readonly ml: MlService,
    private readonly detections: DetectionsService,
    private readonly structures: StructuresService,
    private readonly alerts: AlertsService,
    private readonly storage: StorageService
  ) {}

  // Uploading inspection media is a field/engineering action. Viewers
  // (public-read) must not be able to inject detections or raise alerts.
  @Roles("inspector", "engineer", "admin")
  @Post(":structureId")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async ingest(@Param("structureId", new ParseUUIDPipe()) structureId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded (expected multipart field \"file\")");

    // Verify the real bytes before storing or sending anything downstream.
    this.storage.validate(file);

    const structure = await this.structures.findOne(structureId); // throws 404 if unknown

    // Store first: a detection row pointing at an image that was never
    // persisted is worse than a failed upload the user can retry.
    const stored = await this.storage.upload(file.buffer, {
      folder: `vigileye/structures/${structureId}`,
      resourceType: file.mimetype.startsWith("video/") ? "video" : "image",
    });

    const result = await this.ml.predict(file.buffer, file.originalname);

    const created: Detection[] = [];
    try {
      for (const p of result.predictions) {
        const detection: Detection = {
          id: randomUUID(),
          structureId,
          imageUrl: stored.url,
          annotatedImageUrl: p.maskUrl ?? stored.url,
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
    } catch (error) {
      // Persistence is the last stage. Without this the analysis has already
      // succeeded and the image is already stored, but a DB failure would
      // still surface as a bare 500 that names no stage at all.
      this.logger.error(
        `Failed to persist detections for structure ${structureId}`,
        error instanceof Error ? error.stack : String(error)
      );
      throw new InternalServerErrorException(
        "The image was analysed but its results could not be saved. Please try again."
      );
    }

    return { modelVersion: result.modelVersion, inferenceMs: result.inferenceMs, detections: created };
  }
}