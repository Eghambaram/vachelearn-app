import {
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, mergeMap, type Observable } from 'rxjs';
import type { WithContext } from '../access/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

/*
 * D-099 (2): a support session's read of one record is audited with the record the API resolved inside the tenant —
 * the id taken from the answer (which exists only because the scoped lookup found it), never from the URL or query.
 * The access guard already recorded `support.accessed` for the request; this adds `support.viewed` with the record.
 */

const SUPPORT_VIEW = Symbol('SUPPORT_VIEW');

/**
 * Marks a detail route: in support sessions, record the viewed record (`entityType`, id from the answer's `idField`).
 * Only for routes whose service resolves that id inside `ctx.tenant` (a 404 otherwise): the id is trusted because the
 * answer exists. If writing the row fails the request fails (fail closed: no unrecorded support view).
 */
export const RecordSupportView = (entityType: string, idField = 'id') =>
  SetMetadata(SUPPORT_VIEW, { entityType, idField });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class SupportViewInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const mark = this.reflector.get<{ entityType: string; idField: string } | undefined>(
      SUPPORT_VIEW,
      context.getHandler(),
    );
    const ctx = context.switchToHttp().getRequest<WithContext>().vlContext;
    if (!mark || !ctx?.support) return next.handle();
    const support = ctx.support;
    return next.handle().pipe(
      mergeMap((body: unknown) => {
        const id = (body as Record<string, unknown> | null)?.[mark.idField];
        if (typeof id !== 'string' || !UUID.test(id)) return from([body]);
        return from(
          this.audit
            .record(this.prisma, {
              actorUserId: ctx.userId,
              tenantId: support.tenantId,
              action: 'support.viewed',
              entityType: mark.entityType,
              entityId: id,
              requestId: ctx.requestId,
              supportSessionId: support.sessionId,
            })
            .then(() => body),
        );
      }),
    );
  }
}
