import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../src/access/access.guard';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { z } from 'zod';
import { ApiErrorBody } from '@vachelearn/contracts';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';
import { WEB, createTestApp } from './app';

const Probe = z.strictObject({
  name: z.string().min(3),
  limit: z.coerce.number().int().max(100).default(25),
});

/** Test-only routes: a validated body, a validated query, and an unexpected failure. */
@Public()
@Controller('test-probe')
class ProbeController {
  @Post()
  create(@Body(new ZodValidationPipe(Probe)) body: z.output<typeof Probe>) {
    return { received: body };
  }

  @Get()
  list(@Query(new ZodValidationPipe(Probe.partial())) query: object) {
    return { query };
  }

  @Get('boom')
  boom(): never {
    throw new Error('database password is hunter2 at db.internal:5432');
  }
}

let app: INestApplication;
beforeAll(async () => {
  ({ app } = await createTestApp({ controllers: [ProbeController] }));
});
afterAll(async () => {
  await app.close();
});

/** Every non-2xx body must parse as the shared envelope and carry the request ID that the header carries. */
function expectEnvelope(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = ApiErrorBody.parse(res.body);
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(res.headers['x-request-id']);
  return body;
}

describe('error envelope (spec §17)', () => {
  it('unknown route → 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope');
    expectEnvelope(res, 404, 'NOT_FOUND');
  });

  it('invalid body → 422 with one field error per problem, unknown fields rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test-probe')
      .set('origin', WEB)
      .send({ name: 'ab', limit: 1000, tenantId: 'demo-tenant-2' });
    const body = expectEnvelope(res, 422, 'VALIDATION_FAILED');
    expect(body.error.fieldErrors?.map((f) => f.field).sort()).toEqual(['(root)', 'limit', 'name']);
    expect(body.error.fieldErrors?.find((f) => f.field === '(root)')?.code).toBe(
      'unrecognized_keys',
    );
  });

  it('valid body → handler gets the parsed, defaulted value', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test-probe')
      .set('origin', WEB)
      .send({ name: 'abc' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: { name: 'abc', limit: 25 } });
  });

  it('invalid query → 422', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/test-probe?limit=abc');
    expectEnvelope(res, 422, 'VALIDATION_FAILED');
  });

  it('malformed JSON → 400 BAD_REQUEST with fixed wording', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test-probe')
      .set('origin', WEB)
      .set('content-type', 'application/json')
      .send('{"name": ');
    const body = expectEnvelope(res, 400, 'BAD_REQUEST');
    expect(body.error.message).toBe('Bad request');
  });

  it('unexpected error → 500 INTERNAL, no stack or internal detail in the response', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/test-probe/boom');
    const body = expectEnvelope(res, 500, 'INTERNAL');
    expect(body.error.message).toBe('Internal error');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|db\.internal|stack|at /);
  });
});

describe('request IDs', () => {
  it('always generates the id server-side, even when the client sends one (no reuse of another request id)', async () => {
    const sent = 'trace-1234abcd';
    const first = await request(app.getHttpServer()).get('/api/v1/nope').set('x-request-id', sent);
    const second = await request(app.getHttpServer()).get('/api/v1/nope').set('x-request-id', sent);
    for (const res of [first, second]) {
      expect(res.headers['x-request-id']).toMatch(/^req_[0-9a-f-]{36}$/);
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    }
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('gives every request an id, with or without a client header', async () => {
    const unsafe = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('x-request-id', 'bad id <script>alert(1)</script>');
    expect(unsafe.headers['x-request-id']).toMatch(/^req_[0-9a-f-]{36}$/);
    const missing = await request(app.getHttpServer()).get('/health');
    expect(missing.headers['x-request-id']).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it('does not advertise the framework', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
