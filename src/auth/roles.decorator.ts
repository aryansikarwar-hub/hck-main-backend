import { SetMetadata } from "@nestjs/common";

export type Role = "inspector" | "engineer" | "admin" | "public-read";

export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
