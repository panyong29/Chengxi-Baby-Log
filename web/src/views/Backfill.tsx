import { useState } from 'react';
import { logBottle, logDiaper, logEvent, logSleep, logWeight } from '../lib/pb';
import type { Family } from '../lib/pb';

type Kind = 'feed' | 'diaper' | 'sleep' | 'weight' | 'event';

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Backfill({ family, userId, onDone }: { family: Family; userId: string; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>('feed');
  const [diaperKind, setDiaperKind] = useState<'wet' | 'dirty' | 'mixed'>('wet');
  const [at, setAt] = useState(() => toLocalInput(new Date()));
  const [ml, setMl] = useState('90');
  const [sleepMin, setSleepMin] = useState('60'); // O4：补录睡眠时长
  const [kg, setKg] = useState('');
  const [eventKind, setEventKind] = useState<'vaccine' | 'medical' | 'other'>('vaccine');
  const [eventTitle, setEventTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit() {
    const ts = new Date(at).getTime();
    if (isNaN(ts)) { setMsg('时间格式不对'); return; }
    if (ts > Date.now()) { setMsg('补录时间不能是未来'); return; }
    setBusy(true);
    try {
      if (kind === 'feed') {
        // G5：之前 parseInt(ml,10)||90，输错会静默记成 90ml
        const v = parseInt(ml, 10);
        if (!v || v <= 0) { setMsg('毫升数填的不对'); setBusy(false); return; }
        if (v > 500) { setMsg('毫升数不太对吧？最大 500ml'); setBusy(false); return; }
        await logBottle(family.id, userId, v, ts);
      } else if (kind === 'diaper') {
        await logDiaper(family.id, userId, diaperKind, ts);
      } else if (kind === 'sleep') {
        const mins = parseInt(sleepMin, 10);
        if (!mins || mins <= 0 || mins > 1440) { setMsg('睡眠时长填的不对（1–1440 分钟）'); setBusy(false); return; }
        await logSleep(family.id, userId, ts - mins * 60000, ts, undefined, true);
      } else if (kind === 'weight') {
        const v = parseFloat(kg);
        if (!v || isNaN(v)) { setMsg('先填体重（kg）'); setBusy(false); return; }
        if (v < 0.5 || v > 30) { setMsg('体重范围 0.5–30 kg'); setBusy(false); return; }
        await logWeight(family.id, userId, Math.round(v * 100) / 100, ts);
      } else {
        if (!eventTitle.trim()) { setMsg('写一下事件内容'); setBusy(false); return; }
        await logEvent(family.id, userId, eventKind, eventTitle.trim(), ts);
      }
      setMsg('✅ 补录成功');
      setTimeout(onDone, 800);
    } catch (e: any) {
      setMsg('保存失败：' + (e.message || '网络错误'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="lbl">补录类型</div>
        <div className="grid2">
          <button className={'act' + (kind === 'feed' ? ' on' : '')} onClick={() => setKind('feed')}><span className="act-emoji">🍼</span><span>喂奶</span></button>
          <button className={'act' + (kind === 'diaper' ? ' on' : '')} onClick={() => setKind('diaper')}><span className="act-emoji">💩</span><span>尿布</span></button>
          <button className={'act' + (kind === 'sleep' ? ' on' : '')} onClick={() => setKind('sleep')}><span className="act-emoji">😴</span><span>睡觉</span></button>
          <button className={'act' + (kind === 'weight' ? ' on' : '')} onClick={() => setKind('weight')}><span className="act-emoji">⚖️</span><span>体重</span></button>
          <button className={'act' + (kind === 'event' ? ' on' : '')} onClick={() => setKind('event')}><span className="act-emoji">📌</span><span>事件</span></button>
        </div>

        {kind === 'feed' && (
          <>
            <div className="lbl" style={{ marginTop: 12 }}>毫升数</div>
            <div className="ml-row">
              {[60, 90, 120, 150].map((v) => (
                <button key={v} className={'chip' + (ml === String(v) ? ' on' : '')} onClick={() => setMl(String(v))}>{v}</button>
              ))}
            </div>
            <input className="inp" value={ml} onChange={(e) => setMl(e.target.value)} inputMode="numeric" placeholder="手动输入 ml" />
          </>
        )}
        {kind === 'diaper' && (
          <>
            <div className="lbl" style={{ marginTop: 12 }}>尿布类型</div>
            <div className="grid2">
              {([['wet', '💧', '尿湿'], ['dirty', '💩', '便便'], ['mixed', '💧💩', '混合']] as const).map(([k, e, t]) => (
                <button key={k} className={'act' + (diaperKind === k ? ' on' : '')} onClick={() => setDiaperKind(k)}>
                  <span className="act-emoji">{e}</span><span>{t}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {kind === 'sleep' && (
          <>
            <div className="lbl" style={{ marginTop: 12 }}>睡了多久（分钟）</div>
            <input className="inp" value={sleepMin} onChange={(e) => setSleepMin(e.target.value)} inputMode="numeric" placeholder="例如：90" />
          </>
        )}
        {kind === 'weight' && (
          <>
            <div className="lbl" style={{ marginTop: 12 }}>体重（kg）</div>
            <input className="inp" value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" placeholder="例如：3.65" />
          </>
        )}
        {kind === 'event' && (
          <>
            <div className="lbl" style={{ marginTop: 12 }}>事件类型</div>
            <div className="seg">
              <button className={eventKind === 'vaccine' ? 'on' : ''} onClick={() => setEventKind('vaccine')}>💉 疫苗</button>
              <button className={eventKind === 'medical' ? 'on' : ''} onClick={() => setEventKind('medical')}>🏥 就医</button>
              <button className={eventKind === 'other' ? 'on' : ''} onClick={() => setEventKind('other')}>📌 其他</button>
            </div>
            <div className="lbl" style={{ marginTop: 12 }}>内容</div>
            <input className="inp" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="例如：乙肝第二针" maxLength={50} />
          </>
        )}
        <div className="lbl" style={{ marginTop: 12 }}>发生时间</div>
        <input className="inp" type="datetime-local" value={at} max={toLocalInput(new Date())} onChange={(e) => setAt(e.target.value)} />
        {msg && <div className={msg.startsWith('✅') ? 'ok' : 'err'}>{msg}</div>}
        <div style={{ height: 12 }} />
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? '保存中…' : '保存补录'}</button>
      </div>
    </div>
  );
}
