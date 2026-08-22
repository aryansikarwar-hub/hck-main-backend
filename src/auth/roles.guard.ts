import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ROLES_KEY, Role } from "./roles.decorator";

/**
 * Re-validates role access at the service layer (not just the frontend, and
 * not just the API gateway) — see PRD Section 14. Reads req.user.role,
 * populated by JwtStrategy after JwtAuthGuard runs.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req ?? context.switchToHttp().getRequest();
    const user = req?.user;
    return !!user && required.includes(user.role);
  }
}
