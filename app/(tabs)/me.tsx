import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useStore } from '../../store/useStore';
import { fetchMembers, logout, pb, refreshInviteCode } from '../../api/pocketbase';
import { Card, GhostBtn, Hint, Label, PrimaryBtn, styles, useTheme } from '../../components/ui';

export default function MeScreen() {
  const T = useTheme();
  const router = useRouter();
  const { family, nickname, userId, clearAuth } = useStore();
  const [members, setMembers] = useState<{ id: string; nickname: string; role: string }[]>([]);
  const [code, setCode] = useState(family?.inviteCode || '');
  const [nick, setNick] = useState('');

  useFocusEffect(useCallback(() => {
    setCode(family?.inviteCode || '');
    if (family) fetchMembers(family.id).then(setMembers).catch(() => {});
  }, [family]));

  async function onRefreshCode() {
    if (!family) return;
    Alert.alert('换邀请码？', '旧码立即失效，已加入的成员不受影响。', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认更换', style: 'destructive',
        onPress: async () => {
          const c = await refreshInviteCode(family.id);
          setCode(c);
          useStore.setState({ family: { ...family, inviteCode: c } });
          Alert.alert('已更换', '新邀请码：' + c);
        },
      },
    ]);
  }

  async function onSaveNick() {
    if (!nick.trim() || !family) return;
    await pb.collection('family').update(family.id, { baby_nickname: nick.trim() }).catch(() => {});
    Alert.alert('已保存', '宝宝昵称：' + nick.trim());
    useStore.setState({ family: { ...family, babyNickname: nick.trim() } });
    setNick('');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: 16, paddingTop: 60 }}>
      <Card>
        <Label>家庭邀请码（给月嫂 / 老人输入即加入）</Label>
        <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: 6, textAlign: 'center', color: T.text, paddingVertical: 12 }}>
          {code}
        </Text>
        <Hint>对方下载 App → 输入邀请码 → 直接加入，无需注册。刷新后旧码失效，已加入成员不受影响。</Hint>
        <View style={styles.gap} />
        <View style={styles.row}>
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
        <Label>宝宝昵称（你自己填，不用真名）</Label>
        <TextInput
          value={nick} onChangeText={setNick} placeholder={family?.babyNickname || '例如：澄澄'}
          placeholderTextColor={T.sub}
          style={{ backgroundColor: T.card2, borderColor: T.line, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 17, color: T.text }}
        />
        <View style={styles.gap} />
        <GhostBtn text="保存昵称" onPress={onSaveNick} />
      </Card>

      <Card>
        <Label>数据</Label>
        <GhostBtn text="📤 导出 CSV（给医生看）" onPress={() => Alert.alert('导出', 'CSV 导出在阶段 5 接入（从本地数据库生成）。')} />
        <View style={styles.gap} />
        <GhostBtn text="🚪 退出登录" onPress={() => {
          Alert.alert('确认', '退出后本地数据保留，重新登录可同步。', [
            { text: '取消', style: 'cancel' },
            { text: '退出', style: 'destructive', onPress: async () => { await logout(); clearAuth(); router.replace('/auth'); } },
          ]);
        }} />
      </Card>
    </ScrollView>
  );
}
