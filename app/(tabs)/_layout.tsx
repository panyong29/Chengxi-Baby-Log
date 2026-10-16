import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTheme } from '../../components/ui';

export default function TabsLayout() {
  const T = useTheme();
  const icon = (e: string) => ({ color }: { color: string }) =>
    <Text style={{ fontSize: 24, color }}>{e}</Text>;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: T.card, borderTopColor: T.line },
        tabBarActiveTintColor: T.acc,
        tabBarInactiveTintColor: T.sub,
      }}
    >
      <Tabs.Screen name="index" options={{ title: '记录', tabBarIcon: icon('🍼') }} />
      <Tabs.Screen name="timeline" options={{ title: '时间线', tabBarIcon: icon('🕘') }} />
      <Tabs.Screen name="me" options={{ title: '我的', tabBarIcon: icon('👪') }} />
    </Tabs>
  );
}
