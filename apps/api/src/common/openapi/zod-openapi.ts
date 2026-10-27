import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiResponse, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

/*
 * OpenAPI from the shared Zod contracts (D-077): Zod 4's built-in JSON Schema output, in its OpenAPI 3.0 dialect, is
 * handed to @nestjs/swagger, so the documented shapes are the validated shapes — one source, no hand-written DTOs.
 */

export function zodToOpenApi(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
}

/** Documents a request body with its contract schema (validation itself is `ZodValidationPipe`). */
export function ApiZodBody(schema: z.ZodType) {
  return applyDecorators(ApiBody({ schema: zodToOpenApi(schema) }));
}

/** Documents a response with its contract schema. */
export function ApiZodResponse(status: number, schema: z.ZodType, description?: string) {
  return applyDecorators(
    ApiResponse({
      status,
      description,
      schema: z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' }) as SchemaObject,
    }),
  );
}
