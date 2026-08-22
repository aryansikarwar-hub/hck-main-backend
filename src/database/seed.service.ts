import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Structure } from "../structures/structure.entity";
import { Detection } from "../detections/detection.entity";
import { Alert } from "../alerts/alert.entity";
import { CaptureSource, Severity, StructureType } from "../common/enums";

/**
 * Inserts the original demo dataset into Postgres exactly once, on first
 * boot against an empty database (checks structures.count() === 0). Links
 * detections/alerts to structures using the real generated UUIDs rather
 * than the old hardcoded "str-001" style ids, since Postgres's uuid column
 * type only accepts real UUIDs.
 */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Structure) private readonly structures: Repository<Structure>,
    @InjectRepository(Detection) private readonly detections: Repository<Detection>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>
  ) {}

  async onModuleInit() {
    const existing = await this.structures.count();
    if (existing > 0) return; // already seeded, skip

    this.logger.log("Empty database detected — seeding demo dataset...");

    const [riverside, northDam] = await this.structures.save([
      this.structures.create({
        name: "Riverside Bridge",
        type: StructureType.BRIDGE,
        lat: 37.7955,
        lng: -122.3937,
        riskLevel: Severity.CRITICAL,
        lastInspected: "2026-08-12",
        activeDetections: 4,
      }),
      this.structures.create({
        name: "North Dam Spillway",
        type: StructureType.DAM,
        lat: 37.9101,
        lng: -122.271,
        riskLevel: Severity.HIGH,
        lastInspected: "2026-07-30",
        activeDetections: 2,
      }),
      this.structures.create({
        name: "City Hall Parking Structure",
        type: StructureType.BUILDING,
        lat: 37.7793,
        lng: -122.4192,
        riskLevel: Severity.MEDIUM,
        lastInspected: "2026-08-01",
        activeDetections: 3,
      }),
      this.structures.create({
        name: "Harbor Tunnel — East Bore",
        type: StructureType.TUNNEL,
        lat: 37.808,
        lng: -122.4103,
        riskLevel: Severity.LOW,
        lastInspected: "2026-08-15",
        activeDetections: 1,
      }),
      this.structures.create({
        name: "Union Ave Overpass",
        type: StructureType.BRIDGE,
        lat: 37.7605,
        lng: -122.4194,
        riskLevel: Severity.MEDIUM,
        lastInspected: "2026-06-22",
        activeDetections: 2,
      }),
    ]);

    const [det101, det102] = await this.detections.save([
      this.detections.create({
        structureId: riverside.id,
        imageUrl: "/mock/crack-1-raw.jpg",
        annotatedImageUrl: "/mock/crack-1-annotated.jpg",
        crackType: "diagonal",
        widthMm: 4.8,
        lengthCm: 38,
        severity: Severity.CRITICAL,
        confidence: 0.94,
        location: "Pier 3, west face",
        capturedAt: "2026-08-18T14:32:00Z",
        capturedBy: CaptureSource.UAV,
        forecast: {
          criticalThresholdMm: 5,
          projectedCriticalDate: "2026-10-05",
          growthRateMmPerMonth: 0.15,
          confidence: "high",
        },
        repairBrief: {
          summary:
            "4.8mm diagonal crack detected on Pier 3, west face, consistent with shear stress. Growth trend projects the 5mm critical threshold will be crossed within ~7 weeks.",
          recommendedAction: "Structural engineer inspection and shoring assessment",
          recommendedTimeframeDays: 14,
          generatedAt: "2026-08-18T15:00:00Z",
        },
      }),
      this.detections.create({
        structureId: northDam.id,
        imageUrl: "/mock/crack-2-raw.jpg",
        annotatedImageUrl: "/mock/crack-2-annotated.jpg",
        crackType: "map",
        widthMm: 2.1,
        lengthCm: 120,
        severity: Severity.HIGH,
        confidence: 0.88,
        location: "Spillway face, section B",
        capturedAt: "2026-08-17T09:10:00Z",
        capturedBy: CaptureSource.FIXED_CAMERA,
      }),
    ]);

    await this.alerts.save([
      this.alerts.create({
        structureId: riverside.id,
        structureName: riverside.name,
        detectionId: det101.id,
        severity: Severity.CRITICAL,
        message: "Critical crack growth detected on Pier 3 — projected critical in ~7 weeks.",
        createdAt: "2026-08-18T14:35:00Z",
        acknowledged: false,
      }),
      this.alerts.create({
        structureId: northDam.id,
        structureName: northDam.name,
        detectionId: det102.id,
        severity: Severity.HIGH,
        message: "New map cracking pattern detected in spillway section B.",
        createdAt: "2026-08-17T09:12:00Z",
        acknowledged: false,
      }),
    ]);

    this.logger.log("Seed complete: 5 structures, 2 detections, 2 alerts.");
  }
}
