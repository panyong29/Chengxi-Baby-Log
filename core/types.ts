// 纯 TypeScript 领域类型：无任何平台依赖，小程序可直接复用
export type FeedKind = 'breast' | 'bottle';
export type BreastSide = 'left' | 'right';
export type DiaperKind = 'wet' | 'dirty' | 'mixed';
export type LogKind = 'feed' | 'diaper' | 'sleep';
export type Role = 'parent' | 'caregiver';

export interface FeedLog {
  localId: string;
  kind: FeedKind;
  side?: BreastSide | null;
  durationMin?: number | null;
  amountMl?: number | null;
  startedAt: number; // epoch ms UTC
  note?: string | null;
  isBackfill?: boolean;
  caregiverId: string;
  familyId: string;
}

export interface DiaperLog {
  localId: string;
  kind: DiaperKind;
  loggedAt: number;
  note?: string | null;
  isBackfill?: boolean;
  caregiverId: string;
  familyId: string;
}

export interface SleepLog {
  localId: string;
  startedAt: number;
  endedAt?: number | null;
  note?: string | null;
  isBackfill?: boolean;
  caregiverId: string;
  familyId: string;
}

export interface Family {
  id: string;
  babyNickname: string;
  babyBirthdate?: string;
  inviteCode: string;
}

export interface Member {
  id: string;
  nickname: string;
  role: Role;
}

// 计时器状态（只存时间戳，不存累加值——App 被杀/重启不影响）
export interface ActiveTimer {
  kind: 'feed' | 'sleep';
  label: string;
  startedAt: number;
  extra?: Record<string, string>;
}
