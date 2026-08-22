import { Field, ID, ObjectType } from "@nestjs/graphql";
import { Column, Entity, PrimaryGeneratedColumn, Index } from "typeorm";
import { Severity } from "../common/enums";

/**
 * TypeORM entity backed by PostgreSQL. Alerts are produced by
 * severity-tracking logic (see MlModule) whenever a detection crosses a
 * severity threshold, and consumed here by the dashboard inbox and, in
 * production, the notification service (push/email/SMS/webhook fan-out) —
 * folded into this single NestJS app for now rather than split into the
 * PRD's separate microservices.
 */
@ObjectType()
// The inbox is always "unacknowledged first, newest first".
@Index(["acknowledged", "createdAt"])
@Index(["structureId"])
@Entity("alerts")
export class Alert {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  structureId: string;

  @Field()
  @Column()
  structureName: string;

  @Field()
  @Column()
  detectionId: string;

  @Field(() => Severity)
  @Column({ type: "varchar" })
  severity: Severity;

  @Field()
  @Column()
  message: string;

  @Field()
  @Column()
  createdAt: string;

  @Field()
  @Column({ default: false })
  acknowledged: boolean;
}
