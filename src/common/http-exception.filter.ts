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
      this.logger.error(
        `Unhandled ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception)
      );
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
