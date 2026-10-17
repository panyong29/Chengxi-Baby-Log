import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, GhostBtn, Hint, Label, PrimaryBtn, styles, useTheme, ScreenScroll } from '../components/ui';
import { logWeight } from '../core/logging';

// O3：体重记录（kg，保留 2 位小数）
export default function WeightScreen() {
  const T = useTheme();
  const router = useRouter();
  const [kg, setKg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const v = parseFloat(kg);
    if (!v || isNaN(v)) return Alert.alert('提示', '先填体重数字（kg）');
    if (v < 0.5 || v > 30) return Alert.alert('提示', '体重范围 0.5–30 kg，确认下数字对不对');
    setBusy(true);
    try {
      await logWeight(Math.round(v * 100) / 100);
      Alert.alert('已记录', `体重 ${v} kg`);
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
        <Label>体重（kg）</Label>
        <TextInput
          value={kg} onChangeText={setKg} keyboardType="decimal-pad" placeholder="例如：3.65"
          placeholderTextColor={T.sub}
          style={{ backgroundColor: T.card2, borderColor: T.line, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 24, color: T.text, textAlign: 'center' }}
        />
        <View style={styles.gap} />
        <PrimaryBtn text={busy ? '保存中…' : '保存这次体重'} onPress={save} />
      </Card>
      <View style={styles.gap} />
      <Hint>💡 建议固定时间称（比如每天早上喂奶前），曲线才有参考意义。</Hint>
      <View style={styles.gap} />
      <GhostBtn text="← 返回" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
