import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { desc, eq, and, ne } from 'drizzle-orm';
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

export default function TimelineScreen() {
  const T = useTheme();
  const family = useStore((s) => s.family);
  const [items, setItems] = useState<Item[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!family) return;
    const all: Item[] = [];
    const alive = (t: any) => and(eq(t.familyId, family.id), ne(t.deleted, 1));
    const feeds = await db.select().from(feedLogs)
      .where(alive(feedLogs)).orderBy(desc(feedLogs.startedAt)).limit(100);
    const diapers = await db.select().from(diaperLogs)
      .where(alive(diaperLogs)).orderBy(desc(diaperLogs.loggedAt)).limit(100);
    const sleeps = await db.select().from(sleepLogs)
      .where(alive(sleepLogs)).orderBy(desc(sleepLogs.startedAt)).limit(100);
    const weights = await db.select().from(weightLogs)
      .where(alive(weightLogs)).orderBy(desc(weightLogs.loggedAt)).limit(100);
    const events = await db.select().from(eventLogs)
      .where(alive(eventLogs)).orderBy(desc(eventLogs.loggedAt)).limit(100);

    for (const f of feeds) {
      const detail = f.kind === 'breast'
        ? `${f.side === 'left' ? '左胸' : '右胸'} ${f.durationMin} 分钟`
        : `${f.amountMl} ml`;
      all.push({
        id: f.localId, collection: 'feed_logs', emoji: '🍼', title: `${FEED_KIND_LABEL[f.kind!]} · ${detail}`,
        meta: `${fmtDateTime(f.startedAt!)} · ${timeAgo(f.startedAt!)}`, ts: f.startedAt!,
      });
    }
    for (const d of diapers) {
      all.push({
        id: d.localId, collection: 'diaper_logs', emoji: '💩',
        title: `尿布 · ${DIAPER_KIND_LABEL[d.kind!]}${d.note ? `（${d.note}）` : ''}`,
        meta: `${fmtDateTime(d.loggedAt!)} · ${timeAgo(d.loggedAt!)}`, ts: d.loggedAt!,
      });
    }
    for (const s of sleeps) {
      const dur = s.endedAt ? fmtMinutes(Math.round((s.endedAt - s.startedAt!) / 60000)) : '进行中';
      all.push({
        id: s.localId, collection: 'sleep_logs', emoji: '😴', title: `睡觉 · ${dur}`,
        meta: `${fmtDateTime(s.startedAt!)} · ${timeAgo(s.startedAt!)}`, ts: s.startedAt!,
      });
    }
    for (const w of weights) {
      all.push({
        id: w.localId, collection: 'weight_logs', emoji: '⚖️', title: `体重 · ${w.weightKg} kg`,
        meta: `${fmtDateTime(w.loggedAt!)} · ${timeAgo(w.loggedAt!)}`, ts: w.loggedAt!,
      });
    }
    for (const e of events) {
      const m = EVENT_META[e.kind!] || EVENT_META.other;
      all.push({
        id: e.localId, collection: 'event_logs', emoji: m.emoji, title: `${m.text} · ${e.title}`,
        meta: `${fmtDateTime(e.loggedAt!)} · ${timeAgo(e.loggedAt!)}`, ts: e.loggedAt!,
      });
    }
    // 过滤已删除，按时间倒序
    all.sort((a, b) => b.ts - a.ts);
    setItems(all);
  }, [family]);

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

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <Card><Label>时间线 · {items.length} 条（全家同步）</Label></Card>
        }
        ListEmptyComponent={
          <Card><Text style={{ color: T.sub, textAlign: 'center' }}>还没有记录，去记第一笔吧 🍼</Text></Card>
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
