import PocketBase from 'pocketbase';
import EventSource from 'react-native-sse';
import { vault } from '../core/adapters';

// RN 的 Hermes 没有 EventSource 全局对象，PocketBase 的 realtime 订阅
// 会在 queueMicrotask 里 new EventSource() 直接抛 ReferenceError 导致闪退，
// 而且 try/catch 抓不住（微任务里的异常）。这里先打上 polyfill。
if (typeof (global as any).EventSource === 'undefined') {
  (global as any).EventSource = EventSource;
}

// 上线地址：https://kids.appifa.com（nginx SNI 分流 -> 11443 -> 127.0.0.1:8090）
export const PB_URL = 'https://kids.appifa.com';
export const pb = new PocketBase(PB_URL);
(pb as any)._app = pb; // 给 sync 引擎用
if (typeof global !== 'undefined') (global as any).pb = pb;

const TOKEN_KEY = 'pb_token';
const USER_KEY = 'pb_user';

/** 恢复登录态（App 启动时调用） */
export async function restoreAuth(): Promise<boolean> {
  const raw = await vault.get(USER_KEY);
  const token = await vault.get(TOKEN_KEY);
  if (!raw || !token) return false;
  try {
    pb.authStore.save(token, JSON.parse(raw));
    await pb.collection('users').authRefresh();
    await vault.set(TOKEN_KEY, pb.authStore.token);
    return pb.authStore.isValid;
  } catch {
    await logout();
    return false;
  }
}

export async function logout() {
  pb.authStore.clear();
  await vault.del(TOKEN_KEY);
  await vault.del(USER_KEY);
  await vault.del('active_timer');
}

async function persistAuth() {
  await vault.set(TOKEN_KEY, pb.authStore.token);
  await vault.set(USER_KEY, JSON.stringify(pb.authStore.record));
}

/** 爸爸：注册 -> 建家庭（服务端生成邀请码） */
export async function registerAndCreateFamily(opts: {
  nickname: string; password: string; babyNickname: string; babyBirthdate?: string;
}) {
  const email = `p${Date.now().toString(36)}@family.local`;
  await pb.collection('users').create({
    email, password: opts.password, passwordConfirm: opts.password,
    nickname: opts.nickname,
  });
  await pb.collection('users').authWithPassword(email, opts.password);
  // 把随机密码存好，换设备/重装时可用于找回（用户无感知）
  await vault.set('account_secret', JSON.stringify({ email, password: opts.password }));
  const res = await pb.send('/api/create-family', {
    method: 'POST',
    body: {
      baby_nickname: opts.babyNickname,
      baby_birthdate: opts.babyBirthdate || '',
      nickname: opts.nickname,
    },
  });
  await persistAuth();
  return res as { ok: boolean; family: string; invite_code: string };
}

/** 月嫂/老人：邀请码加入（无密码概念） */
export async function joinWithInviteCode(opts: {
  inviteCode: string; nickname: string;
}) {
  const email = `m${Date.now().toString(36)}@invite.local`;
  const password = randomPassword();
  const res: any = await pb.send('/api/join-family', {
    method: 'POST',
    body: { invite_code: opts.inviteCode, nickname: opts.nickname, email, password },
  }).catch((e: any) => {
    throw new Error(e?.data?.message || '加入失败，请检查邀请码');
  });
  if (!res?.ok) throw new Error('加入失败，请检查邀请码');
  await pb.collection('users').authWithPassword(email, password);
  await vault.set('account_secret', JSON.stringify({ email, password }));
  await persistAuth();
  return res as { ok: boolean; family: string };
}

function randomPassword(): string {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

/** 当前家庭成员列表 */
export async function fetchMembers(familyId: string) {
  const fam: any = await pb.collection('family').getOne(familyId, { expand: 'members' });
  return (fam.expand?.members || []).map((u: any) => ({
    id: u.id, nickname: u.nickname || '成员', role: u.role || 'caregiver',
  }));
}

/** 刷新邀请码 */
export async function refreshInviteCode(familyId: string): Promise<string> {
  const code = '澄 ' + Array.from({ length: 4 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  await pb.collection('family').update(familyId, { invite_code: code });
  return code;
}
