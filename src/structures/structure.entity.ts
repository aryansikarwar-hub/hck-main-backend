import { Field, Float, ID, Int, ObjectType } from "@nestjs/graphql";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { Severity, StructureType } from "../common/enums";
import { Detection } from "../detections/detection.entity";

/**
 * TypeORM entity backed by PostgreSQL + PostGIS in production (lat/lng would
 * become a `geography(Point, 4326)` column with a GiST index for
 * nearest-structure / bounding-box queries — see docs in ../ml-model and the
 * PRD's Data Architecture section). Kept as plain floats here so the API
 * layer works against StructuresService's in-memory store until Postgres is
 * wired up via TypeOrmModule in app.module.ts.
 */
@ObjectType()
@Index(["riskLevel"])
@Index(["zoneId"])
@Entity("structures")
export class Structure {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  name: string;

  @Field(() => StructureType)
  @Column({ type: "varchar" })
  type: StructureType;

  @Field(() => Float)
  @Column("double precision")
  lat: number;

  @Field(() => Float)
  @Column("double precision")
  lng: number;

  @Field(() => Severity)
  @Column({ type: "varchar" })
  riskLevel: Severity;

  @Field()
  @Column()
  lastInspected: string;

  @Field(() => Int)
  @Column({ default: 0 })
  activeDetections: number;

  /**
   * How costly a failure of this structure would be (1 low - 3 high): traffic
   * volume, population served, redundancy. Feeds the budget simulator's
   * priority score alongside severity and time-to-critical.
   */
  @Field(() => Int)
  @Column({ type: "smallint", default: 1 })
  criticalityWeight: number;

  /** District/zone grouping, used to aggregate the city-wide risk heatmap. */
  @Field()
  @Column({ default: "unzoned" })
  zoneId: string;

  @Field(() => [Detection], { nullable: true })
  detections?: Detection[];
}
