import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";
import { Role } from "./roles.decorator";

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  type?: string;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService
  ) {
    const secret = config.get<string>("JWT_SECRET");
    if (!secret) {
      // Fail loudly at boot rather than silently signing with a default —
      // a predictable secret means anyone can mint valid admin tokens.
      throw new Error("JWT_SECRET is not set. Refusing to start with an insecure default.");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Refresh tokens must never be accepted as access tokens.
    if (payload.type && payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type");
    }

    // Re-check the user on every request: a token issued before the account
    // was deleted or had its role changed must not keep working.
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException("User no longer exists");

    return { userId: user.id, email: user.email, role: user.role };
  }
}
