import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { GqlExecutionContext } from "@nestjs/graphql";

/** Header the Next.js BFF uses to pass along the real browser IP. */
export const CLIENT_IP_HEADER = "x-vigileye-client-ip";

/**
 * ThrottlerGuard reads req/res off the HTTP context, which is undefined for
 * GraphQL resolvers — without this override, rate limiting silently does
 * nothing on /graphql (the majority of this API's surface).
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext();
    if (ctx?.req) return { req: ctx.req, res: ctx.req.res };
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }

  /**
   * Rate-limit key.
   *
   * The browser never calls this API directly: the Next.js app proxies every
   * auth request server-side (frontend/src/app/api/auth/*), so `req.ip` is
   * Vercel's egress address for ALL users. That turned "5 signups per hour per
   * IP" into "5 signups per hour, worldwide" — measured, a 4th signup attempt
   * came back 429 and stayed there. Login had the same shape at 10/15min.
   *
   * The proxy therefore forwards the browser's address in CLIENT_IP_HEADER and
   * we key on that. The header is only trusted because the proxy is ours and
   * the API is not meant to be called from anywhere else; a client that sets
   * it directly can already vary its own source IP, so this grants no ability
   * it did not have. It does NOT authorize anything — only bucketing.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req?.headers?.[CLIENT_IP_HEADER];
    const claimed = Array.isArray(forwarded) ? forwarded[0] : forwarded;

    if (typeof claimed === "string" && claimed.trim()) {
      // Take the first hop only: the header can carry a chain.
      return claimed.split(",")[0].trim();
    }

    return req?.ip ?? "unknown";
  }
}
