import { Field, ID, ObjectType } from "@nestjs/graphql";
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Role } from "../auth/roles.decorator";

/**
 * Application user. Passwords are stored ONLY as bcrypt hashes — the hash
 * column is deliberately excluded from GraphQL (no @Field) and from default
 * selects (select: false) so it can never leak through a resolver or a
 * `find()` that forgets to project columns.
 *
 * Single-org model: there is no orgId here by design. If multi-tenancy is
 * added later it needs an orgId column plus a scoped index on (orgId, email).
 */
@ObjectType()
@Entity("users")
export class User {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Index({ unique: true })
  @Column()
  email: string;

  /** bcrypt hash — never exposed over GraphQL, never selected by default. */
  @Column({ select: false })
  passwordHash: string;

  @Field()
  @Column({ default: "" })
  name: string;

  @Field(() => String)
  @Column({ type: "varchar", default: "inspector" })
  role: Role;

  @Field()
  @Column({ default: false })
  emailVerified: boolean;

  // --- brute-force protection state ---
  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ type: "timestamptz", nullable: true })
  lockedUntil: Date | null;

  @Field()
  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;

  /** Soft delete — deactivating a user must never destroy their audit trail. */
  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deletedAt: Date | null;
}
