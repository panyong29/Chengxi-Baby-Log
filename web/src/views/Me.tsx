import { useEffect, useState } from 'react';
import { exportCSV, fetchMembers, getAccountEmail, getTheme, logout, refreshInviteCode, setTheme } from '../lib/pb';
import type { Family, Member } from '../lib/pb';

export default function Me({ family, nickname, onFamilyChange, onLogout }: {
  family: Family; nickname: string;
  onFamilyChange: (f: Family) => void;
  onLogout: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [theme, setT] = useState<'dark' | 'light'>(() => getTheme());
  const [msg, setMsg] = useState('');
  const [accountEmail] = useState(() => getAccountEmail());

  async function doExport() {
    try {
      await exportCSV(family);
      setMsg('✅ 已开始下载 CSV');
    } catch (e: any) {
      setMsg('导出失败：' + (e.message || '网络错误'));
    }
    setTimeout(() => setMsg(''), 2500);
  }

  useEffect(() => {
    fetchMembers(family.id).then(setMembers).catch(() => {});
  }, [family.id, family.inviteCode]);

  function toggleTheme() {
    const t = theme === 'dark' ? 'light' : 'dark';
    setT(t); setTheme(t);
    document.documentElement.dataset.theme = t;
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setMsg('✅ 邀请码已复制');
    } catch {
      setMsg('复制失败，长按手动复制：' + family.inviteCode);
    }
    setTimeout(() => setMsg(''), 2500);
  }

  async function refresh() {
    if (!confirm('刷新后旧邀请码失效，确定？')) return;
    try {
      const code = await refreshInviteCode(family.id);
      onFamilyChange({ ...family, inviteCode: code });
      setMsg('✅ 已生成新邀请码');
    } catch (e: any) {
      setMsg('失败：' + (e.message || '网络错误'));
    }
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div className="page">
      <div className="card">
        <div className="lbl">👤 {nickname}</div>
        <div className="hint">宝宝：{family.babyNickname}{family.babyBirthdate ? ` · 生日 ${family.babyBirthdate}` : ''}</div>
      </div>

      <div className="card">
        <div className="lbl">🔑 家庭邀请码</div>
        <div className="invite">{family.inviteCode || '—'}</div>
        <div className="row">
          <button className="btn-ghost" onClick={copyCode}>📋 复制</button>
          <button className="btn-ghost" onClick={refresh}>↻ 换一个</button>
        </div>
        <div className="hint">月嫂 / 老人用这个码加入，全家数据互通。</div>
        {msg && <div className="ok">{msg}</div>}
      </div>

      <div className="card">
        <div className="lbl">👨‍👩‍👧 家庭成员 · {members.length} 人</div>
        {members.map((m) => (
          <div className="member" key={m.id}>
            <span>{m.nickname}</span>
            <span className="hint">{m.role === 'parent' ? '家长' : '成员'}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="lbl">📤 导出</div>
        <div className="row">
          <button className="btn-ghost" onClick={doExport}>📤 导出 CSV（给医生看）</button>
        </div>
      </div>

      <div className="card">
        <div className="lbl">🔐 登录账号</div>
        <div className="hint" style={{ userSelect: 'text' }}>{accountEmail || '—'}</div>
        <div className="hint">换设备 / 浏览器清数据后，用这个邮箱 + 建家庭时的密码登录即可找回。成员账号请用邀请码重新加入。</div>
      </div>

      <div className="card">
        <div className="row-between">
          <span className="lbl">🌙 深色模式</span>
          <button className="btn-ghost sm" onClick={toggleTheme}>{theme === 'dark' ? '🌙 开' : '☀️ 关'}</button>
        </div>
      </div>

      <button className="btn-ghost danger" onClick={() => { logout(); onLogout(); }}>退出登录</button>
      <div className="hint center" style={{ marginTop: 16 }}>Chengxi Baby Log · Web 版</div>
    </div>
  );
}
