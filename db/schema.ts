// 本地 SQLite schema（Drizzle ORM）
// 原则：本地是唯一真相源；_synced=0 表示还没同步到 PocketBase
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

const baseLog = {
  localId: text('local_id').primaryKey(),      // 客户端生成 UUID，重试天然幂等
  serverId: text('server_id'),                 // PocketBase 返回的 id
  familyId: text('family_id').notNull(),
  caregiverId: text('caregiver_id').notNull(),
  note: text('note'),
  isBackfill: integer('is_backfill').default(0),
  deleted: integer('deleted').default(0),       // 软删除
  synced: integer('synced').default(0),
  updatedAt: integer('updated_at').notNull(),  // epoch ms，LWW 比较用
};

export const feedLogs = sqliteTable('feed_logs', {
  ...baseLog,
  kind: text('kind').notNull(),                // 'breast' | 'bottle'
  side: text('side'),                          // 'left' | 'right' | null
  durationMin: integer('duration_min'),
  amountMl: integer('amount_ml'),
  startedAt: integer('started_at').notNull(),  // epoch ms UTC
});

export const diaperLogs = sqliteTable('diaper_logs', {
  ...baseLog,
  kind: text('kind').notNull(),                // 'wet' | 'dirty' | 'mixed'
  loggedAt: integer('logged_at').notNull(),
});

export const sleepLogs = sqliteTable('sleep_logs', {
  ...baseLog,
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
});

// 待同步队列：App 写本地的同时插一条，worker 后台排空
export const syncQueue = sqliteTable('sync_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  collection: text('collection').notNull(),    // 'feed_logs' | 'diaper_logs' | 'sleep_logs'
  localId: text('local_id').notNull(),
  op: text('op').notNull(),                    // 'create' | 'update' | 'delete'
  payload: text('payload').notNull(),          // JSON
  attempts: integer('attempts').notNull(),     // 不用 .default(0)：drizzle 0.36.4 自增PK+default 的类型推断 bug 会吞掉该字段；写入时一律显式传值
  createdAt: integer('created_at').notNull(),
});

export type FeedLog = typeof feedLogs.$inferInsert;
export type DiaperLog = typeof diaperLogs.$inferInsert;
export type SleepLog = typeof sleepLogs.$inferInsert;
