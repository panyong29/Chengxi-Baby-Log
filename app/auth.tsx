import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../store/useStore';
import { joinWithInviteCode, pb, registerAndCreateFamily } from '../api/pocketbase';
import { Card, GhostBtn, Hint, Label, PrimaryBtn, useTheme } from '../components/ui';

export default function AuthScreen() {
  const T = useTheme();
  const router = useRouter();
  const setAuth = useStore((s) => s.setAuth);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [baby, setBaby] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const inputStyle = {
    backgroundColor: T.card2, borderColor: T.line, borderWidth: 1,
    borderRadius: 12, padding: 12, fontSize: 17, color: T.text, marginBottom: 4,
  };

  async function submit() {
    if (busy) return;
    if (!nickname.trim()) return Alert.alert('提示', '先填个昵称');
    setBusy(true);
    try {
      if (mode === 'create') {
        if (!baby.trim()) { Alert.alert('提示', '给宝宝起个昵称'); setBusy(false); return; }
        if (password.length < 8) { Alert.alert('提示', '密码至少 8 位（只用一次，平时不用记）'); setBusy(false); return; }
        const r = await registerAndCreateFamily({
          nickname: nickname.trim(), password, babyNickname: baby.trim(),
        });
        const u: any = pb.authStore.record;
        setAuth({
          userId: u.id, nickname: u.nickname,
          family: { id: r.family, babyNickname: baby.trim(), inviteCode: r.invite_code },
        });
      } else {
        if (!code.trim()) { Alert.alert('提示', '输入家庭邀请码'); setBusy(false); return; }
        const r = await joinWithInviteCode({ inviteCode: code.trim(), nickname: nickname.trim() });
        const u: any = pb.authStore.record;
        const fam: any = await pb.collection('family').getOne(r.family);
        setAuth({
          userId: u.id, nickname: u.nickname,
          family: {
            id: fam.id, babyNickname: fam.baby_nickname,
            babyBirthdate: fam.baby_birthdate, inviteCode: fam.invite_code,
          },
        });
      }
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('出错了', e.message || '请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: 20, paddingTop: 72 }}>
      <Text style={{ color: T.text, fontSize: 30, fontWeight: '800', marginBottom: 6 }}>🍼 宝宝记录</Text>
      <Hint>一家人的喂养 / 尿布 / 睡眠，都记在这里。</Hint>
      <View style={{ height: 20 }} />

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {(['create', 'join'] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={{ flex: 1 }}>
            <GhostBtn text={m === 'create' ? '我是爸爸 · 建家庭' : '我是家人 · 输邀请码加入'} onPress={() => setMode(m)} />
            {mode === m && <View style={{ height: 3, backgroundColor: T.acc, borderRadius: 2, marginTop: 6 }} />}
          </Pressable>
        ))}
      </View>

      <Card>
        <Label>你的昵称</Label>
        <TextInput value={nickname} onChangeText={setNickname} placeholder="例如：爸爸" placeholderTextColor={T.sub} style={inputStyle} />
        {mode === 'create' ? (
          <>
            <Label>宝宝昵称（你自己填，不用真名）</Label>
            <TextInput value={baby} onChangeText={setBaby} placeholder="例如：澄澄" placeholderTextColor={T.sub} style={inputStyle} />
            <Label>设个密码（只用一次，平时不用记）</Label>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="至少 8 位" placeholderTextColor={T.sub} style={inputStyle} />
          </>
        ) : (
          <>
            <Label>家庭邀请码</Label>
            <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="例如：澄 7X2K" placeholderTextColor={T.sub} style={inputStyle} />
            <Hint>找爸爸要邀请码，输入即加入，无需注册。</Hint>
          </>
        )}
        <View style={{ height: 12 }} />
        <PrimaryBtn text={busy ? '请稍候…' : mode === 'create' ? '创建家庭' : '加入家庭'} onPress={submit} />
      </Card>
    </ScrollView>
  );
}
