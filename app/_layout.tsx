import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useStore } from '../store/useStore';
import { pb, restoreAuth, logout } from '../api/pocketbase';
import { drainQueue, subscribeRealtime } from '../sync/engine';
import { network } from '../core/adapters';
import { Dark } from '../components/ui';

// 全局错误捕获：任何未被 try/catch 抓住的 JS 错误（如微任务里的 EventSource 报错）
// 都会到这里，显示在屏幕上而不是直接闪退，方便定位。
let globalError: string | null = null;
const globalErrorListeners = new Set<(e: string | null) => void>();
function setGlobalError(e: string | null) {
  globalError = e;
  globalErrorListeners.forEach((fn) => fn(e));
}
if (typeof ErrorUtils !== 'undefined' && !(global as any).__blErrorHandlerSet) {
  (global as any).__blErrorHandlerSet = true;
  const prev = (ErrorUtils as any).getGlobalHandler?.();
  (ErrorUtils as any).setGlobalHandler((error: any, isFatal?: boolean) => {
    const msg = error?.message || String(error);
    const stack = error?.stack || '';
    setGlobalError(`FATAL: ${msg}\n${stack.slice(0, 500)}`);
    // 还是调用系统默认处理（开发环境会弹红屏），但我们已经把错误显示出来了
    if (prev) { try { prev(error, isFatal); } catch { /* ignore */ } }
  });
}

export default function RootLayout() {
  const { ready, authed, setReady, setAuth, setInitError, restoreTimer, restoreTheme, family, theme } = useStore();
  const router = useRouter();
  const segments = useSegments();
  const [fatalError, setFatalError] = useState<string | null>(globalError);

  useEffect(() => {
    globalErrorListeners.add(setFatalError);
    return () => { globalErrorListeners.delete(setFatalError); };
  }, []);

  // G1：回到前台时也排空同步队列（之前只在网络变化/启动时触发）
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') drainQueue();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      try {
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
      } catch (e) {
        // 启动初始化绝不能闪退：出错就清掉本地登录态，回退到登录页，并记录错误码
        const msg = e instanceof Error ? e.message : String(e);
        // 错误码：INIT- + 错误信息哈希前6位，方便用户报给开发者定位
        let h = 0;
        for (let i = 0; i < msg.length; i++) h = ((h << 5) - h + msg.charCodeAt(i)) | 0;
        const code = `INIT-${Math.abs(h).toString(16).toUpperCase().padStart(6, '0').slice(0, 6)}`;
        console.warn('[init] 启动初始化失败', code, msg);
        setInitError(`${code}: ${msg.slice(0, 120)}`);
        try { await logout(); } catch { /* ignore */ }
      } finally {
        setReady();
      }
    })();
  }, []);

  // S9：进入已登录态就启动同步。之前 network.onChange / drainQueue / subscribeRealtime
  // 只在冷启动有登录态时注册一次，新注册/登录后本次启动内 realtime 永远不工作；
  // 退出登录时取消订阅，避免旧订阅泄漏。冷启动、注册、登录、重新登录都会走到这里。
  const familyId = family?.id;
  useEffect(() => {
    if (!ready || !authed || !familyId) return;
    const cleanups: Array<() => void> = [];
    try {
      cleanups.push(network.onChange(() => drainQueue()));
      drainQueue();
      cleanups.push(subscribeRealtime(pb, familyId));
    } catch (e) {
      console.warn('[sync] 启动同步失败', e);
    }
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

  // 致命错误展示：App 没直接闪退，而是把错误堆栈显示出来，点按复制发给开发者
  if (fatalError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: '#2a1a1a', padding: 20, justifyContent: 'center' }}>
          <Text style={{ color: '#ff6b6b', fontSize: 18, fontWeight: '800', marginBottom: 12 }}>
            ⚠️ App 出错了（点下方复制发给开发者）
          </Text>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(fatalError);
              setGlobalError('已复制！把内容发给开发者即可。\n\n' + fatalError);
            }}
            style={{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, maxHeight: 400 }}
          >
            <Text style={{ color: '#ffb3b3', fontSize: 12, fontFamily: 'monospace' }}>{fatalError}</Text>
          </Pressable>
          <Pressable
            onPress={() => setGlobalError(null)}
            style={{ marginTop: 16, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#444' }}
          >
            <Text style={{ color: '#fff', fontSize: 14 }}>继续使用（可能不稳定）</Text>
          </Pressable>
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
