import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../../store/useStore';
import { ActBtn, Card, Hint, Label, PrimaryBtn, styles, useTheme } from '../../components/ui';
import { fmtDuration } from '../../core/time';
import { stopTimerAndSave } from '../../core/logging';

export default function HomeScreen() {
  const T = useTheme();
  const router = useRouter();
  const { family, nickname, theme, toggleTheme, timer } = useStore();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!timer) return;
    const tick = () => setElapsed(Math.floor((Date.now() - timer.startedAt) / 1000));
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [timer]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: 16, paddingTop: 60 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
        <View>
          <Text style={{ color: T.text, fontSize: 20, fontWeight: '700' }}>🍼 宝宝记录</Text>
          <Text style={{ color: T.sub, fontSize: 13 }}>{family?.babyNickname || '宝宝'} · {nickname}</Text>
        </View>
        <Pressable
          onPress={toggleTheme}
          style={{ backgroundColor: T.card, borderColor: T.line, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}
        >
          <Text style={{ fontSize: 18 }}>{theme === 'dark' ? '🌙' : '☀️'}</Text>
        </Pressable>
      </View>

      {timer && (
        <Card>
          <Label><Text>🟢 {timer.label}</Text></Label>
          <Text style={{ color: T.text, fontSize: 52, fontWeight: '800', textAlign: 'center', letterSpacing: 2 }}>
            {fmtDuration(elapsed)}
          </Text>
          <View style={{ height: 8 }} />
          <PrimaryBtn text="结束" onPress={async () => {
            const r = await stopTimerAndSave();
            Alert.alert('已记录', r ? `${r.label} · 用时${r.minutes}分钟` : '');
          }} />
        </Card>
      )}

      <View style={styles.grid2}>
        <ActBtn emoji="🍼" text="喂奶" onPress={() => router.push('/feed')} />
        <ActBtn emoji="💩" text="尿布" onPress={() => router.push('/diaper')} />
      </View>
      <View style={styles.gap} />
      <View style={styles.grid2}>
        <ActBtn emoji="😴" text="睡觉" onPress={() => router.push('/sleep')} />
        <ActBtn emoji="✏️" text="补录" onPress={() => router.push('/backfill')} />
      </View>
      <View style={styles.gap} />
      <Card>
        <Label>今日小结</Label>
        <Hint>接入数据库后这里显示真实统计（喂奶次数/尿布次数/睡眠时长）。</Hint>
      </Card>
    </ScrollView>
  );
}
