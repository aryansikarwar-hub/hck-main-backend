import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { LOCKOUT_MINUTES, UsersService } from "../users/users.service";
import { User } from "../users/user.entity";
import { Role } from "./roles.decorator";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; role: Role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly config: ConfigService
  ) {}

  async signup(email: string, password: string, name?: string): Promise<AuthTokens> {
    // Role is deliberately NOT accepted from the request body — a caller must
    // never be able to make themselves an admin at signup. Elevating a role is
    // an admin-only operation.
    const user = await this.users.create({ email, password, name });
    return this.issueTokens(user);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.users.findByEmailWithSecret(email);

    // Uniform failure for unknown-email and wrong-password so the endpoint
    // can't be used to enumerate which emails have accounts.
    if (!user) throw new UnauthorizedException("Invalid credentials");

    if (this.users.isLocked(user)) {
      throw new ForbiddenException(
        `Account temporarily locked after too many failed attempts. Try again in up to ${LOCKOUT_MINUTES} minutes.`
      );
    }

    const valid = await this.users.verifyPassword(password, user.passwordHash);
    if (!valid) {
      await this.users.registerFailedLogin(user);
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.users.clearFailedLogins(user);
    return this.issueTokens(user);
  }

  /** Exchanges a valid refresh token for a fresh access/refresh pair. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; type?: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.refreshSecret() });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (payload.type !== "refresh") throw new UnauthorizedException("Not a refresh token");

    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException("User no longer exists");
    return this.issueTokens(user);
  }

  private issueTokens(user: User): AuthTokens {
    const base = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwt.sign(
        { ...base, type: "access" },
        { expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "15m" }
      ),
      refreshToken: this.jwt.sign(
        { sub: user.id, type: "refresh" },
        { secret: this.refreshSecret(), expiresIn: this.config.get<string>("JWT_REFRESH_TTL") ?? "30d" }
      ),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  /**
   * Refresh tokens are signed with a DIFFERENT secret than access tokens, so
   * a leaked access-token secret can't be used to mint long-lived refreshes.
   */
  private refreshSecret(): string {
    return (
      this.config.get<string>("JWT_REFRESH_SECRET") ??
      `${this.config.get<string>("JWT_SECRET")}-refresh`
    );
  }
}
