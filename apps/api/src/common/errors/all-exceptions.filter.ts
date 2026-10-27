import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ApiErrorBody } from '@vachelearn/contracts';
import { requestIdOf } from '../request-id';
import { ApiException } from './api-exception';

/** Stable codes for statuses raised by the framework itself (unknown route, malformed JSON, payload too large…). */
const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

/** Client-facing messages for framework errors: fixed text, never the framework's own wording or input echoes. */
const MESSAGE_BY_STATUS: Record<number, string> = {
  400: 'Bad request',
  401: 'Not signed in',
  403: 'Forbidden',
  404: 'Not found',
  405: 'Method not allowed',
  409: 'Conflict',
  413: 'Payload too large',
  415: 'Unsupported media type',
  422: 'Invalid request',
  429: 'Too many requests',
};

/**
 * Turns every error into the shared envelope `{ error: { code, message, requestId, fieldErrors? } }` (contract
 * `ApiErrorBody`). 5xx: a generic message to the client, the details (with stack) to the log — never the reverse.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = requestIdOf(req);

    let status = 500;
    let body: ApiErrorBody;
    if (exception instanceof ApiException) {
      status = exception.getStatus();
      body = {
        error: {
          code: exception.code,
          message: exception.message,
          requestId,
          ...(exception.fieldErrors ? { fieldErrors: [...exception.fieldErrors] } : {}),
        },
      };
    } else if (exception instanceof HttpException && exception.getStatus() < 500) {
      status = exception.getStatus();
      body = {
        error: {
          code: CODE_BY_STATUS[status] ?? 'REQUEST_ERROR',
          message: MESSAGE_BY_STATUS[status] ?? 'Request error',
          requestId,
        },
      };
    } else {
      if (exception instanceof HttpException) status = exception.getStatus();
      body = { error: { code: 'INTERNAL', message: 'Internal error', requestId } };
      // The `err` serializer keeps type, code, a scrubbed message and stack only (logging.module.ts).
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    }

    res.status(status).json(ApiErrorBody.parse(body));
  }
}
