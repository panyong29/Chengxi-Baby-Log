// 纯 TypeScript 时间工具：UTC 存储、本地展示，小程序可直接复用
export const now = () => Date.now();

/** epoch ms -> 本地 "HH:mm" */
export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** epoch ms -> 本地 "M月d日 HH:mm" */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${fmtTime(ts)}`;
}

/** 秒 -> "mm:ss" / "h小时m分" */
export function fmtDuration(sec: number): string {
  if (sec < 3600) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${h}小时${m}分`;
}

/** 分钟 -> "X小时Y分" / "X分" */
export function fmtMinutes(min: number): string {
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}小时${min % 60}分`;
}

/** 距今 "X小时Y分前" / "X分前" / "刚刚" */
export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}小时${Math.floor((s % 3600) / 60)}分前`;
  return fmtDateTime(ts);
}

/** 本地日期 -> 当天 0 点（epoch ms） */
export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const FEED_KIND_LABEL: Record<string, string> = { breast: '亲喂', bottle: '瓶喂' };
export const DIAPER_KIND_LABEL: Record<string, string> = { wet: '湿', dirty: '脏', mixed: '混合' };
