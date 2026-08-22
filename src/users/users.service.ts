import { ConflictException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { User } from "./user.entity";
import { Role } from "../auth/roles.decorator";

/** Work factor for bcrypt. 12 is the current sensible production default. */
const BCRYPT_ROUNDS = 12;

/** Lockout policy — see AuthService.login for how these are applied. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  /**
   * Loads a user WITH the password hash. Separate from findByEmail so the
   * hash is only ever pulled when a credential check genuinely needs it.
   */
  findByEmailWithSecret(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder("user")
      .addSelect(["user.passwordHash", "user.failedLoginAttempts", "user.lockedUntil"])
      .where("user.email = :email", { email: email.toLowerCase().trim() })
      .getOne();
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async create(params: { email: string; password: string; name?: string; role?: Role }): Promise<User> {
    const email = params.email.toLowerCase().trim();
    if (await this.findByEmail(email)) {
      throw new ConflictException("An account with that email already exists");
    }
    const user = this.users.create({
      email,
      passwordHash: await bcrypt.hash(params.password, BCRYPT_ROUNDS),
      name: params.name ?? "",
      role: params.role ?? "inspector",
    });
    return this.users.save(user);
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /** True while the account is inside its lockout window. */
  isLocked(user: User): boolean {
    return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
  }

  async registerFailedLogin(user: User): Promise<void> {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil ?? null;
    await this.users.update(user.id, { failedLoginAttempts: attempts, lockedUntil });
  }

  async clearFailedLogins(user: User): Promise<void> {
    if (!user.failedLoginAttempts && !user.lockedUntil) return;
    await this.users.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
  }

  count(): Promise<number> {
    return this.users.count();
  }

  adminExists(): Promise<boolean> {
    return this.users.exists({ where: { role: "admin" } });
  }

  /** Role changes are an admin-only operation — never driven by user input. */
  async setRole(id: string, role: Role): Promise<void> {
    await this.users.update(id, { role });
  }
}
