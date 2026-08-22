import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Args, Context, ID, Mutation, Query, Resolver } from "@nestjs/graphql";
import { User } from "./user.entity";
import { UsersService } from "./users.service";
import { Roles, type Role } from "../auth/roles.decorator";
import type { AuthenticatedUser } from "../auth/jwt.strategy";

const ASSIGNABLE_ROLES: Role[] = ["inspector", "engineer", "admin", "public-read"];

/**
 * Admin-facing user management.
 *
 * UsersService.setRole existed from the start but nothing exposed it, so the
 * only account that could ever be an admin was the one BOOTSTRAP_ADMIN_EMAIL
 * created — every other user was permanently an inspector, unable to register
 * a structure, with no in-app way to change that. The dashboard's /admin page
 * showed a "Roles & access" table that described permissions it had no power
 * to grant.
 */
@Resolver(() => User)
export class UsersResolver {
  // Named usersService, not users: the class also declares a `users` query
  // method, and a constructor property of the same name collides with it.
  constructor(private readonly usersService: UsersService) {}

  @Roles("admin")
  @Query(() => [User], { description: "All accounts, for the admin user-management table" })
  users(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Roles("admin")
  @Mutation(() => User, { description: "Change an account's role" })
  async setUserRole(
    @Args("id", { type: () => ID }) id: string,
    @Args("role", { type: () => String }) role: string,
    @Context() ctx: { req: { user: AuthenticatedUser } }
  ): Promise<User> {
    if (!ASSIGNABLE_ROLES.includes(role as Role)) {
      throw new BadRequestException(`Unknown role "${role}". Expected one of: ${ASSIGNABLE_ROLES.join(", ")}.`);
    }

    // An admin demoting themselves can strand the system with no admin at
    // all, and there is no path back short of redeploying with
    // BOOTSTRAP_ADMIN_*. Blocking the self-demote is cheaper than that
    // recovery, and another admin can still demote them.
    if (ctx.req.user.userId === id && role !== "admin") {
      throw new ForbiddenException(
        "You cannot remove your own admin role. Ask another admin to do it."
      );
    }

    return this.usersService.setRoleAndReturn(id, role as Role);
  }
}
