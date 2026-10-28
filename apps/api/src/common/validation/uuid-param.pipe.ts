import type { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { ApiException } from '../errors/api-exception';

const Uuid = z.uuid();

/**
 * Path ids: anything that is not a UUID is a 404, the same answer as a missing or out-of-scope record, so an id's
 * shape never tells a caller more than its existence would.
 */
export class UuidParamPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const parsed = Uuid.safeParse(value);
    if (!parsed.success) throw ApiException.notFound();
    return parsed.data;
  }
}
