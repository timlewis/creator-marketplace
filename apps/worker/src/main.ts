import { createDb, createPool } from '@marketplace/db';
import pino from 'pino';
import { closeDueCampaigns } from './closing.js';
import type { CloseReport } from './closing.js';
import { loadWorkerConfig } from './config.js';
import { createRunState, recordRun, startHealthServer } from './observability.js';

/**
 * The closing worker runs in one of two shapes, and the choice is a deployment
 * decision rather than a correctness one:
 *
 *   --once   a single pass, then exit. This is what the Kubernetes CronJob runs.
 *   (loop)   a long-lived process waking on an interval. Simpler to run locally
 *            and on a single-machine host, and what the hosted demo uses.
 *
 * Both call the same `closeDueCampaigns`, and both rely on the database guards
 * rather than on the scheduler for safety - which is precisely why swapping one
 * for the other needs no thought.
 */

function logReport(logger: pino.Logger, report: CloseReport): void {
  for (const closed of report.closed) {
    logger.info(
      {
        campaignId: closed.campaignId,
        winners: closed.winnerCount,
        bids: closed.bidCount,
        awardedCents: closed.totalAwardedCents,
        budgetCents: closed.budgetCents,
      },
      `Closed "${closed.title}": ${closed.winnerCount} of ${closed.bidCount} bids won`,
    );
  }

  for (const failure of report.failures) {
    logger.error({ campaignId: failure.campaignId, err: failure.error }, 'Failed to close campaign');
  }

  // Quiet when there is nothing to do: a scheduled job that logs every idle
  // pass trains operators to ignore its output.
  if (report.scanned > 0) {
    logger.info(
      {
        scanned: report.scanned,
        closed: report.closed.length,
        skipped: report.skipped,
        failed: report.failures.length,
        durationMs: report.durationMs,
      },
      'Close pass complete',
    );
  } else {
    logger.debug({ durationMs: report.durationMs }, 'Close pass found nothing due');
  }
}

async function main(): Promise<void> {
  const runOnce = process.argv.includes('--once');
  const config = loadWorkerConfig();
  const logger = pino({ level: config.LOG_LEVEL, name: 'closing-worker' });

  const pool = createPool(config.DATABASE_URL);
  const db = createDb(pool);
  const state = createRunState();

  const runPass = async (): Promise<CloseReport> => {
    const report = await closeDueCampaigns(db, { batchSize: config.CLOSE_BATCH_SIZE });
    recordRun(state, report);
    logReport(logger, report);
    return report;
  };

  if (runOnce) {
    try {
      const report = await runPass();
      // A failure to close is not a failure to run: exit non-zero so a CronJob
      // surfaces it as a failed Job rather than a silent success.
      process.exitCode = report.failures.length > 0 ? 1 : 0;
    } finally {
      await pool.end();
    }
    return;
  }

  const health = startHealthServer(db, state, {
    port: config.HEALTH_PORT,
    overdueGraceMs: config.OVERDUE_GRACE_MS,
  });

  logger.info(
    { intervalMs: config.CLOSE_INTERVAL_MS, healthPort: config.HEALTH_PORT },
    'Closing worker started',
  );

  let stopping = false;
  let timer: NodeJS.Timeout | null = null;

  // Scheduled with a chained timeout rather than setInterval so a slow pass can
  // never overlap the next one. Overlap would be survivable - that is what the
  // row lock is for - but it would waste connections for no benefit.
  const scheduleNext = (): void => {
    if (stopping) return;
    timer = setTimeout(() => void tick(), config.CLOSE_INTERVAL_MS);
  };

  const tick = async (): Promise<void> => {
    try {
      await runPass();
    } catch (error: unknown) {
      // Never let a transient database error kill the loop: the next pass will
      // pick up whatever this one missed, because nothing was committed.
      logger.error({ err: error }, 'Close pass threw');
    } finally {
      scheduleNext();
    }
  };

  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'Shutting down');
    if (timer) clearTimeout(timer);
    health.close();
    // Let any in-flight transaction finish rather than severing it mid-close.
    void pool.end().then(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await tick();
}

main().catch((error: unknown) => {
  console.error('Worker failed to start:', error);
  process.exit(1);
});
