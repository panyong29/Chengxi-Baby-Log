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
  startTimer: (t: ActiveTimer) => void;
  stopTimer: () => void;
  restoreTimer: () => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
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
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

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
