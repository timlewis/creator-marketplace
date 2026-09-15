import { creators } from '@marketplace/db';
import type { CreatorRow, Db, DbExecutor } from '@marketplace/db';
import { asc, eq } from 'drizzle-orm';
import { notFound } from '../errors.js';

export async function listCreators(db: Db): Promise<CreatorRow[]> {
  return db.select().from(creators).orderBy(asc(creators.displayName));
}

export async function requireCreator(db: DbExecutor, creatorId: string): Promise<CreatorRow> {
  const [row] = await db.select().from(creators).where(eq(creators.id, creatorId)).limit(1);
  if (!row) throw notFound('Creator');
  return row;
}
