import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { UsersService } from "./users.service";
import { env } from "../config/env";

/**
 * Creates the first admin account on boot.
 *
 * Without this there is no path to an admin at all: signup deliberately
 * ignores any role in the request body (so nobody can self-promote), which
 * would otherwise leave the system with no one able to manage users or
 * models.
 *
 * Guards on this are deliberate:
 *  - only runs when BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are set
 *  - only runs when NO admin exists yet, so it cannot be used to silently
 *    re-grant admin later or reset an existing account's password
 *  - the env vars should be removed once the account exists
 */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(private readonly users: UsersService) {}

  async onModuleInit(): Promise<void> {
    const email = env("BOOTSTRAP_ADMIN_EMAIL");
    const password = env("BOOTSTRAP_ADMIN_PASSWORD");
    if (!email || !password) return;

    if (await this.users.adminExists()) {
      this.logger.log("An admin already exists — skipping bootstrap. You can remove BOOTSTRAP_ADMIN_* now.");
      return;
    }

    if (password.length < 12) {
      this.logger.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters. Skipping bootstrap.");
      return;
    }

    const existing = await this.users.findByEmail(email);
    if (existing) {
      await this.users.setRole(existing.id, "admin");
      this.logger.warn(`Promoted existing user ${email} to admin.`);
      return;
    }

    await this.users.create({ email, password, name: "Administrator", role: "admin" });
    this.logger.warn(
      `Created bootstrap admin ${email}. Remove BOOTSTRAP_ADMIN_EMAIL/PASSWORD from the environment now.`
    );
  }
}
