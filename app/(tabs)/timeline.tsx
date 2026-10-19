import { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { desc, eq, and, ne, gte, lt } from 'drizzle-orm';
import { db } from '../../db/client';
import { diaperLogs, feedLogs, sleepLogs, weightLogs, eventLogs } from '../../db/schema';
import { useStore } from '../../store/useStore';
import { deleteLocal } from '../../sync/engine';
import { Card, Label, useTheme, Screen } from '../../components/ui';
import { fmtDateTime, fmtMinutes, timeAgo, FEED_KIND_LABEL, DIAPER_KIND_LABEL } from '../../core/time';

interface Item {
  id: string; // localId
  collection: 'feed_logs' | 'diaper_logs' | 'sleep_logs' | 'weight_logs' | 'event_logs';
  emoji: string; title: string; meta: string; ts: number;
}

const EVENT_META: Record<string, { emoji: string; text: string }> = {
  vaccine: { emoji: '💉', text: '疫苗' },
  medical: { emoji: '🏥', text: '就医' },
  other: { emoji: '📌', text: '事件' },
};

type FilterKind = 'all' | 'feed_logs' | 'diaper_logs' | 'sleep_logs' | 'weight_logs' | 'event_logs';

const FILTERS: Array<{ key: FilterKind; emoji: string; label: string }> = [
  { key: 'all', emoji: '📋', label: '全部' },
  { key: 'feed_logs', emoji: '🍼', label: '喂奶' },
  { key: 'diaper_logs', emoji: '💩', label: '尿布' },
  { key: 'sleep_logs', emoji: '😴', label: '睡觉' },
  { key: 'weight_logs', emoji: '⚖️', label: '体重' },
  { key: 'event_logs', emoji: '📌', label: '事件' },
];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtDay(ts: number): string {
  const d = new Date(ts);
  const diffDays = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  const suffix = diffDays === 0 ? '今天' : diffDays === 1 ? '昨天'
    : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${suffix}`;
}

export default function TimelineScreen() {
  const T = useTheme();
  const family = useStore((s) => s.family);
  const [items, setItems] = useState<Item[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [day, setDay] = useState(() => startOfDay(Date.now()));
  const [filter, setFilter] = useState<FilterKind>('all');
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    if (!family) return;
    const all: Item[] = [];
    const dayStart = day;
    const dayEnd = day + 86400000;
    const alive = (t: any, col: any) => and(
      eq(t.familyId, family.id),
      ne(t.deleted, 1),
      gte(col, dayStart),
      lt(col, dayEnd),
    );
    const want = (k: FilterKind) => filter === 'all' || filter === k;

    if (want('feed_logs')) {
      const feeds = await db.select().from(feedLogs)
        .where(alive(feedLogs, feedLogs.startedAt)).orderBy(desc(feedLogs.startedAt)).limit(200);
      for (const f of feeds) {
        const detail = f.kind === 'breast'
          ? `${f.side === 'left' ? '左胸' : '右胸'} ${f.durationMin} 分钟`
          : `${f.amountMl} ml`;
        all.push({
          id: f.localId, collection: 'feed_logs', emoji: '🍼', title: `${FEED_KIND_LABEL[f.kind!]} · ${detail}`,
          meta: `${fmtDateTime(f.startedAt!)} · ${timeAgo(f.startedAt!)}`, ts: f.startedAt!,
        });
      }
    }
    if (want('diaper_logs')) {
      const diapers = await db.select().from(diaperLogs)
        .where(alive(diaperLogs, diaperLogs.loggedAt)).orderBy(desc(diaperLogs.loggedAt)).limit(200);
      for (const d of diapers) {
        all.push({
          id: d.localId, collection: 'diaper_logs', emoji: '💩',
          title: `尿布 · ${DIAPER_KIND_LABEL[d.kind!]}${d.note ? `（${d.note}）` : ''}`,
          meta: `${fmtDateTime(d.loggedAt!)} · ${timeAgo(d.loggedAt!)}`, ts: d.loggedAt!,
        });
      }
    }
    if (want('sleep_logs')) {
      const sleeps = await db.select().from(sleepLogs)
        .where(alive(sleepLogs, sleepLogs.startedAt)).orderBy(desc(sleepLogs.startedAt)).limit(200);
      for (const s of sleeps) {
        const dur = s.endedAt ? fmtMinutes(Math.round((s.endedAt - s.startedAt!) / 60000)) : '进行中';
        all.push({
          id: s.localId, collection: 'sleep_logs', emoji: '😴', title: `睡觉 · ${dur}`,
          meta: `${fmtDateTime(s.startedAt!)} · ${timeAgo(s.startedAt!)}`, ts: s.startedAt!,
        });
      }
    }
    if (want('weight_logs')) {
      const weights = await db.select().from(weightLogs)
        .where(alive(weightLogs, weightLogs.loggedAt)).orderBy(desc(weightLogs.loggedAt)).limit(200);
      for (const w of weights) {
        all.push({
          id: w.localId, collection: 'weight_logs', emoji: '⚖️', title: `体重 · ${w.weightKg} kg`,
          meta: `${fmtDateTime(w.loggedAt!)} · ${timeAgo(w.loggedAt!)}`, ts: w.loggedAt!,
        });
      }
    }
    if (want('event_logs')) {
      const events = await db.select().from(eventLogs)
        .where(alive(eventLogs, eventLogs.loggedAt)).orderBy(desc(eventLogs.loggedAt)).limit(200);
      for (const e of events) {
        const m = EVENT_META[e.kind!] || EVENT_META.other;
        all.push({
          id: e.localId, collection: 'event_logs', emoji: m.emoji, title: `${m.text} · ${e.title}`,
          meta: `${fmtDateTime(e.loggedAt!)} · ${timeAgo(e.loggedAt!)}`, ts: e.loggedAt!,
        });
      }
    }
    all.sort((a, b) => b.ts - a.ts);
    setItems(all);
  }, [family, day, filter]);

  const onDelete = useCallback((item: Item) => {
    Alert.alert('删除这条记录？', `${item.title}\n${item.meta}\n\n删除后全家同步，看不到这条记录了。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          try {
            await deleteLocal(item.collection, item.id);
            load();
          } catch (e: any) {
            Alert.alert('删除失败', e.message || '请重试');
          }
        },
      },
    ]);
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isToday = day === startOfDay(Date.now());

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <>
            {/* 日期选择 */}
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable
                  onPress={() => setDay((d) => d - 86400000)}
                  hitSlop={12}
                  style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: T.card2 }}
                >
                  <Text style={{ color: T.text, fontSize: 18 }}>◀</Text>
                </Pressable>
                <Pressable onPress={() => setShowPicker(true)} hitSlop={8} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: T.text, fontSize: 17, fontWeight: '700' }}>📅 {fmtDay(day)}</Text>
                  {!isToday && <Text style={{ color: T.acc, fontSize: 12, marginTop: 2 }}>点我回到今天</Text>}
                </Pressable>
                <Pressable
                  onPress={() => (isToday ? null : setDay((d) => d + 86400000))}
                  hitSlop={12}
                  style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: T.card2, opacity: isToday ? 0.35 : 1 }}
                >
                  <Text style={{ color: T.text, fontSize: 18 }}>▶</Text>
                </Pressable>
              </View>
              {!isToday && (
                <Pressable
                  onPress={() => setDay(startOfDay(Date.now()))}
                  style={{ marginTop: 10, alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 16, backgroundColor: T.card2 }}
                >
                  <Text style={{ color: T.acc, fontSize: 13, fontWeight: '600' }}>回到今天</Text>
                </Pressable>
              )}
            </Card>
            {showPicker && (
              <>
                <DateTimePicker
                  value={new Date(day)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(e, d) => {
                    setShowPicker(Platform.OS === 'ios');
                    if (d) setDay(startOfDay(d.getTime()));
                  }}
                  maximumDate={new Date()}
                />
                {Platform.OS === 'ios' && (
                  <Pressable
                    onPress={() => setShowPicker(false)}
                    style={{ alignSelf: 'center', marginTop: 8, paddingVertical: 8, paddingHorizontal: 24, borderRadius: 16, backgroundColor: T.acc }}
                  >
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>确定</Text>
                  </Pressable>
                )}
              </>
            )}
            {/* 事件筛选 */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 4 }}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={{
                      paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16,
                      backgroundColor: active ? T.acc : T.card2,
                      borderWidth: 1, borderColor: active ? T.acc : T.line,
                    }}
                  >
                    <Text style={{ color: active ? '#fff' : T.text, fontSize: 13, fontWeight: active ? '700' : '400' }}>
                      {f.emoji} {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ marginTop: 8, marginBottom: 4 }}>
              <Label>{fmtDay(day)} · {items.length} 条</Label>
            </View>
          </>
        }
        ListEmptyComponent={
          <Card><Text style={{ color: T.sub, textAlign: 'center' }}>这一天还没有{filter === 'all' ? '' : FILTERS.find((f) => f.key === filter)?.label}记录</Text></Card>
        }
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line, alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: T.card2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: T.text, fontSize: 16, fontWeight: '600' }}>{item.title}</Text>
              <Text style={{ color: T.sub, fontSize: 13, marginTop: 2 }}>{item.meta}</Text>
            </View>
            <Pressable onPress={() => onDelete(item)} hitSlop={12} style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
              <Text style={{ color: T.sub, fontSize: 13 }}>删除</Text>
            </Pressable>
          </View>
        )}
      />
    </Screen>
  );
}
