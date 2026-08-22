import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

/**
 * Normalises every REST error into a single shape:
 *   { error: { code, message, details? } }
 *
 * Also stops unexpected exceptions leaking stack traces or driver messages
 * to the client — those go to the logs, the client gets a generic 500.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    // GraphQL errors are formatted by Apollo, not here.
    if (host.getType<string>() === "graphql") throw exception;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = "Internal server error";
    let details: unknown;

    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object") {
        const b = body as { message?: string | string[]; error?: string };
        // class-validator returns message as an array of field errors
        if (Array.isArray(b.message)) {
          message = b.error ?? "Validation failed";
          details = b.message;
        } else {
          message = b.message ?? b.error ?? message;
        }
      }
    } else {
      this.logger.error(`Unhandled ${request.method} ${request.url}`, describeUnknownError(exception));
    }

    response.status(status).json({
      error: {
        code: HttpStatus[status] ?? "INTERNAL_SERVER_ERROR",
        message,
        ...(details ? { details } : {}),
      },
    });
  }
}

/**
 * Renders an unknown thrown value into something a log reader can act on.
 *
 * `String(exception)` was used here, which prints "[object Object]" for any
 * thrown plain object — and several SDKs (Cloudinary among them) reject with
 * plain objects like { message, name, http_code } rather than Errors. The
 * result was a 500 in the logs with literally no information about its cause.
 */
function describeUnknownError(exception: unknown): string {
  if (exception instanceof Error) return exception.stack ?? `${exception.name}: ${exception.message}`;

  if (exception && typeof exception === "object") {
    try {
      // Include non-enumerable props too — SDK error objects often hide
      // `message` behind one.
      const own = Object.getOwnPropertyNames(exception).reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = (exception as Record<string, unknown>)[key];
        return acc;
      }, {});
      return JSON.stringify(own);
    } catch {
      return Object.prototype.toString.call(exception);
    }
  }

  return String(exception);
}