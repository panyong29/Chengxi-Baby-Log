import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, GhostBtn, Hint, PrimaryBtn, styles, useTheme } from '../components/ui';
import { startTimer } from '../core/logging';

export default function SleepScreen() {
  const T = useTheme();
  const router = useRouter();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: 16, paddingTop: 60 }}>
      <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
        <Text style={{ fontSize: 56 }}>😴</Text>
        <View style={styles.gap} />
        <Hint>宝宝睡着了就点下面，醒了点结束，{'\n'}时长自动计算。</Hint>
        <View style={styles.gap} />
        <View style={{ width: '100%' }}>
          <PrimaryBtn text="开始睡觉" onPress={() => {
            startTimer('sleep', '睡觉计时中');
            router.back();
          }} />
        </View>
      </Card>
      <GhostBtn text="← 返回" onPress={() => router.back()} />
    </ScrollView>
  );
}
