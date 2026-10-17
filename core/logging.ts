// 记录写入助手：UI 层唯一调用入口，纯业务逻辑（小程序可复用，换掉 saveLocal 的底层实现即可）
import { saveLocal } from '../sync/engine';
import { useStore } from '../store/useStore';
import type { BreastSide, DiaperKind, EventKind } from './types';
import { now } from './time';

function ctx() {
  const s = useStore.getState();
  if (!s.family) throw new Error('未加入家庭');
  return { familyId: s.family.id, caregiverId: s.userId };
}

export async function logBottle(amountMl: number, at?: number, note?: string) {
  const c = ctx();
  return saveLocal('feed_logs', {
    kind: 'bottle', amountMl, side: null, durationMin: null,
    startedAt: at ?? now(), note: note ?? null,
    isBackfill: at ? 1 : 0, ...c,
  });
}

export async function logDiaper(kind: DiaperKind, at?: number, note?: string) {
  const c = ctx();
  return saveLocal('diaper_logs', {
    kind, loggedAt: at ?? now(), note: note ?? null,
    isBackfill: at ? 1 : 0, ...c,
  });
}

/** O3：体重（kg） */
export async function logWeight(weightKg: number, at?: number, note?: string) {
  const c = ctx();
  return saveLocal('weight_logs', {
    weightKg, loggedAt: at ?? now(), note: note ?? null,
    isBackfill: at ? 1 : 0, ...c,
  });
}

/** O3：事件（疫苗 / 就医 / 其他） */
export async function logEvent(kind: EventKind, title: string, at?: number, note?: string) {
  const c = ctx();
  return saveLocal('event_logs', {
    kind, title, loggedAt: at ?? now(), note: note ?? null,
    isBackfill: at ? 1 : 0, ...c,
  });
}

/** 开始亲喂/睡觉计时（只存时间戳）。
 * 已有计时在跑时返回 false，且旧计时不会被覆盖丢弃——调用方必须提示用户先结束。 */
export function startTimer(kind: 'feed' | 'sleep', label: string, extra?: Record<string, string>): boolean {
  const s = useStore.getState();
  if (s.timer) return false;
  s.startTimer({ kind, label, startedAt: now(), extra });
  return true;
}

/** 结束计时并落库，返回用时分钟数 */
export async function stopTimerAndSave(): Promise<{ minutes: number; label: string } | null> {
  const s = useStore.getState();
  const t = s.timer;
  if (!t) return null;
  const c = ctx();
  const minutes = Math.max(1, Math.round((now() - t.startedAt) / 60000));
  if (t.kind === 'feed') {
    const side = (t.extra?.side as BreastSide) || 'left';
    await saveLocal('feed_logs', {
      kind: 'breast', side, durationMin: minutes, amountMl: null,
      startedAt: t.startedAt, note: null, isBackfill: 0, ...c,
    });
  } else {
    await saveLocal('sleep_logs', {
      startedAt: t.startedAt, endedAt: now(), note: null, isBackfill: 0, ...c,
    });
  }
  s.stopTimer();
  return { minutes, label: t.label.replace('计时中', '') };
}
