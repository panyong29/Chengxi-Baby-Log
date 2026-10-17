import { useCallback, useState } from 'react';
import { Alert,  Text,  TextInput,  View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { and, asc, eq, ne } from 'drizzle-orm';
import { useStore } from '../../store/useStore';
import { fetchMembers, logout, pb, refreshInviteCode } from '../../api/pocketbase';
import { getPendingCount } from '../../sync/engine';
import { vault } from '../../core/adapters';
import { db } from '../../db/client';
import { diaperLogs, eventLogs, feedLogs, sleepLogs, weightLogs } from '../../db/schema';
import { fmtDateTime } from '../../core/time';
import { Card, GhostBtn, Hint, Label, PrimaryBtn, styles, useTheme, ScreenScroll } from '../../components/ui';

export default function MeScreen() {
  const T = useTheme();
  const router = useRouter();
  const { family, nickname, userId, clearAuth } = useStore();
  const [members, setMembers] = useState<{ id: string; nickname: string; role: string }[]>([]);
  const [code, setCode] = useState(family?.inviteCode || '');
  const [nick, setNick] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [pending, setPending] = useState(0);
  const [exporting, setExporting] = useState(false);
  // G3：只有创建者（parent）能改宝宝昵称 / 换邀请码（服务端 rule 限制），UI 上如实处理
  const isParent = members.some((m) => m.id === userId && m.role === 'parent');

  useFocusEffect(useCallback(() => {
    setCode(family?.inviteCode || '');
    if (family) fetchMembers(family.id).then(setMembers).catch(() => {});
    getPendingCount().then(setPending).catch(() => {});
    vault.get('account_secret').then((raw) => {
      try { setAccountEmail(JSON.parse(raw || '{}').email || ''); } catch { /* ignore */ }
    });
  }, [family]));

  async function onRefreshCode() {
    if (!family) return;
    if (!isParent) return Alert.alert('提示', '只有家庭创建者可以更换邀请码');
    Alert.alert('换邀请码？', '旧码立即失效，已加入的成员不受影响。', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认更换', style: 'destructive',
        onPress: async () => {
          try {
            const c = await refreshInviteCode(family.id);
            setCode(c);
            useStore.setState({ family: { ...family, inviteCode: c } });
            Alert.alert('已更换', '新邀请码：' + c);
          } catch (e: any) {
            // G3：之前无 catch，失败时按钮点了没反应
            Alert.alert('更换失败', e?.data?.message || e.message || '请重试');
          }
        },
      },
    ]);
  }

  async function onCopyCode() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    Alert.alert('已复制', '邀请码已复制，直接发给家人粘贴就行。');
  }

  async function onSaveNick() {
    if (!nick.trim() || !family) return;
    if (!isParent) return Alert.alert('提示', '只有家庭创建者可以改宝宝昵称');
    try {
      await pb.collection('family').update(family.id, { baby_nickname: nick.trim() });
      Alert.alert('已保存', '宝宝昵称：' + nick.trim());
      useStore.setState({ family: { ...family, babyNickname: nick.trim() } });
      setNick('');
    } catch (e: any) {
      // G3：之前 catch 后仍弹"已保存"，实际 403 失败——现在如实报错
      Alert.alert('保存失败', e?.data?.message || e.message || '请重试');
    }
  }

  async function onCopyAccount() {
    if (!accountEmail) return;
    await Clipboard.setStringAsync(accountEmail);
    Alert.alert('已复制', '账号邮箱已复制，换设备登录时用它。');
  }

  /** O1：CSV 导出（之前是占位按钮）。从本地数据库生成，带 BOM 以便 Excel 直接打开中文。 */
  async function onExportCSV() {
    if (!family || exporting) return;
    setExporting(true);
    try {
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows: string[] = ['类型,时间,内容,备注'];
      const alive = (t: any) => and(eq(t.familyId, family.id), ne(t.deleted, 1));
      const feeds = await db.select().from(feedLogs).where(alive(feedLogs)).orderBy(asc(feedLogs.startedAt));
      for (const f of feeds) {
        const detail = f.kind === 'breast'
          ? `亲喂${f.side === 'left' ? '左' : '右'}${f.durationMin ?? ''}分钟`
          : `瓶喂${f.amountMl ?? ''}ml`;
        rows.push([ '喂奶', fmtDateTime(f.startedAt!), detail, f.note ].map(esc).join(','));
      }
      const diapers = await db.select().from(diaperLogs).where(alive(diaperLogs)).orderBy(asc(diaperLogs.loggedAt));
      const DK: Record<string, string> = { wet: '湿', dirty: '脏', mixed: '混合' };
      for (const d of diapers) rows.push(['尿布', fmtDateTime(d.loggedAt!), DK[d.kind!] || d.kind, d.note].map(esc).join(','));
      const sleeps = await db.select().from(sleepLogs).where(alive(sleepLogs)).orderBy(asc(sleepLogs.startedAt));
      for (const s of sleeps) {
        const dur = s.endedAt ? `${Math.round((s.endedAt - s.startedAt!) / 60000)}分钟` : '进行中';
        rows.push(['睡觉', fmtDateTime(s.startedAt!), dur, s.note].map(esc).join(','));
      }
      const weights = await db.select().from(weightLogs).where(alive(weightLogs)).orderBy(asc(weightLogs.loggedAt));
      for (const w of weights) rows.push(['体重', fmtDateTime(w.loggedAt!), `${w.weightKg}kg`, w.note].map(esc).join(','));
      const events = await db.select().from(eventLogs).where(alive(eventLogs)).orderBy(asc(eventLogs.loggedAt));
      const EK: Record<string, string> = { vaccine: '疫苗', medical: '就医', other: '事件' };
      for (const e of events) rows.push([EK[e.kind!] || '事件', fmtDateTime(e.loggedAt!), e.title, e.note].map(esc).join(','));
      if (rows.length === 1) { Alert.alert('提示', '还没有记录，导出的文件是空的'); return; }
      const csv = '﻿' + rows.join('\n');
      const name = `宝宝记录_${family.babyNickname}_${new Date().toISOString().slice(0, 10)}.csv`;
      const path = (FileSystem.cacheDirectory || '') + name;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { dialogTitle: '导出宝宝记录 CSV' });
      } else {
        await Clipboard.setStringAsync(csv);
        Alert.alert('已复制', '此设备不支持直接分享，CSV 内容已复制到剪贴板。');
      }
    } catch (e: any) {
      Alert.alert('导出失败', e.message || '请重试');
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScreenScroll>
      <Card>
        <Label>家庭邀请码（给月嫂 / 老人输入即加入）</Label>
        <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: 6, textAlign: 'center', color: T.text, paddingVertical: 12 }}>
          {code}
        </Text>
        <Hint>对方下载 App → 输入邀请码 → 直接加入，无需注册。刷新后旧码失效，已加入成员不受影响。</Hint>
        <View style={styles.gap} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}><GhostBtn text="📋 复制" onPress={onCopyCode} /></View>
          <View style={{ flex: 1 }}><GhostBtn text="换一个" onPress={onRefreshCode} /></View>
        </View>
      </Card>

      <Card>
        <Label>家庭成员（{members.length}）</Label>
        {members.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
            <Text style={{ color: T.text, fontSize: 15 }}>
              {m.role === 'parent' ? '👨' : '👩'} {m.nickname}{m.id === userId ? '（我）' : ''}
            </Text>
            <Text style={{ color: T.sub, fontSize: 13 }}>{m.role === 'parent' ? '管理员' : '成员'}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Label>宝宝昵称（你自己填，不用真名）</Label>        <TextInput
          value={nick} onChangeText={setNick} placeholder={family?.babyNickname || '例如：澄澄'}
          placeholderTextColor={T.sub}
          style={{ backgroundColor: T.card2, borderColor: T.line, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 17, color: T.text }}
        />
        <View style={styles.gap} />
        <GhostBtn text="保存昵称" onPress={onSaveNick} />
      </Card>

      <Card>
        <Label>数据</Label>
        <Hint>待同步：{pending} 条（有网络时自动补传）</Hint>
        <View style={styles.gap} />
        <GhostBtn text={exporting ? '导出中…' : '📤 导出 CSV（给医生看）'} onPress={onExportCSV} />
        <View style={styles.gap} />
        {/* O6：隐私披露 */}
        <Hint>🔒 记录仅保存在本机与自家服务器；App 启动时会向 Expo 检查更新。</Hint>
        <View style={styles.gap} />
        <GhostBtn text="🚪 退出登录" onPress={() => {
          Alert.alert('确认', '退出后本地数据保留，重新登录可同步。', [
            { text: '取消', style: 'cancel' },
            { text: '退出', style: 'destructive', onPress: async () => { await logout(); clearAuth(); router.replace('/auth'); } },
          ]);
        }} />
      </Card>

      {/* S5：登录账号展示——换设备/重装后凭此登回 */}
      <Card>
        <Label>登录账号</Label>
        <Text selectable style={{ color: T.text, fontSize: 14, paddingVertical: 6 }}>{accountEmail || '—'}</Text>
        <View style={styles.gap} />
        <GhostBtn text="📋 复制邮箱" onPress={onCopyAccount} />
        <View style={styles.gap} />
        <Hint>换设备/重装后，用这个邮箱 + 建家庭时的密码登录即可找回。成员账号换设备请用邀请码重新加入。</Hint>
      </Card>
    </ScreenScroll>
  );
}
