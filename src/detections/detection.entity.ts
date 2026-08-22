import { Field, Float, ID, ObjectType } from "@nestjs/graphql";
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { CaptureSource, Severity } from "../common/enums";

@ObjectType()
export class Forecast {
  @Field(() => Float)
  criticalThresholdMm: number;

  @Field()
  projectedCriticalDate: string;

  @Field(() => Float)
  growthRateMmPerMonth: number;

  @Field()
  confidence: "low" | "medium" | "high";
}

@ObjectType()
export class RepairBrief {
  @Field()
  summary: string;

  @Field()
  recommendedAction: string;

  @Field()
  recommendedTimeframeDays: number;

  @Field()
  generatedAt: string;
}

/**
 * One detection = one crack instance, produced by the ML inference API
 * (see ../ml-model/service) and enriched here with severity, tracking, a
 * forecast, and — for confirmed high-severity detections — a repair brief.
 */
@ObjectType()
@Entity("detections")
export class Detection {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  structureId: string;

  @Field()
  @Column()
  imageUrl: string;

  @Field()
  @Column()
  annotatedImageUrl: string;

  @Field()
  @Column()
  crackType: string;

  @Field(() => Float)
  @Column("double precision")
  widthMm: number;

  @Field(() => Float)
  @Column("double precision")
  lengthCm: number;

  @Field(() => Severity)
  @Column({ type: "varchar" })
  severity: Severity;

  @Field(() => Float)
  @Column("double precision")
  confidence: number;

  @Field()
  @Column()
  location: string;

  @Field()
  @Column()
  capturedAt: string;

  @Field(() => CaptureSource)
  @Column({ type: "varchar" })
  capturedBy: CaptureSource;

  @Field(() => Forecast, { nullable: true })
  @Column("jsonb", { nullable: true })
  forecast?: Forecast;

  @Field(() => RepairBrief, { nullable: true })
  @Column("jsonb", { nullable: true })
  repairBrief?: RepairBrief;
}
