import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { GqlExecutionContext } from "@nestjs/graphql";

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
}
