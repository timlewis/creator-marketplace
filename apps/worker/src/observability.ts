import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { Db } from '@marketplace/db';
import { sql } from 'drizzle-orm';
import { countOverdueCampaigns } from './closing.js';
import type { CloseReport } from './closing.js';

/** Rolling state the metrics endpoint reports on. */
export interface RunState {
  lastRunAt: Date | null;
  lastReport: CloseReport | null;
  totalClosed: number;
  totalFailures: number;
}

export function createRunState(): RunState {
  return { lastRunAt: null, lastReport: null, totalClosed: 0, totalFailures: 0 };
}

export function recordRun(state: RunState, report: CloseReport): void {
  state.lastRunAt = new Date();
  state.lastReport = report;
  state.totalClosed += report.closed.length;
  state.totalFailures += report.failures.length;
}

/**
 * Health and metrics for the long-running worker.
 *
 * The interesting signal is not "is the process up" - a wedged worker is up.
 * It is `marketplace_campaigns_overdue`: campaigns whose deadline passed and
 * which are still open past the grace period. That number is zero in a healthy
 * system regardless of traffic, which makes it alertable without a baseline.
 */
export function startHealthServer(
  db: Db,
  state: RunState,
  options: { port: number; overdueGraceMs: number },
): Server {
  const server = createServer((req, res) => {
    const url = req.url ?? '/';

    if (url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (url === '/readyz') {
      db.execute(sql`SELECT 1`)
        .then(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: 'ready' }));
        })
        .catch((error: unknown) => {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: 'degraded', error: String(error) }));
        });
      return;
    }

    if (url === '/metrics') {
      countOverdueCampaigns(db, { graceMs: options.overdueGraceMs })
        .then((overdue) => {
          const lines = [
            '# HELP marketplace_campaigns_overdue Campaigns past their deadline still awaiting close.',
            '# TYPE marketplace_campaigns_overdue gauge',
            `marketplace_campaigns_overdue ${overdue}`,
            '# HELP marketplace_campaigns_closed_total Campaigns closed since this worker started.',
            '# TYPE marketplace_campaigns_closed_total counter',
            `marketplace_campaigns_closed_total ${state.totalClosed}`,
            '# HELP marketplace_close_failures_total Campaign closes that raised an error.',
            '# TYPE marketplace_close_failures_total counter',
            `marketplace_close_failures_total ${state.totalFailures}`,
            '# HELP marketplace_last_run_age_seconds Seconds since the closing loop last completed a pass.',
            '# TYPE marketplace_last_run_age_seconds gauge',
            `marketplace_last_run_age_seconds ${
              state.lastRunAt ? Math.round((Date.now() - state.lastRunAt.getTime()) / 1000) : -1
            }`,
          ];
          res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
          res.end(`${lines.join('\n')}\n`);
        })
        .catch((error: unknown) => {
          res.writeHead(503, { 'content-type': 'text/plain' });
          res.end(`# metrics unavailable: ${String(error)}\n`);
        });
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  server.listen(options.port);
  return server;
}
