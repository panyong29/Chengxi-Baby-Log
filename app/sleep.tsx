import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, GhostBtn, Hint, PrimaryBtn, styles, useTheme, ScreenScroll } from '../components/ui';
import { startTimer } from '../core/logging';

export default function SleepScreen() {
  const T = useTheme();
  const router = useRouter();
  return (
    <ScreenScroll>
      <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
        <Text style={{ fontSize: 56 }}>😴</Text>
        <View style={styles.gap} />
        <Hint>宝宝睡着了就点下面，醒了点结束，{'\n'}时长自动计算。</Hint>
        <View style={styles.gap} />
        <View style={{ width: '100%' }}>
          <PrimaryBtn text="开始睡觉" onPress={() => {
            const ok = startTimer('sleep', '睡觉计时中');
            if (ok) router.back();
            else Alert.alert('有计时在进行中', '先去首页结束当前计时，再开始新的睡觉计时。');
          }} />
        </View>
      </Card>
      <GhostBtn text="← 返回" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
