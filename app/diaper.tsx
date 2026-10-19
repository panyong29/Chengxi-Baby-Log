import { useState } from 'react';
import { Alert,  TextInput,  View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActBtn, Card, GhostBtn, Hint, Label, PrimaryBtn, styles, useTheme, ScreenScroll } from '../components/ui';
import { logDiaper } from '../core/logging';
import type { DiaperKind } from '../core/types';

export default function DiaperScreen() {
  const T = useTheme();
  const router = useRouter();
  const [kind, setKind] = useState<DiaperKind | null>(null);
  const [note, setNote] = useState('');

  return (
    <ScreenScroll>
      <View style={styles.grid2}>
        <ActBtn emoji="💧" text="湿" selected={kind === 'wet'} onPress={() => setKind('wet')} />
        <ActBtn emoji="💩" text="脏" selected={kind === 'dirty'} onPress={() => setKind('dirty')} />
      </View>
      <View style={styles.gap} />
      <ActBtn emoji="💧💩" text="混合（湿+脏）" selected={kind === 'mixed'} onPress={() => setKind('mixed')} />
      <View style={styles.gap} />
      <Card>
        <Label>备注（可选，如颜色、性状）</Label>
        <TextInput
          value={note} onChangeText={setNote} placeholder="例如：墨绿色、较稀"
          placeholderTextColor={T.sub}
          style={{ backgroundColor: T.card2, borderColor: T.line, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 17, color: T.text }}
        />
      </Card>
      <PrimaryBtn text="保存" onPress={async () => {
        if (!kind) return Alert.alert('提示', '先选：湿 / 脏 / 混合');
        await logDiaper(kind, undefined, note.trim() || undefined);
        router.back();
      }} />
      <View style={styles.gap} />
      <GhostBtn text="← 返回" onPress={() => router.back()} />
      <View style={styles.gap} />
      <Hint>💡 大便颜色/性状有异常（血丝、陶土色、黑色柏油样）建议拍照并咨询医生。</Hint>
    </ScreenScroll>
  );
}
