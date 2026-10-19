import { useState } from 'react';
import { Alert,  Platform,  TextInput,  View } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ActBtn, Card, GhostBtn, Label, PrimaryBtn, styles, useTheme, ScreenScroll } from '../components/ui';
import { logBottle, logDiaper } from '../core/logging';
import { saveLocal } from '../sync/engine';
import { useStore } from '../store/useStore';
import { now } from '../core/time';
import type { DiaperKind } from '../core/types';

type Bk = 'feed' | 'diaper' | 'sleep' | null;

export default function BackfillScreen() {
  const T = useTheme();
  const router = useRouter();
  const [kind, setKind] = useState<Bk>(null);
  const [diaperKind, setDiaperKind] = useState<DiaperKind>('wet');
  const [at, setAt] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [ml, setMl] = useState('90');
  const [sleepMin, setSleepMin] = useState('60'); // O4：补录睡眠时长（分钟），默认 60

  async function submit() {
    if (!kind) return Alert.alert('提示', '先选补录类型');
    const ts = at.getTime();
    if (ts > now()) return Alert.alert('提示', '补录时间不能是未来');
    const s = useStore.getState();
    const ctx = { familyId: s.family!.id, caregiverId: s.userId };
    try {
      if (kind === 'feed') {
        // G5：之前 parseInt(ml,10)||90，输错会静默记成 90ml
        const v = parseInt(ml, 10);
        if (!v || v <= 0) return Alert.alert('提示', '毫升数填的不对，请输入数字');
        if (v > 500) return Alert.alert('提示', '毫升数不太对吧？最大 500ml');
        await logBottle(v, ts);
      } else if (kind === 'diaper') {
        await logDiaper(diaperKind, ts);
      } else {
        const mins = parseInt(sleepMin, 10);
        if (!mins || mins <= 0 || mins > 1440) return Alert.alert('提示', '睡眠时长填的不对（1–1440 分钟）');
        await saveLocal('sleep_logs', {
          startedAt: ts - mins * 60000, endedAt: ts, note: null, isBackfill: 1, ...ctx,
        });
      }
      router.back();
    } catch (e: any) {
      Alert.alert('出错了', e.message);
    }
  }

  return (
    <ScreenScroll>
      <Card>
        <Label>补录类型</Label>
        <View style={styles.grid2}>
          <ActBtn emoji="🍼" text="喂奶" selected={kind === 'feed'} onPress={() => setKind('feed')} />
          <ActBtn emoji="💩" text="尿布" selected={kind === 'diaper'} onPress={() => setKind('diaper')} />
        </View>
        <View style={styles.gap} />
        <ActBtn emoji="😴" text="睡觉" selected={kind === 'sleep'} onPress={() => setKind('sleep')} />
        {kind === 'diaper' && (
          <>
            <View style={styles.gap} />
            <Label>尿布类型</Label>
            <View style={styles.grid2}>
              {(['wet', 'dirty', 'mixed'] as DiaperKind[]).map((k) => (
                <ActBtn key={k} emoji={k === 'wet' ? '💧' : k === 'dirty' ? '💩' : '💧💩'}
                  text={{ wet: '湿', dirty: '脏', mixed: '混合' }[k]}
                  selected={diaperKind === k} onPress={() => setDiaperKind(k)} />
              ))}
            </View>
          </>
        )}
        {kind === 'feed' && (
          <>
            <View style={styles.gap} />
            <Label>瓶喂毫升数（ml）</Label>
            <TextInput
              value={ml} onChangeText={setMl} keyboardType="number-pad" placeholder="例如：90"
              placeholderTextColor={T.sub}
              style={{ backgroundColor: T.card2, borderColor: T.line, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 17, color: T.text }}
            />
          </>
        )}
        {kind === 'sleep' && (
          <>
            <View style={styles.gap} />
            <Label>睡了多久（分钟）</Label>
            <TextInput
              value={sleepMin} onChangeText={setSleepMin} keyboardType="number-pad" placeholder="例如：90"
              placeholderTextColor={T.sub}
              style={{ backgroundColor: T.card2, borderColor: T.line, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 17, color: T.text }}
            />
          </>
        )}
        <View style={styles.gap} />
        <Label>发生时间</Label>
        <GhostBtn text={at.toLocaleString('zh-CN', { hour12: false })} onPress={() => setShowPicker(true)} />
        {showPicker && (
          <DateTimePicker
            value={at} mode="datetime" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_, d) => { setShowPicker(Platform.OS === 'ios'); if (d) setAt(d); }}
          />
        )}
        <View style={styles.gap} />
        <PrimaryBtn text="保存补录" onPress={submit} />
      </Card>
      <GhostBtn text="← 返回" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
