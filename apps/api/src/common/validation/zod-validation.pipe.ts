import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiException } from '../errors/api-exception';

/**
 * Validates a route's params, query or body against a shared `packages/contracts` schema (D-035, D-077). Contracts
 * declare `.strict()` objects, so unknown fields — including any client-sent `tenantId` — are rejected. Failures are a
 * 422 envelope with one `fieldErrors` entry per issue; the parsed (coerced, defaulted) value is what the handler gets.
 *
 *   @Body(new ZodValidationPipe(CreateTenantBody)) body: CreateTenantBody
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw ApiException.validation(
      parsed.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.') || '(root)',
        code: issue.code,
        message: issue.message,
      })),
    );
  }
}
