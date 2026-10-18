// Web 端数据层：直连 PocketBase（与 App 共用同一后端 https://kids.appifa.com）
// App 走"本地 SQLite + 同步队列"，Web 端是在线直写，字段映射与 App 的 toServerPayload 保持一致。
import PocketBase from 'pocketbase';

// 同域部署时用相对路径；本地开发时回退到线上地址
export const PB_URL =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? window.location.origin
    : 'https://kids.appifa.com';

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const TOKEN_KEY = 'bl_pb_token';
const USER_KEY = 'bl_pb_user';
const SECRET_KEY = 'bl_account_secret';
const TIMER_KEY = 'bl_active_timer';
const THEME_KEY = 'bl_theme';

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export type Role = 'parent' | 'caregiver';
export interface Family { id: string; babyNickname: string; babyBirthdate?: string; inviteCode: string; }
export interface Member { id: string; nickname: string; role: Role; }
export interface ActiveTimer { kind: 'feed' | 'sleep'; label: string; startedAt: number; extra?: Record<string, string>; }

/** 恢复登录态 */
export async function restoreAuth(): Promise<{ userId: string; nickname: string; family: Family } | null> {
  const raw = store.get(USER_KEY);
  const token = store.get(TOKEN_KEY);
  if (!raw || !token) return null;
  try {
    pb.authStore.save(token, JSON.parse(raw));
    await pb.collection('users').authRefresh();
    store.set(TOKEN_KEY, pb.authStore.token);
    return await loadSession();
  } catch {
    logout();
    return null;
  }
}

export function logout() {
  pb.authStore.clear();
  store.del(TOKEN_KEY); store.del(USER_KEY); store.del(TIMER_KEY);
}

async function persistAuth() {
  store.set(TOKEN_KEY, pb.authStore.token);
  store.set(USER_KEY, JSON.stringify(pb.authStore.record));
}

async function loadSession() {
  const u: any = pb.authStore.record;
  const fam: any = await pb.collection('family').getOne(u.family);
  return {
    userId: u.id,
    nickname: u.nickname || '成员',
    family: {
      id: fam.id,
      babyNickname: fam.baby_nickname || '宝宝',
      babyBirthdate: fam.baby_birthdate || '',
      inviteCode: fam.invite_code || '',
    } as Family,
  };
}

/** 爸爸：注册 -> 建家庭（服务端生成邀请码）
 * 注意：hook 在服务端给用户绑定家庭，但本地 authStore.record 还是旧的（无 family），
 * 所以家庭信息直接用 hook 返回的 res，不要 getOne(u.family)——否则报 Missing required record id */
export async function registerAndCreateFamily(opts: { nickname: string; password: string; babyNickname: string; babyBirthdate?: string }) {
  const email = `p${Date.now().toString(36)}@family.local`;
  await pb.collection('users').create({
    email, password: opts.password, passwordConfirm: opts.password, nickname: opts.nickname,
  });
  await pb.collection('users').authWithPassword(email, opts.password);
  store.set(SECRET_KEY, JSON.stringify({ email, password: opts.password }));
  const res: any = await pb.send('/api/create-family', {
    method: 'POST',
    body: { baby_nickname: opts.babyNickname, baby_birthdate: opts.babyBirthdate || '', nickname: opts.nickname },
  });
  await persistAuth();
  const u: any = pb.authStore.record;
  return {
    userId: u.id,
    nickname: u.nickname || opts.nickname,
    family: {
      id: res.family,
      babyNickname: opts.babyNickname,
      babyBirthdate: opts.babyBirthdate || '',
      inviteCode: res.invite_code as string,
    } as Family,
  };
}

/** 成员：邀请码加入 */
export async function joinWithInviteCode(opts: { inviteCode: string; nickname: string }) {
  const email = `m${Date.now().toString(36)}@invite.local`;
  const password = randomPassword();
  const res: any = await pb.send('/api/join-family', {
    method: 'POST',
    body: { invite_code: opts.inviteCode, nickname: opts.nickname, email, password },
  }).catch((e: any) => { throw new Error(e?.data?.message || '加入失败，请检查邀请码'); });
  if (!res?.ok) throw new Error('加入失败，请检查邀请码');
  await pb.collection('users').authWithPassword(email, password);
  store.set(SECRET_KEY, JSON.stringify({ email, password }));
  await persistAuth();
  const u: any = pb.authStore.record;
  const fam: any = await pb.collection('family').getOne(res.family);
  return {
    userId: u.id,
    nickname: u.nickname || opts.nickname,
    family: {
      id: fam.id,
      babyNickname: fam.baby_nickname || '',
      babyBirthdate: fam.baby_birthdate || '',
      inviteCode: fam.invite_code || '',
    } as Family,
  };
}

function randomPassword(): string {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

/** S5：已有账号登录（换设备/重装后登回） */
export async function loginWithPassword(opts: { email: string; password: string }) {
  try {
    await pb.collection('users').authWithPassword(opts.email, opts.password);
  } catch {
    throw new Error('邮箱或密码不对，邮箱可在旧设备"我的"页查看');
  }
  store.set(SECRET_KEY, JSON.stringify({ email: opts.email, password: opts.password }));
  await persistAuth();
  const u: any = pb.authStore.record;
  if (!u?.family) throw new Error('这个账号还没有加入家庭，先用邀请码加入');
  const fam: any = await pb.collection('family').getOne(u.family);
  return {
    userId: u.id,
    nickname: u.nickname || '我',
    family: {
      id: fam.id,
      babyNickname: fam.baby_nickname || '',
      babyBirthdate: fam.baby_birthdate || '',
      inviteCode: fam.invite_code || '',
    } as Family,
  };
}

/** 当前家庭成员列表 */
export async function fetchMembers(familyId: string): Promise<Member[]> {
  const fam: any = await pb.collection('family').getOne(familyId, { expand: 'members' });
  return (fam.expand?.members || []).map((u: any) => ({
    id: u.id, nickname: u.nickname || '成员', role: (u.role || 'caregiver') as Role,
  }));
}

/** 刷新邀请码 */
export async function refreshInviteCode(familyId: string): Promise<string> {
  const code = '澄 ' + Array.from({ length: 4 },
    () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  await pb.collection('family').update(familyId, { invite_code: code });
  return code;
}

// ---------- 记录写入（字段映射与 App 端 toServerPayload 一致） ----------

const toDate = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `w${Date.now()}${Math.floor(Math.random() * 1e6)}`);

export async function logBottle(familyId: string, caregiverId: string, amountMl: number, at?: number, note?: string) {
  return pb.collection('feed_logs').create({
    client_id: uid(), family: familyId, caregiver: caregiverId,
    kind: 'bottle', side: null, duration_min: null, amount_ml: amountMl,
    started_at: toDate(at ?? Date.now()), note: note ?? null,
    is_backfill: at ? true : false, deleted: false,
  });
}

export async function logBreast(familyId: string, caregiverId: string, side: 'left' | 'right', startedAt: number, durationMin: number) {
  return pb.collection('feed_logs').create({
    client_id: uid(), family: familyId, caregiver: caregiverId,
    kind: 'breast', side, duration_min: durationMin, amount_ml: null,
    started_at: toDate(startedAt), note: null, is_backfill: false, deleted: false,
  });
}

export async function logDiaper(familyId: string, caregiverId: string, kind: 'wet' | 'dirty' | 'mixed', at?: number, note?: string) {
  return pb.collection('diaper_logs').create({
    client_id: uid(), family: familyId, caregiver: caregiverId, kind,
    logged_at: toDate(at ?? Date.now()), note: note ?? null,
    is_backfill: at ? true : false, deleted: false,
  });
}

export async function logSleep(familyId: string, caregiverId: string, startedAt: number, endedAt?: number | null, note?: string, backfill?: boolean) {
  return pb.collection('sleep_logs').create({
    client_id: uid(), family: familyId, caregiver: caregiverId,
    started_at: toDate(startedAt), ended_at: toDate(endedAt ?? null),
    note: note ?? null, is_backfill: backfill ? true : false, deleted: false,
  });
}

/** O3：体重（kg） */
export async function logWeight(familyId: string, caregiverId: string, weightKg: number, at?: number, note?: string) {
  return pb.collection('weight_logs').create({
    client_id: uid(), family: familyId, caregiver: caregiverId,
    weight_kg: weightKg, logged_at: toDate(at ?? Date.now()),
    note: note ?? null, is_backfill: at ? true : false, deleted: false,
  });
}

/** O3：事件（vaccine 疫苗 / medical 就医 / other 其他） */
export async function logEvent(familyId: string, caregiverId: string, kind: 'vaccine' | 'medical' | 'other', title: string, at?: number, note?: string) {
  return pb.collection('event_logs').create({
    client_id: uid(), family: familyId, caregiver: caregiverId,
    kind, title, logged_at: toDate(at ?? Date.now()),
    note: note ?? null, is_backfill: at ? true : false, deleted: false,
  });
}

// ---------- 查询 ----------

export interface TimelineItem {
  id: string; // 服务端 id
  collection: 'feed_logs' | 'diaper_logs' | 'sleep_logs' | 'weight_logs' | 'event_logs';
  emoji: string; title: string; meta: string; ts: number;
}

const FEED_LABEL: Record<string, string> = { breast: '亲喂', bottle: '瓶喂' };
const DIAPER_LABEL: Record<string, string> = { wet: '尿湿', dirty: '便便', mixed: '混合' };
const EVENT_META: Record<string, { emoji: string; text: string }> = {
  vaccine: { emoji: '💉', text: '疫苗' },
  medical: { emoji: '🏥', text: '就医' },
  other: { emoji: '📌', text: '事件' },
};

export function fmtDateTime(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}
export function fmtMinutes(min: number) {
  if (min < 60) return `${min} 分钟`;
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分`;
}
export function fmtDuration(sec: number) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(sec / 3600))}:${p(Math.floor((sec % 3600) / 60))}:${p(sec % 60)}`;
}

/** 拉取时间线（五表合并倒序） */
export async function fetchTimeline(familyId: string): Promise<TimelineItem[]> {
  const filter = `family = "${familyId}" && deleted != true`;
  const [feeds, diapers, sleeps, weights, events] = await Promise.all([
    pb.collection('feed_logs').getList(1, 100, { sort: '-started_at', filter }),
    pb.collection('diaper_logs').getList(1, 100, { sort: '-logged_at', filter }),
    pb.collection('sleep_logs').getList(1, 100, { sort: '-started_at', filter }),
    pb.collection('weight_logs').getList(1, 100, { sort: '-logged_at', filter }),
    pb.collection('event_logs').getList(1, 100, { sort: '-logged_at', filter }),
  ]);
  const all: TimelineItem[] = [];
  for (const f of feeds.items) {
    const ts = new Date(f.started_at).getTime();
    const detail = f.kind === 'breast'
      ? `${f.side === 'left' ? '左胸' : '右胸'} ${f.duration_min} 分钟` : `${f.amount_ml} ml`;
    all.push({ id: f.id, collection: 'feed_logs', emoji: '🍼', title: `${FEED_LABEL[f.kind] || '喂奶'} · ${detail}`, meta: `${fmtDateTime(ts)} · ${timeAgo(ts)}`, ts });
  }
  for (const d of diapers.items) {
    const ts = new Date(d.logged_at).getTime();
    all.push({ id: d.id, collection: 'diaper_logs', emoji: '💩', title: `尿布 · ${DIAPER_LABEL[d.kind] || ''}${d.note ? `（${d.note}）` : ''}`, meta: `${fmtDateTime(ts)} · ${timeAgo(ts)}`, ts });
  }
  for (const s of sleeps.items) {
    const ts = new Date(s.started_at).getTime();
    const dur = s.ended_at ? fmtMinutes(Math.round((new Date(s.ended_at).getTime() - ts) / 60000)) : '进行中';
    all.push({ id: s.id, collection: 'sleep_logs', emoji: '😴', title: `睡觉 · ${dur}`, meta: `${fmtDateTime(ts)} · ${timeAgo(ts)}`, ts });
  }
  for (const w of weights.items) {
    const ts = new Date(w.logged_at).getTime();
    all.push({ id: w.id, collection: 'weight_logs', emoji: '⚖️', title: `体重 · ${w.weight_kg} kg`, meta: `${fmtDateTime(ts)} · ${timeAgo(ts)}`, ts });
  }
  for (const e of events.items) {
    const ts = new Date(e.logged_at).getTime();
    const m = EVENT_META[e.kind] || EVENT_META.other;
    all.push({ id: e.id, collection: 'event_logs', emoji: m.emoji, title: `${m.text} · ${e.title}`, meta: `${fmtDateTime(ts)} · ${timeAgo(ts)}`, ts });
  }
  all.sort((a, b) => b.ts - a.ts);
  return all;
}

/** S5：账号邮箱（"我的"页展示，换设备登录用） */
export function getAccountEmail(): string {
  try { return JSON.parse(store.get(SECRET_KEY) || '{}').email || ''; } catch { return ''; }
}

/** O1：CSV 导出（浏览器直接下载，带 BOM 以便 Excel 打开中文） */
export async function exportCSV(family: Family): Promise<void> {
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = ['类型,时间,内容,备注'];
  const filter = `family = "${family.id}" && deleted != true`;
  const tsOf = (s: string) => new Date(s).getTime();
  const [feeds, diapers, sleeps, weights, events] = await Promise.all([
    pb.collection('feed_logs').getFullList({ sort: 'started_at', filter }),
    pb.collection('diaper_logs').getFullList({ sort: 'logged_at', filter }),
    pb.collection('sleep_logs').getFullList({ sort: 'started_at', filter }),
    pb.collection('weight_logs').getFullList({ sort: 'logged_at', filter }),
    pb.collection('event_logs').getFullList({ sort: 'logged_at', filter }),
  ]);
  for (const f of feeds) {
    const detail = f.kind === 'breast'
      ? `亲喂${f.side === 'left' ? '左' : '右'}${f.duration_min}分钟` : `瓶喂${f.amount_ml}ml`;
    rows.push(['喂奶', fmtDateTime(tsOf(f.started_at)), detail, f.note].map(esc).join(','));
  }
  const DK: Record<string, string> = { wet: '尿湿', dirty: '便便', mixed: '混合' };
  for (const d of diapers) rows.push(['尿布', fmtDateTime(tsOf(d.logged_at)), DK[d.kind] || d.kind, d.note].map(esc).join(','));
  for (const s of sleeps) {
    const dur = s.ended_at ? fmtMinutes(Math.round((tsOf(s.ended_at) - tsOf(s.started_at)) / 60000)) + '分钟' : '进行中';
    rows.push(['睡觉', fmtDateTime(tsOf(s.started_at)), dur, s.note].map(esc).join(','));
  }
  for (const w of weights) rows.push(['体重', fmtDateTime(tsOf(w.logged_at)), `${w.weight_kg}kg`, w.note].map(esc).join(','));
  const EK: Record<string, string> = { vaccine: '疫苗', medical: '就医', other: '事件' };
  for (const e of events) rows.push([EK[e.kind] || '事件', fmtDateTime(tsOf(e.logged_at)), e.title, e.note].map(esc).join(','));
  if (rows.length === 1) throw new Error('还没有记录');
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `宝宝记录_${family.babyNickname}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** 今日小结 */
export async function fetchTodayStats(familyId: string) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const dayStart = d.toISOString().replace('T', ' ').slice(0, 19);
  const filter = `family = "${familyId}" && deleted != true`;
  const [feeds, diapers, sleeps] = await Promise.all([
    pb.collection('feed_logs').getList(1, 200, { filter: `${filter} && started_at >= "${dayStart}"` }),
    pb.collection('diaper_logs').getList(1, 200, { filter: `${filter} && logged_at >= "${dayStart}"` }),
    pb.collection('sleep_logs').getList(1, 200, { filter: `${filter} && started_at >= "${dayStart}"` }),
  ]);
  let bottleMl = 0, breastMin = 0;
  for (const f of feeds.items) { bottleMl += f.amount_ml || 0; breastMin += f.duration_min || 0; }
  let sleepMin = 0;
  for (const s of sleeps.items) {
    if (s.ended_at) sleepMin += Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000);
  }
  return {
    feedCount: feeds.items.length, bottleMl, breastMin,
    diaperCount: diapers.items.length, sleepMin,
  };
}

// ---------- 计时器 / 主题（localStorage） ----------

export function getTimer(): ActiveTimer | null {
  try { const raw = store.get(TIMER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function setTimer(t: ActiveTimer | null) {
  if (t) store.set(TIMER_KEY, JSON.stringify(t)); else store.del(TIMER_KEY);
}
export function getTheme(): 'dark' | 'light' {
  return store.get(THEME_KEY) === 'light' ? 'light' : 'dark';
}
export function setTheme(t: 'dark' | 'light') { store.set(THEME_KEY, t); }
