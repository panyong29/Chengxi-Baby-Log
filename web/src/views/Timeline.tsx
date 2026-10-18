import { useCallback, useEffect, useState } from 'react';
import { fetchTimeline, pb } from '../lib/pb';
import type { Family, TimelineItem } from '../lib/pb';

export default function Timeline({ family }: { family: Family }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchTimeline(family.id));
    } catch { /* ignore */ }
    setLoading(false);
  }, [family.id]);

  async function onDelete(item: TimelineItem) {
    // 二次确认：第一次点变成"确认删除"，再点一次才执行；点别处自动复位
    if (confirmId !== item.id) {
      setConfirmId(item.id);
      setTimeout(() => setConfirmId((c) => (c === item.id ? null : c)), 4000);
      return;
    }
    setConfirmId(null);
    try {
      await pb.collection(item.collection).update(item.id, { deleted: true });
      load();
    } catch (e: any) {
      alert('删除失败：' + (e.message || '网络错误'));
    }
  }

  useEffect(() => {
    load();
    // Realtime：全家任何设备记一笔，这里自动刷新
    const unsubs: Array<() => void> = [];
    (['feed_logs', 'diaper_logs', 'sleep_logs', 'weight_logs', 'event_logs'] as const).forEach((col) => {
      pb.collection(col).subscribe('*', (e: any) => {
        if (e.record?.family === family.id) load();
      }).then((u) => unsubs.push(u)).catch(() => {});
    });
    return () => { unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } }); };
  }, [load, family.id]);

  return (
    <div className="page">
      <div className="card row-between">
        <span className="lbl">时间线 · {items.length} 条（全家同步）</span>
        <button className="btn-ghost sm" onClick={load}>↻ 刷新</button>
      </div>
      {loading ? (
        <div className="card"><div className="hint">加载中…</div></div>
      ) : items.length === 0 ? (
        <div className="card"><div className="hint center">还没有记录，去记第一笔吧 🍼</div></div>
      ) : (
        <div className="card tl-list">
          {items.map((i) => (
            <div className="tl-item" key={i.id}>
              <div className="tl-emoji">{i.emoji}</div>
              <div className="tl-body">
                <div className="tl-title">{i.title}</div>
                <div className="tl-meta">{i.meta}</div>
              </div>
              <button
                className={'tl-del' + (confirmId === i.id ? ' arm' : '')}
                onClick={() => onDelete(i)}
                title="删除这条记录"
              >
                {confirmId === i.id ? '确认删除？' : '删除'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
