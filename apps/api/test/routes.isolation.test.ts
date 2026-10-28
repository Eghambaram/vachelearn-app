import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import type { Type } from '@nestjs/common';
import request from 'supertest';
import { PUBLIC, REQUIRES, type Requirement } from '../src/access/access.guard';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config/env';
import { createTestApp } from './app';
import { TEST_ACTOR_HEADER } from './actors';

/*
 * Every route of the real application declares exactly one access rule (deny by default, CLAUDE.md): `@Public()` or a
 * permission — never both, never neither — and platform routes (`platform/**`) require a platform permission while
 * every other protected route requires a tenant permission. A new controller that forgets this fails here.
 */

type Route = { path: string; handler: string; isPublic: boolean; requirement?: Requirement };

function routesOf(controller: Type): Route[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
  const classPublic = Reflect.getMetadata(PUBLIC, controller) === true;
  const classRequires = Reflect.getMetadata(REQUIRES, controller) as Requirement | undefined;
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
    .map((name) => proto[name] as object)
    .filter((fn) => Reflect.getMetadata(METHOD_METADATA, fn) !== undefined)
    .map((fn) => ({
      path: `${base}/${String(Reflect.getMetadata(PATH_METADATA, fn) ?? '')}`.replace(/\/+$/, ''),
      handler: `${controller.name}.${(fn as { name: string }).name}`,
      isPublic: classPublic || Reflect.getMetadata(PUBLIC, fn) === true,
      requirement: (Reflect.getMetadata(REQUIRES, fn) as Requirement | undefined) ?? classRequires,
    }));
}

const config = loadConfig({ ...process.env, LOG_LEVEL: 'silent' });
const controllers = (AppModule.forRoot(config).controllers ?? []) as Type[];
const routes = controllers.flatMap(routesOf);

describe('route access declarations', () => {
  it('finds the application routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(10);
  });

  it.each(routes)('$handler ($path) is either public or names one permission', (route) => {
    expect(route.isPublic !== (route.requirement !== undefined)).toBe(true);
  });

  it.each(routes.filter((r) => r.requirement))(
    '$handler: platform/** ⇔ platform permission',
    (route) => {
      expect(route.path.startsWith('platform/') || route.path === 'platform').toBe(
        route.requirement!.scope === 'platform',
      );
    },
  );
});

describe('the production module has no test caller hook', () => {
  it('ignores the test actor header: every protected route is 401 without a session', async () => {
    const { app } = await createTestApp();
    try {
      for (const path of ['/api/v1/platform/tenants', '/api/v1/branches']) {
        const res = await request(app.getHttpServer()).get(path).set(TEST_ACTOR_HEADER, 'platform');
        expect(res.status).toBe(401);
      }
    } finally {
      await app.close();
    }
  });
});
