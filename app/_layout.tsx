import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useStore } from '../store/useStore';
import { pb, restoreAuth } from '../api/pocketbase';
import { drainQueue, subscribeRealtime } from '../sync/engine';
import { network } from '../core/adapters';
import { Dark } from '../components/ui';

export default function RootLayout() {
  const { ready, authed, setReady, setAuth, restoreTimer, family } = useStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      const ok = await restoreAuth();
      if (ok && pb.authStore.record) {
        const u: any = pb.authStore.record;
        const fam: any = u.family
          ? await pb.collection('family').getOne(u.family).catch(() => null)
          : null;
        if (fam) {
          setAuth({
            userId: u.id, nickname: u.nickname || '我',
            family: {
              id: fam.id, babyNickname: fam.baby_nickname,
              babyBirthdate: fam.baby_birthdate, inviteCode: fam.invite_code,
            },
          });
          // 启动同步：网络恢复 / 回到前台时排空队列 + Realtime 订阅
          network.onChange(() => drainQueue());
          drainQueue();
          subscribeRealtime(pb, fam.id);
        }
      }
      await restoreTimer(); // 恢复被杀掉的计时器
      setReady();
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === 'auth';
    if (!authed && !inAuth) router.replace('/auth');
    else if (authed && inAuth) router.replace('/(tabs)');
  }, [ready, authed, segments]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: Dark.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Dark.acc} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Dark.bg } }}>
      <Stack.Screen name="auth" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="feed" options={{ presentation: 'modal' }} />
      <Stack.Screen name="diaper" options={{ presentation: 'modal' }} />
      <Stack.Screen name="sleep" options={{ presentation: 'modal' }} />
      <Stack.Screen name="backfill" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
