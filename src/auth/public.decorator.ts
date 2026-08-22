import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route/resolver as reachable without a JWT.
 *
 * JwtAuthGuard is registered GLOBALLY (see app.module.ts), so the default for
 * every endpoint is "authentication required". Opting out is explicit and
 * greppable — which is the opposite of the previous state, where guards
 * existed but were applied nowhere and everything was silently public.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
