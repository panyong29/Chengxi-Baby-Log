import { useState } from 'react';
import { joinWithInviteCode, loginWithPassword, registerAndCreateFamily } from '../lib/pb';
import type { Family } from '../lib/pb';

export default function Auth({ onDone }: { onDone: (s: { userId: string; nickname: string; family: Family }) => void }) {
  const [tab, setTab] = useState<'parent' | 'member' | 'login'>('parent');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [babyNickname, setBabyNickname] = useState('');
  const [babyBirthdate, setBabyBirthdate] = useState('2026-09-28');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    if (tab !== 'login' && !nickname.trim()) { setErr('先填你的昵称'); return; }
    setBusy(true);
    try {
      if (tab === 'parent') {
        if (password.length < 8) { setErr('密码至少 8 位'); setBusy(false); return; }
        if (!babyNickname.trim()) { setErr('填一下宝宝昵称'); return; }
        const s = await registerAndCreateFamily({ nickname: nickname.trim(), password, babyNickname: babyNickname.trim(), babyBirthdate });
        onDone(s);
      } else if (tab === 'login') {
        // S5：已有账号登录（换设备/重装后登回）
        if (!email.trim() || !password) { setErr('输入账号邮箱和密码'); setBusy(false); return; }
        const s = await loginWithPassword({ email: email.trim(), password });
        onDone(s);
      } else {
        if (!inviteCode.trim()) { setErr('先填邀请码'); setBusy(false); return; }
        const s = await joinWithInviteCode({ inviteCode: inviteCode.trim(), nickname: nickname.trim() });
        onDone(s);
      }
    } catch (e: any) {
      setErr(e.message || '出错了');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-logo">🍼</div>
        <h1 className="auth-title">Chengxi Baby Log</h1>
        <p className="auth-sub">宝宝吃 / 拉 / 睡，一家人一起记</p>
        <div className="seg">
          <button className={tab === 'parent' ? 'on' : ''} onClick={() => setTab('parent')}>我是爸爸 · 建家庭</button>
          <button className={tab === 'member' ? 'on' : ''} onClick={() => setTab('member')}>成员 · 邀请码加入</button>
          <button className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>已有账号登录</button>
        </div>
        {tab === 'login' ? (
          <>
            <label className="lbl">账号邮箱</label>
            <input className="inp" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="比如：pabc123@family.local" inputMode="email" />
            <label className="lbl">密码</label>
            <input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="建家庭时设的密码" />
          </>
        ) : (
          <>
            <label className="lbl">你的昵称</label>
            <input className="inp" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="比如：爸爸 / 妈妈" maxLength={20} />
            {tab === 'parent' ? (
              <>
                <label className="lbl">设置密码（≥8 位）</label>
                <input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="换设备登录用" />
                <label className="lbl">宝宝昵称</label>
                <input className="inp" value={babyNickname} onChange={(e) => setBabyNickname(e.target.value)} placeholder="比如：澄澄" maxLength={20} />
                <label className="lbl">宝宝生日</label>
                <input className="inp" type="date" value={babyBirthdate} onChange={(e) => setBabyBirthdate(e.target.value)} />
              </>
            ) : (
              <>
                <label className="lbl">家庭邀请码</label>
                <input className="inp" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="找爸爸要，比如：澄 ABCD" />
              </>
            )}
          </>
        )}
        {err && <div className="err">{err}</div>}
        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? '请稍候…' : tab === 'parent' ? '创建家庭并进入' : tab === 'member' ? '加入家庭' : '登录'}
        </button>
        <p className="hint">💡 账号密码会自动记住，换设备用同一套登录即可。邮箱在"我的"页可查。</p>
      </div>
    </div>
  );
}
