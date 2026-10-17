import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActBtn, Card, GhostBtn, Hint, Label, PrimaryBtn, styles, useTheme, ScreenScroll } from '../components/ui';
import { logEvent } from '../core/logging';
import type { EventKind } from '../core/types';

// O3：事件记录（疫苗 / 就医 / 其他）
const KINDS: { k: EventKind; emoji: string; text: string }[] = [
  { k: 'vaccine', emoji: '💉', text: '疫苗' },
  { k: 'medical', emoji: '🏥', text: '就医' },
  { k: 'other', emoji: '📌', text: '其他' },
];

export default function EventScreen() {
  const T = useTheme();
  const router = useRouter();
  const [kind, setKind] = useState<EventKind>('vaccine');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    if (!title.trim()) return Alert.alert('提示', '写一下事件内容，比如"乙肝第二针"');
    if (title.trim().length > 50) return Alert.alert('提示', '标题太长了，50 字以内');
    setBusy(true);
    try {
      await logEvent(kind, title.trim());
      Alert.alert('已记录', title.trim());
      router.back();
    } catch (e: any) {
      Alert.alert('保存失败', e.message || '请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenScroll>
      <Card>
        <Label>事件类型</Label>
        <View style={styles.grid2}>
          {KINDS.map(({ k, emoji, text }) => (
            <ActBtn key={k} emoji={emoji} text={text} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </View>
      </Card>
      <View style={styles.gap} />
      <Card>
        <Label>内容</Label>
        <TextInput
          value={title} onChangeText={setTitle} placeholder="例如：乙肝第二针 / 感冒就诊"
          placeholderTextColor={T.sub} maxLength={50}
          style={{ backgroundColor: T.card2, borderColor: T.line, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 17, color: T.text }}
        />
        <View style={styles.gap} />
        <PrimaryBtn text={busy ? '保存中…' : '保存事件'} onPress={save} />
      </Card>
      <View style={styles.gap} />
      <Hint>💡 之前发生的事去"补录"里记，可以选时间。</Hint>
      <View style={styles.gap} />
      <GhostBtn text="← 返回" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
