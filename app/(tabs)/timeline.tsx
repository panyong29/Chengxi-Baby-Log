import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { desc, eq, and, ne } from 'drizzle-orm';
import { db } from '../../db/client';
import { diaperLogs, feedLogs, sleepLogs } from '../../db/schema';
import { useStore } from '../../store/useStore';
import { Card, Label, useTheme } from '../../components/ui';
import { fmtDateTime, fmtMinutes, timeAgo, FEED_KIND_LABEL, DIAPER_KIND_LABEL } from '../../core/time';

interface Item {
  id: string; emoji: string; title: string; meta: string; ts: number;
}

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

    for (const f of feeds) {
      const detail = f.kind === 'breast'
        ? `${f.side === 'left' ? '左胸' : '右胸'} ${f.durationMin} 分钟`
        : `${f.amountMl} ml`;
      all.push({
        id: f.localId, emoji: '🍼', title: `${FEED_KIND_LABEL[f.kind!]} · ${detail}`,
        meta: `${fmtDateTime(f.startedAt!)} · ${timeAgo(f.startedAt!)}`, ts: f.startedAt!,
      });
    }
    for (const d of diapers) {
      all.push({
        id: d.localId, emoji: '💩',
        title: `尿布 · ${DIAPER_KIND_LABEL[d.kind!]}${d.note ? `（${d.note}）` : ''}`,
        meta: `${fmtDateTime(d.loggedAt!)} · ${timeAgo(d.loggedAt!)}`, ts: d.loggedAt!,
      });
    }
    for (const s of sleeps) {
      const dur = s.endedAt ? fmtMinutes(Math.round((s.endedAt - s.startedAt!) / 60000)) : '进行中';
      all.push({
        id: s.localId, emoji: '😴', title: `睡觉 · ${dur}`,
        meta: `${fmtDateTime(s.startedAt!)} · ${timeAgo(s.startedAt!)}`, ts: s.startedAt!,
      });
    }
    // 过滤已删除，按时间倒序
    all.sort((a, b) => b.ts - a.ts);
    setItems(all);
  }, [family]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: 60 }}>
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
          <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: T.card2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: T.text, fontSize: 16, fontWeight: '600' }}>{item.title}</Text>
              <Text style={{ color: T.sub, fontSize: 13, marginTop: 2 }}>{item.meta}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
