// 同步引擎：本地写 → 队列 → 后台排空 → Realtime 拉回
// 对应 TECH-SPEC §4
import PocketBase from 'pocketbase';
import NetInfo from '@react-native-community/netinfo';
import { eq, asc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '../db/client';
import { feedLogs, diaperLogs, sleepLogs, weightLogs, eventLogs, syncQueue } from '../db/schema';

const TABLES: Record<string, any> = {
  feed_logs: feedLogs, diaper_logs: diaperLogs, sleep_logs: sleepLogs,
  weight_logs: weightLogs, event_logs: eventLogs,
};
// G2：手机时钟小幅漂移容差（5 分钟）：远端更新落在此范围内仍视为"更新"，
// 避免手机时钟偏快时远端数据被永久忽略。大幅漂移仍无法处理（见评审 G2）。
const SKEW_TOLERANCE = 5 * 60_000;

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
let drainAgain = false; // S7：drain 执行期间又有新的 drainQueue() 进来时置 true，当前轮结束后补扫一轮
/** 2. 后台排空队列：NetInfo 恢复 / App 回前台 / 写操作后触发 */
export async function drainQueue(pb?: PocketBase) {
  // S7：守卫必须在第一个 await 之前同步生效，否则两次快速调用会同时通过守卫、
  // 各自 SELECT 到同一批队列项，导致同一条记录在服务端被 create 两次。
  if (draining) { drainAgain = true; return; }
  draining = true;
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;
    const client = pb ?? (global as any).pb;
    if (!client?.authStore?.isValid) return;
    do {
      drainAgain = false;
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
            if (!local) {
              // S3：本地行已不在（被 realtime 的远端删除清掉了）：此同步项作废，直接丢弃。
              // 若走 create 分支，会把已删除的记录重新写回服务端导致"复活"。
              await db.delete(syncQueue).where(eq(syncQueue.id, item.id));
              continue;
            }
            if (local.serverId) {
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
          await db.update(syncQueue).set({ attempts }).where(eq(syncQueue.id, item.id));
          // G1：失败项不再静默丢弃（之前 attempts>=10 直接删队列项且只 console.warn），
          // 保留到下一轮重试；本轮继续处理下一条，避免一个坏项卡住整个队列。
          console.warn('[sync] 失败稍后重试', item.collection, item.localId, 'attempt', attempts);
          continue;
        }
      }
      // drainAgain 为 true 说明本轮执行期间有新的写入进来，再扫一轮把它们带走；
      // poison 项只会失败不会置 drainAgain，不会死循环。
    } while (drainAgain);
  } finally {
    draining = false;
    // 极小窗口：do-while 退出判断和 draining=false 之间进来的写入，补一次
    if (drainAgain) { drainAgain = false; drainQueue(pb); }
  }
}

/** 3. Realtime 订阅：远端变更拉回本地（LWW + 5 分钟时钟容差）。返回取消订阅函数。 */
export function subscribeRealtime(pb: PocketBase, familyId: string): () => void {
  const unsubs: Array<() => void> = [];
  (['feed_logs', 'diaper_logs', 'sleep_logs', 'weight_logs', 'event_logs'] as const).forEach((col) => {
    pb.collection(col).subscribe('*', async (e) => {
      try {
        if (e.record.family !== familyId) return;
        const table = TABLES[col];
        const [local] = await db.select().from(table).where(eq(table.serverId, e.record.id));
        const remoteUpdated = new Date(e.record.updated).getTime();
        if (e.action === 'delete' || e.record.deleted) {
          if (!local) return;
          // S3：本地若有更新的未同步修改，本地胜出（LWW），保留本地行；
          // 否则先清掉该记录的待同步项，再删除本地行（不清队列会导致 drainQueue 把记录"复活"）
          const pending = await db.select().from(syncQueue).where(eq(syncQueue.localId, local.localId));
          if (pending.length > 0 && (local.updatedAt ?? 0) > remoteUpdated) return;
          for (const p of pending) await db.delete(syncQueue).where(eq(syncQueue.id, p.id));
          await db.delete(table).where(eq(table.localId, local.localId));
          return;
        }
        if (!local || remoteUpdated > (local.updatedAt ?? 0) - SKEW_TOLERANCE) {
          const row = fromServerPayload(col, e.record, familyId);
          await db.insert(table).values(row).onConflictDoUpdate({ target: table.localId, set: row });
        }
      } catch (err) {
        // 回调内异常不能向外抛，否则可能中断后续 realtime 消息
        console.warn('[realtime] 处理失败', col, err);
      }
    }).then((u) => unsubs.push(u)).catch(() => {});
  });
  return () => { unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } }); };
}

/** G1：待同步条数（"我的"页展示用） */
export async function getPendingCount(): Promise<number> {
  const rows = await db.select({ id: syncQueue.id }).from(syncQueue);
  return rows.length;
}

function toServerPayload(collection: string, row: any) {
  // 本地 camelCase → PocketBase snake_case 显式映射
  // 注意：family 是必填 relation，不能漏
  const toDate = (ms: number | null) => ms ? new Date(ms).toISOString() : null;
  const payload: any = {
    client_id: row.localId, // 用于服务端去重兜底
    family: row.familyId,
    caregiver: row.caregiverId,
    kind: row.kind ?? null,
    side: row.side ?? null,
    note: row.note ?? null,
    is_backfill: row.isBackfill ? true : false,
    deleted: row.deleted ? true : false,
  };
  if (collection === 'feed_logs') {
    payload.duration_min = row.durationMin ?? null;
    payload.amount_ml = row.amountMl ?? null;
    payload.started_at = toDate(row.startedAt);
  } else if (collection === 'diaper_logs') {
    payload.logged_at = toDate(row.loggedAt);
  } else if (collection === 'sleep_logs') {
    payload.started_at = toDate(row.startedAt);
    payload.ended_at = toDate(row.endedAt);
  } else if (collection === 'weight_logs') {
    payload.weight_kg = row.weightKg ?? null;
    payload.logged_at = toDate(row.loggedAt);
  } else if (collection === 'event_logs') {
    payload.kind = row.kind ?? null;
    payload.title = row.title ?? null;
    payload.logged_at = toDate(row.loggedAt);
  }
  return payload;
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
    weightKg: rec.weight_kg ?? null,
    title: rec.title ?? null,
    startedAt: rec.started_at ? new Date(rec.started_at).getTime() : null,
    loggedAt: rec.logged_at ? new Date(rec.logged_at).getTime() : null,
    endedAt: rec.ended_at ? new Date(rec.ended_at).getTime() : null,
  };
}
