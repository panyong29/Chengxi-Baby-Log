// 同步引擎：本地写 → 队列 → 后台排空 → Realtime 拉回
// 对应 TECH-SPEC §4
import PocketBase from 'pocketbase';
import NetInfo from '@react-native-community/netinfo';
import { eq, asc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '../db/client';
import { feedLogs, diaperLogs, sleepLogs, syncQueue } from '../db/schema';

const TABLES: Record<string, any> = { feed_logs: feedLogs, diaper_logs: diaperLogs, sleep_logs: sleepLogs };
const BACKOFF = [60_000, 300_000, 1_800_000]; // 1min / 5min / 30min

export const newId = () => Crypto.randomUUID();

/** 1. 写本地：App 层唯一写入口。UI 调这个，0 延迟。 */
export async function saveLocal(collection: keyof typeof TABLES, data: Record<string, any>) {
  const table = TABLES[collection];
  const now = Date.now();
  const row = { localId: data.localId ?? newId(), synced: 0, updatedAt: now, ...data };
  await db.insert(table).values(row).onConflictDoUpdate({
    target: table.localId,
    set: { ...row },
  });
  await db.insert(syncQueue).values({
    collection, localId: row.localId, op: 'create',
    payload: JSON.stringify(toServerPayload(collection, row)),
    attempts: 0, createdAt: now,
  });
  drainQueue(); // 尝试立即同步（有网才真发）
  return row.localId;
}

/** 软删除 */
export async function deleteLocal(collection: keyof typeof TABLES, localId: string) {
  const table = TABLES[collection];
  await db.update(table).set({ deleted: 1, synced: 0, updatedAt: Date.now() }).where(eq(table.localId, localId));
  await db.insert(syncQueue).values({
    collection, localId, op: 'delete', payload: JSON.stringify({ deleted: true }),
    attempts: 0, createdAt: Date.now(),
  });
  drainQueue();
}

let draining = false;
/** 2. 后台排空队列：NetInfo 恢复 / App 回前台 / 写操作后触发 */
export async function drainQueue(pb?: PocketBase) {
  if (draining) return;
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;
  const client = pb ?? (global as any).pb;
  if (!client?.authStore?.isValid) return;
  draining = true;
  try {
    const items = await db.select().from(syncQueue).orderBy(asc(syncQueue.createdAt)).limit(200);
    for (const item of items) {
      try {
        const table = TABLES[item.collection];
        const payload = JSON.parse(item.payload);
        if (item.op === 'delete') {
          const [local] = await db.select().from(table).where(eq(table.localId, item.localId));
          if (local?.serverId) await client.collection(item.collection).update(local.serverId, payload);
        } else {
          const [local] = await db.select().from(table).where(eq(table.localId, item.localId));
          if (local?.serverId) {
            await client.collection(item.collection).update(local.serverId, payload);
          } else {
            const rec = await client.collection(item.collection).create(payload);
            await db.update(table).set({ serverId: rec.id }).where(eq(table.localId, item.localId));
          }
        }
        await db.update(table).set({ synced: 1 }).where(eq(table.localId, item.localId));
        await db.delete(syncQueue).where(eq(syncQueue.id, item.id));
      } catch (e) {
        const attempts = item.attempts + 1;
        if (attempts >= 10) {
          console.warn('[sync] 放弃', item.collection, item.localId);
          await db.delete(syncQueue).where(eq(syncQueue.id, item.id));
        } else {
          await db.update(syncQueue).set({ attempts }).where(eq(syncQueue.id, item.id));
          await sleep(BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)]);
        }
      }
    }
  } finally {
    draining = false;
  }
}

/** 3. Realtime 订阅：远端变更拉回本地（LWW） */
export function subscribeRealtime(pb: PocketBase, familyId: string) {
  (['feed_logs', 'diaper_logs', 'sleep_logs'] as const).forEach((col) => {
    pb.collection(col).subscribe('*', async (e) => {
      if (e.record.family !== familyId) return;
      const table = TABLES[col];
      const [local] = await db.select().from(table).where(eq(table.serverId, e.record.id));
      const remoteUpdated = new Date(e.record.updated).getTime();
      if (e.action === 'delete' || e.record.deleted) {
        if (local) await db.delete(table).where(eq(table.localId, local.localId));
        return;
      }
      if (!local || remoteUpdated > (local.updatedAt ?? 0)) {
        const row = fromServerPayload(col, e.record, familyId);
        await db.insert(table).values(row).onConflictDoUpdate({ target: table.localId, set: row });
      }
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toServerPayload(collection: string, row: any) {
  const { localId, serverId, synced, updatedAt, ...rest } = row;
  return { ...rest, client_id: localId }; // client_id 用于服务端去重兜底
}

function fromServerPayload(collection: string, rec: any, familyId: string) {
  return {
    localId: rec.client_id ?? rec.id,
    serverId: rec.id,
    familyId,
    caregiverId: rec.caregiver,
    synced: 1,
    updatedAt: new Date(rec.updated).getTime(),
    deleted: rec.deleted ? 1 : 0,
    note: rec.note ?? null,
    isBackfill: rec.is_backfill ? 1 : 0,
    kind: rec.kind ?? null,
    side: rec.side ?? null,
    durationMin: rec.duration_min ?? null,
    amountMl: rec.amount_ml ?? null,
    startedAt: rec.started_at ? new Date(rec.started_at).getTime() : null,
    loggedAt: rec.logged_at ? new Date(rec.logged_at).getTime() : null,
    endedAt: rec.ended_at ? new Date(rec.ended_at).getTime() : null,
  };
}
