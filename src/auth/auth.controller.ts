import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";
import type { AuthenticatedUser } from "./jwt.strategy";

class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10, { message: "Password must be at least 10 characters" })
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

class RefreshDto {
  @IsString()
  refreshToken: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 20 signups per hour per client IP — enough that a team onboarding
  // together doesn't lock itself out, tight enough to stop account farming.
  //
  // "per client IP" only became true once GqlThrottlerGuard started keying on
  // the address the Next.js BFF forwards. Before that every signup in the
  // world shared Vercel's egress IP and this limit was effectively global.
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Public()
  @Post("signup")
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto.email, dto.password, dto.name);
  }

  // 10 attempts per 15 min per IP. Complements the per-account lockout in
  // UsersService: IP throttling stops spraying many accounts, the account
  // lockout stops hammering one account from many IPs.
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Public()
  @HttpCode(200)
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @Public()
  @HttpCode(200)
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** Returns the caller identified by the bearer token — used by the frontend
   *  to restore a session on page load and to drive role-based UI. */
  @UseGuards(AuthGuard("jwt"))
  @Get("me")
  me(@Req() req: { user: AuthenticatedUser }) {
    return req.user;
  }
}
