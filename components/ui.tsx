import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';

export const Dark = {
  bg: '#101014', card: '#1b1b22', card2: '#23232e', text: '#f2f2f5',
  sub: '#a7a7b3', line: '#2e2e3a', acc: '#ffb020', accTx: '#1a1200',
};
export const Light = {
  bg: '#f4f4f6', card: '#ffffff', card2: '#efeff3', text: '#14141a',
  sub: '#6b6b76', line: '#e2e2e8', acc: '#f59e0b', accTx: '#ffffff',
};
export const useTheme = () => (useStore((s) => s.theme) === 'dark' ? Dark : Light);

/** 全屏手机安全区容器：顶部避开刘海/状态栏，底部避开手势条 */
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{
      flex: 1, backgroundColor: T.bg,
      paddingTop: Math.max(insets.top, 12),
      paddingBottom: Math.max(insets.bottom, 12),
    }, style]}>
      {children}
    </View>
  );
}

/** 可滚动页面容器：同上，内容区统一内边距；键盘弹起时点按钮也照常响应 */
export function ScreenScroll({ children, pad = 16 }: { children: React.ReactNode; pad?: number }) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: pad,
        paddingTop: Math.max(insets.top, 12),
        paddingBottom: Math.max(insets.bottom, 24),
      }}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const T = useTheme();
  return <View style={[{ backgroundColor: T.card, borderColor: T.line, borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 }, style]}>{children}</View>;
}

export function Label({ children }: { children: React.ReactNode }) {
  const T = useTheme();
  return <Text style={{ color: T.sub, fontSize: 13, marginBottom: 6 }}>{children}</Text>;
}

export function ActBtn({ emoji, text, onPress, selected, style }: {
  emoji: string; text: string; onPress: () => void; selected?: boolean; style?: ViewStyle;
}) {
  const T = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{
        backgroundColor: pressed ? T.card2 : T.card,
        borderColor: selected ? T.acc : T.line, borderWidth: selected ? 2 : 1,
        borderRadius: 18, minHeight: 76, flex: 1,
        alignItems: 'center', justifyContent: 'center', gap: 4,
      }, style]}
    >
      <Text style={{ fontSize: 30 }}>{emoji}</Text>
      <Text style={{ color: T.text, fontSize: 17, fontWeight: '600' }}>{text}</Text>
    </Pressable>
  );
}

export function PrimaryBtn({ text, onPress }: { text: string; onPress: () => void }) {
  const T = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{
        backgroundColor: T.acc, borderRadius: 18, minHeight: 60,
        alignItems: 'center', justifyContent: 'center',
        opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
      }]}
    >
      <Text style={{ color: T.accTx, fontSize: 18, fontWeight: '700' }}>{text}</Text>
    </Pressable>
  );
}

export function GhostBtn({ text, onPress }: { text: string; onPress: () => void }) {
  const T = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: T.card2, borderColor: T.line, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center' }}
    >
      <Text style={{ color: T.text, fontSize: 16 }}>{text}</Text>
    </Pressable>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  const T = useTheme();
  return <Text style={{ color: T.sub, fontSize: 13, lineHeight: 20 }}>{children}</Text>;
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  grid2: { flexDirection: 'row', gap: 10 },
  gap: { height: 10 },
  big: { fontSize: 26, fontWeight: '700' } as TextStyle,
});
