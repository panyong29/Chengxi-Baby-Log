import { useEffect, useState } from 'react';
import { fetchTodayStats, fmtDuration, getTimer, logBottle, logBreast, logDiaper, logEvent, logSleep, logWeight, setTimer } from '../lib/pb';
import type { ActiveTimer, Family } from '../lib/pb';

type Sheet = null | 'feed' | 'diaper' | 'weight' | 'event';

const EVENT_KINDS = [
  { k: 'vaccine', emoji: '💉', text: '疫苗' },
  { k: 'medical', emoji: '🏥', text: '就医' },
  { k: 'other', emoji: '📌', text: '其他' },
] as const;

export default function Home({ family, userId, nickname, onBackfill }: { family: Family; userId: string; nickname: string; onBackfill: () => void }) {
  const [timer, setT] = useState<ActiveTimer | null>(() => getTimer());
  const [elapsed, setElapsed] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [ml, setMl] = useState('');
  const [kg, setKg] = useState('');
  const [eventKind, setEventKind] = useState<'vaccine' | 'medical' | 'other'>('vaccine');
  const [eventTitle, setEventTitle] = useState('');
  const [stats, setStats] = useState<{ feedCount: number; bottleMl: number; breastMin: number; diaperCount: number; sleepMin: number } | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!timer) return;
    const tick = () => setElapsed(Math.floor((Date.now() - timer.startedAt) / 1000));
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [timer]);

  useEffect(() => {
    fetchTodayStats(family.id).then(setStats).catch(() => {});
  }, [family.id, timer]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  function startFeedTimer() {
    const t: ActiveTimer = { kind: 'feed', label: `亲喂${side === 'left' ? '左胸' : '右胸'}计时中`, startedAt: Date.now(), extra: { side } };
    setTimer(t); setT(t); setSheet(null);
  }

  async function stopTimer() {
    if (!timer) return;
    const minutes = Math.max(1, Math.round((Date.now() - timer.startedAt) / 60000));
    try {
      if (timer.kind === 'feed') {
        await logBreast(family.id, userId, (timer.extra?.side as 'left' | 'right') || 'left', timer.startedAt, minutes);
        showToast(`已记录亲喂 · ${minutes} 分钟`);
      } else {
        await logSleep(family.id, userId, timer.startedAt, Date.now());
        showToast(`已记录睡觉 · ${minutes} 分钟`);
      }
      // 只在保存成功后清计时器；失败则保留计时，可重试点结束
      setTimer(null); setT(null);
    } catch (e: any) {
      showToast('保存失败，计时已保留，可重试点结束（' + (e.message || '网络错误') + '）');
    }
  }

  async function saveBottle() {
    const v = parseInt(ml, 10);
    if (!v || v <= 0) { showToast('先填毫升数'); return; }
    try {
      await logBottle(family.id, userId, v);
      showToast(`已记录瓶喂 ${v} ml`);
      setMl(''); setSheet(null);
    } catch (e: any) { showToast('保存失败：' + (e.message || '网络错误')); }
  }

  async function saveDiaper(kind: 'wet' | 'dirty' | 'mixed') {
    try {
      await logDiaper(family.id, userId, kind);
      showToast('已记录尿布');
      setSheet(null);
    } catch (e: any) { showToast('保存失败：' + (e.message || '网络错误')); }
  }

  async function saveWeight() {
    const v = parseFloat(kg);
    if (!v || isNaN(v)) { showToast('先填体重（kg）'); return; }
    if (v < 0.5 || v > 30) { showToast('体重范围 0.5–30 kg'); return; }
    try {
      await logWeight(family.id, userId, Math.round(v * 100) / 100);
      showToast(`已记录体重 ${v} kg`);
      setKg(''); setSheet(null);
    } catch (e: any) { showToast('保存失败：' + (e.message || '网络错误')); }
  }

  async function saveEvent() {
    if (!eventTitle.trim()) { showToast('写一下事件内容'); return; }
    try {
      await logEvent(family.id, userId, eventKind, eventTitle.trim());
      showToast('已记录事件');
      setEventTitle(''); setSheet(null);
    } catch (e: any) { showToast('保存失败：' + (e.message || '网络错误')); }
  }

  function startSleep() {
    const t: ActiveTimer = { kind: 'sleep', label: '睡觉计时中', startedAt: Date.now() };
    setTimer(t); setT(t);
  }

  return (
    <div className="page">
      <div className="home-head">
        <div>
          <div className="home-title">🍼 宝宝记录</div>
          <div className="home-sub">{family.babyNickname} · {nickname}</div>
        </div>
      </div>

      {timer && (
        <div className="card timer-card">
          <div className="lbl">🟢 {timer.label}</div>
          <div className="timer-num">{fmtDuration(elapsed)}</div>
          <button className="btn-primary" onClick={stopTimer}>结束</button>
        </div>
      )}

      <div className="grid2">
        <button className="act" onClick={() => setSheet('feed')}><span className="act-emoji">🍼</span><span>喂奶</span></button>
        <button className="act" onClick={() => setSheet('diaper')}><span className="act-emoji">💩</span><span>尿布</span></button>
        <button className="act" onClick={startSleep} disabled={!!timer}><span className="act-emoji">😴</span><span>睡觉</span></button>
        <button className="act" onClick={() => setSheet('weight')}><span className="act-emoji">⚖️</span><span>体重</span></button>
        <button className="act" onClick={() => setSheet('event')}><span className="act-emoji">📌</span><span>事件</span></button>
        <button className="act" onClick={onBackfill}><span className="act-emoji">✏️</span><span>补录</span></button>
      </div>

      <div className="card">
        <div className="lbl">📊 今日小结</div>
        {stats ? (
          <div className="stats">
            <div><b>{stats.feedCount}</b><span>喂奶次</span></div>
            <div><b>{stats.bottleMl}</b><span>奶粉 ml</span></div>
            <div><b>{stats.diaperCount}</b><span>尿布次</span></div>
            <div><b>{stats.sleepMin}</b><span>睡眠分</span></div>
          </div>
        ) : (
          <div className="hint">加载中…</div>
        )}
      </div>

      {sheet === 'feed' && (
        <div className="sheet-mask" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">🍼 喂奶</div>
            <div className="seg">
              <button className={side === 'left' ? 'on' : ''} onClick={() => setSide('left')}>🤱 左胸</button>
              <button className={side === 'right' ? 'on' : ''} onClick={() => setSide('right')}>🤱 右胸</button>
            </div>
            <button className="btn-primary" disabled={!!timer} onClick={startFeedTimer}>开始亲喂计时</button>
            <div className="divider">或直接记瓶喂</div>
            <div className="ml-row">
              {[60, 90, 120, 150].map((v) => (
                <button key={v} className={'chip' + (ml === String(v) ? ' on' : '')} onClick={() => setMl(String(v))}>{v}</button>
              ))}
            </div>
            <input className="inp" value={ml} onChange={(e) => setMl(e.target.value)} inputMode="numeric" placeholder="或手动输入 ml" />
            <button className="btn-primary" onClick={saveBottle}>保存这次瓶喂</button>
            <button className="btn-ghost" onClick={() => setSheet(null)}>取消</button>
          </div>
        </div>
      )}

      {sheet === 'diaper' && (
        <div className="sheet-mask" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">💩 尿布</div>
            <div className="grid2">
              <button className="act" onClick={() => saveDiaper('wet')}><span className="act-emoji">💧</span><span>尿湿</span></button>
              <button className="act" onClick={() => saveDiaper('dirty')}><span className="act-emoji">💩</span><span>便便</span></button>
            </div>
            <div style={{ height: 8 }} />
            <button className="act wide" onClick={() => saveDiaper('mixed')}><span className="act-emoji">💧💩</span><span>混合</span></button>
            <div style={{ height: 8 }} />
            <button className="btn-ghost" onClick={() => setSheet(null)}>取消</button>
          </div>
        </div>
      )}

      {sheet === 'weight' && (
        <div className="sheet-mask" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">⚖️ 体重</div>
            <input className="inp" value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" placeholder="例如：3.65（kg）" />
            <button className="btn-primary" onClick={saveWeight}>保存这次体重</button>
            <div className="hint">💡 建议固定时间称（比如每天早上喂奶前）。</div>
            <button className="btn-ghost" onClick={() => setSheet(null)}>取消</button>
          </div>
        </div>
      )}

      {sheet === 'event' && (
        <div className="sheet-mask" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">📌 事件</div>
            <div className="seg">
              {EVENT_KINDS.map(({ k, emoji, text }) => (
                <button key={k} className={eventKind === k ? 'on' : ''} onClick={() => setEventKind(k)}>{emoji} {text}</button>
              ))}
            </div>
            <input className="inp" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="例如：乙肝第二针" maxLength={50} />
            <button className="btn-primary" onClick={saveEvent}>保存事件</button>
            <div className="hint">💡 之前发生的事去"补录"里记，可以选时间。</div>
            <button className="btn-ghost" onClick={() => setSheet(null)}>取消</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
