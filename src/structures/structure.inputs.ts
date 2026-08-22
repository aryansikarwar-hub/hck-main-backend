import { Field, Float, InputType, Int } from "@nestjs/graphql";
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Severity, StructureType } from "../common/enums";

/**
 * Zone ids group structures for the map's aggregate risk heatmap. Constrained
 * to a slug so the frontend can turn "zone-north-bay" into "North Bay" for
 * display without guessing at arbitrary user input.
 */
const ZONE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@InputType()
export class CreateStructureInput {
  @Field()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Field(() => StructureType)
  @IsEnum(StructureType)
  type: StructureType;

  @Field(() => Float)
  @IsLatitude()
  lat: number;

  @Field(() => Float)
  @IsLongitude()
  lng: number;

  /**
   * Optional at creation. A structure nobody has inspected yet has no risk
   * level to report — defaulting it to anything would be inventing an
   * assessment. StructuresService falls back to LOW only because the column
   * is non-nullable; see the note there.
   */
  @Field(() => Severity, { nullable: true })
  @IsOptional()
  @IsEnum(Severity)
  riskLevel?: Severity;

  /** ISO date (YYYY-MM-DD or a full timestamp). Defaults to today. */
  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  lastInspected?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  criticalityWeight?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(ZONE_ID_PATTERN, {
    message: 'zoneId must be a lowercase slug, e.g. "zone-north-bay"',
  })
  zoneId?: string;
}

/**
 * Every field optional: this is a partial update, and PATCH semantics mean an
 * omitted field is "leave it alone", not "clear it".
 *
 * activeDetections is deliberately absent. It is derived — the ingest pipeline
 * increments it when the model finds a crack (see MlController) — so letting a
 * client set it by hand would let the UI's "4 active detections" disagree with
 * the four detection rows that actually exist.
 */
@InputType()
export class UpdateStructureInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @Field(() => StructureType, { nullable: true })
  @IsOptional()
  @IsEnum(StructureType)
  type?: StructureType;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @Field(() => Severity, { nullable: true })
  @IsOptional()
  @IsEnum(Severity)
  riskLevel?: Severity;

  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  lastInspected?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  criticalityWeight?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(ZONE_ID_PATTERN, {
    message: 'zoneId must be a lowercase slug, e.g. "zone-north-bay"',
  })
  zoneId?: string;
}
