import { z } from 'zod';
import { defineJob, JobRegistry } from '../src/jobs/job-handlers';
import { JobsService } from '../src/jobs/jobs.service';
import { createTestApp } from './app';
import { resetDatabase, testPrisma } from './db';

/* The in-process worker (JOBS_WORKER=true) picks up a committed job without anyone calling it, and stops cleanly. */

it('runs a queued job in the background and stops on shutdown', async () => {
  const db = testPrisma();
  await resetDatabase(db);
  const { app } = await createTestApp({ env: { JOBS_WORKER: 'true' } });
  try {
    let ran = 0;
    app.get(JobRegistry).register(
      defineJob({
        type: 'test.background',
        payload: z.object({}).strict(),
        run: async () => {
          ran++;
        },
      }),
    );
    await app.get(JobsService).enqueue({ type: 'test.background', businessKey: 'bg', payload: {} });
    await vi.waitFor(
      async () => expect((await db.job.findFirstOrThrow()).status).toBe('succeeded'),
      { timeout: 10_000, interval: 200 },
    );
    expect(ran).toBe(1);
  } finally {
    await app.close();
    await db.$disconnect();
  }
});
