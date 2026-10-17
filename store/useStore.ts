import { create } from 'zustand';
import { vault } from '../core/adapters';
import type { ActiveTimer, Family } from '../core/types';

interface AppState {
  ready: boolean;
  authed: boolean;
  userId: string;
  nickname: string;
  family: Family | null;
  theme: 'dark' | 'light';
  timer: ActiveTimer | null;
  setAuth: (v: { userId: string; nickname: string; family: Family }) => void;
  clearAuth: () => void;
  setReady: () => void;
  toggleTheme: () => void;
  restoreTheme: () => Promise<void>;
  startTimer: (t: ActiveTimer) => void;
  stopTimer: () => void;
  restoreTimer: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  authed: false,
  userId: '',
  nickname: '',
  family: null,
  theme: 'dark', // 凌晨场景默认深色
  timer: null,

  setAuth: (v) => set({ authed: true, userId: v.userId, nickname: v.nickname, family: v.family }),
  clearAuth: () => set({ authed: false, userId: '', nickname: '', family: null, timer: null }),
  setReady: () => set({ ready: true }),
  // G4：主题持久化（之前只改内存，重启回到深色）
  toggleTheme: () => {
    const t = get().theme === 'dark' ? 'light' : 'dark';
    set({ theme: t });
    vault.set('bl_theme', t);
  },
  restoreTheme: async () => {
    const t = await vault.get('bl_theme');
    if (t === 'light' || t === 'dark') set({ theme: t });
  },

  startTimer: (t) => {
    set({ timer: t });
    vault.set('active_timer', JSON.stringify(t)); // App 被杀也能恢复
  },
  stopTimer: () => {
    set({ timer: null });
    vault.del('active_timer');
  },
  // 冷启动恢复计时器（只恢复时间戳，不靠前台累加）
  restoreTimer: async () => {
    const raw = await vault.get('active_timer');
    if (raw) {
      try { set({ timer: JSON.parse(raw) }); } catch { /* ignore */ }
    }
  },
}));
