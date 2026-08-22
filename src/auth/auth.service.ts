import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

// Placeholder user store — replace with a Postgres `users` table + bcrypt
// password hashing. Shared by web (NextAuth.js) and mobile via this one
// backend auth service, per the PRD's "one account, both surfaces" design.
const USERS = [
  { id: "u-1", email: "engineer@vigileye.ai", password: "demo-password", role: "engineer" as const },
  { id: "u-2", email: "admin@vigileye.ai", password: "demo-password", role: "admin" as const },
];

@Injectable()
export class AuthService {
  constructor(private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = USERS.find((u) => u.email === email && u.password === password);
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: "15m" }),
      refreshToken: this.jwt.sign(payload, { expiresIn: "30d" }),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
