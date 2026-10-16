import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

// 小程序迁移时：把这个文件换成微信存储实现，schema.ts 不用动
// （Drizzle 的表定义是纯 TS，字段映射照抄过去）

const expoDb = openDatabaseSync('newborn.db');

expoDb.execSync(`
CREATE TABLE IF NOT EXISTS feed_logs (
  local_id TEXT PRIMARY KEY, server_id TEXT, family_id TEXT NOT NULL,
  caregiver_id TEXT NOT NULL, kind TEXT NOT NULL, side TEXT,
  duration_min INTEGER, amount_ml INTEGER, started_at INTEGER NOT NULL,
  note TEXT, is_backfill INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0,
  synced INTEGER DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS diaper_logs (
  local_id TEXT PRIMARY KEY, server_id TEXT, family_id TEXT NOT NULL,
  caregiver_id TEXT NOT NULL, kind TEXT NOT NULL, logged_at INTEGER NOT NULL,
  note TEXT, is_backfill INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0,
  synced INTEGER DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sleep_logs (
  local_id TEXT PRIMARY KEY, server_id TEXT, family_id TEXT NOT NULL,
  caregiver_id TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
  note TEXT, is_backfill INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0,
  synced INTEGER DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, collection TEXT NOT NULL,
  local_id TEXT NOT NULL, op TEXT NOT NULL, payload TEXT NOT NULL,
  attempts INTEGER DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_q_created ON sync_queue (created_at);
`);

export const db = drizzle(expoDb, { schema });
