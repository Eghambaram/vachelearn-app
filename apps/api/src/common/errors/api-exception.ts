import { HttpException } from '@nestjs/common';

/*
 * The API's own error type. Services throw it with a stable code; the global filter turns it (and every other error)
 * into the error envelope. Status meanings (CLAUDE.md): 401 unauthenticated · 403 forbidden · 404 hidden or missing
 * · 409 state conflict · 422 validation.
 */

export type FieldError = { field: string; code: string; message: string };

export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: readonly FieldError[],
  ) {
    super(message, status);
  }

  static notFound() {
    return new ApiException(404, 'NOT_FOUND', 'Not found');
  }

  static validation(fieldErrors: readonly FieldError[]) {
    return new ApiException(422, 'VALIDATION_FAILED', 'Invalid request', fieldErrors);
  }
}
