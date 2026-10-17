import { useCallback, useEffect, useState } from 'react';
import { Alert,  Pressable,  Text,  View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { and, eq, gte, ne } from 'drizzle-orm';
import { useStore } from '../../store/useStore';
import { ActBtn, Card, Hint, Label, PrimaryBtn, styles, useTheme, ScreenScroll } from '../../components/ui';
import { fmtDuration, fmtMinutes, startOfToday } from '../../core/time';
import { stopTimerAndSave } from '../../core/logging';
import { db } from '../../db/client';
import { diaperLogs, feedLogs, sleepLogs } from '../../db/schema';

export default function HomeScreen() {
  const T = useTheme();
  const router = useRouter();
  const { family, nickname, theme, toggleTheme, timer } = useStore();
  const [elapsed, setElapsed] = useState(0);
  const [stats, setStats] = useState<{ feed: number; bottleMl: number; diaper: number; sleepMin: number } | null>(null);

  useEffect(() => {
    if (!timer) return;
    const tick = () => setElapsed(Math.floor((Date.now() - timer.startedAt) / 1000));
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [timer]);

  // O2：今日小结接真实数据（之前是占位）
  useFocusEffect(useCallback(() => {
    (async () => {
      if (!family) return;
      const dayStart = startOfToday();
      const alive = (t: any, col: any) => and(eq(t.familyId, family.id), ne(t.deleted, 1), gte(col, dayStart));
      const feeds = await db.select().from(feedLogs).where(alive(feedLogs, feedLogs.startedAt));
      const diapers = await db.select().from(diaperLogs).where(alive(diaperLogs, diaperLogs.loggedAt));
      const sleeps = await db.select().from(sleepLogs).where(alive(sleepLogs, sleepLogs.startedAt));
      setStats({
        feed: feeds.length,
        bottleMl: feeds.reduce((a, f) => a + (f.amountMl ?? 0), 0),
        diaper: diapers.length,
        sleepMin: sleeps.reduce((a, s) => a + (s.endedAt && s.startedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : 0), 0),
      });
    })();
  }, [family]));

  return (
    <ScreenScroll>
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
      <View style={styles.grid2}>
        <ActBtn emoji="⚖️" text="体重" onPress={() => router.push('/weight')} />
        <ActBtn emoji="📌" text="事件" onPress={() => router.push('/event')} />
      </View>
      <View style={styles.gap} />
      <Card>
        <Label>今日小结</Label>
        {stats ? (
          <Text style={{ color: T.text, fontSize: 15, lineHeight: 26 }}>
            🍼 喂奶 {stats.feed} 次{stats.bottleMl > 0 ? `（瓶喂 ${stats.bottleMl}ml）` : ''}{'\n'}
            💩 尿布 {stats.diaper} 次{'\n'}
            😴 睡眠 {stats.sleepMin > 0 ? fmtMinutes(stats.sleepMin) : '—'}
          </Text>
        ) : (
          <Hint>加载中…</Hint>
        )}
      </Card>
    </ScreenScroll>
  );
}
