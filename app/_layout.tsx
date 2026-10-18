import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useStore } from '../store/useStore';
import { pb, restoreAuth } from '../api/pocketbase';
import { drainQueue, subscribeRealtime } from '../sync/engine';
import { network } from '../core/adapters';
import { Dark } from '../components/ui';

export default function RootLayout() {
  const { ready, authed, setReady, setAuth, restoreTimer, restoreTheme, family, theme } = useStore();
  const router = useRouter();
  const segments = useSegments();

  // G1：回到前台时也排空同步队列（之前只在网络变化/启动时触发）
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') drainQueue();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      await restoreTheme(); // G4：恢复用户选的主题
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
        }
      }
      await restoreTimer(); // 恢复被杀掉的计时器
      setReady();
    })();
  }, []);

  // S9：进入已登录态就启动同步。之前 network.onChange / drainQueue / subscribeRealtime
  // 只在冷启动有登录态时注册一次，新注册/登录后本次启动内 realtime 永远不工作；
  // 退出登录时取消订阅，避免旧订阅泄漏。冷启动、注册、登录、重新登录都会走到这里。
  const familyId = family?.id;
  useEffect(() => {
    if (!ready || !authed || !familyId) return;
    const cleanups: Array<() => void> = [];
    cleanups.push(network.onChange(() => drainQueue()));
    drainQueue();
    cleanups.push(subscribeRealtime(pb, familyId));
    return () => {
      cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    };
  }, [ready, authed, familyId]);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === 'auth';
    if (!authed && !inAuth) router.replace('/auth');
    else if (authed && inAuth) router.replace('/(tabs)');
  }, [ready, authed, segments]);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: Dark.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Dark.acc} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Dark.bg } }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="feed" options={{ presentation: 'modal' }} />
        <Stack.Screen name="diaper" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sleep" options={{ presentation: 'modal' }} />
        <Stack.Screen name="backfill" options={{ presentation: 'modal' }} />
        <Stack.Screen name="weight" options={{ presentation: 'modal' }} />
        <Stack.Screen name="event" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
