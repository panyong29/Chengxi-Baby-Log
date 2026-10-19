import { useState } from 'react';
import { Alert,  TextInput,  View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActBtn, Card, GhostBtn, Hint, Label, PrimaryBtn, styles, useTheme, ScreenScroll } from '../components/ui';
import { logBottle, startTimer } from '../core/logging';

export default function FeedScreen() {
  const T = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<'b' | 'm'>('b');
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [ml, setMl] = useState('');

  return (
    <ScreenScroll>
      <Card>
        <View style={styles.row}>
          <GhostBtn text="🤱 亲喂" onPress={() => setTab('b')} />
          <GhostBtn text="🍼 瓶喂" onPress={() => setTab('m')} />
        </View>
      </Card>

      {tab === 'b' ? (
        <>
          <View style={styles.grid2}>
            <ActBtn emoji="🤱" text="左胸" selected={side === 'left'} onPress={() => setSide('left')} />
            <ActBtn emoji="🤱" text="右胸" selected={side === 'right'} onPress={() => setSide('right')} />
          </View>
          <View style={styles.gap} />
          <PrimaryBtn text="开始计时" onPress={() => {
            const ok = startTimer('feed', `亲喂${side === 'left' ? '左胸' : '右胸'}计时中`, { side });
            if (ok) router.back();
            else Alert.alert('有计时在进行中', '先去首页结束当前计时，再开始新的亲喂计时。');
          }} />
          <View style={styles.gap} />
          <Hint>💡 上次是哪边、下次换边，时间线里能看到。</Hint>
        </>
      ) : (
        <Card>
          <Label>毫升数（ml）</Label>
          <View style={styles.grid2}>
            {[60, 90, 120, 150].map((v) => (
              <ActBtn key={v} emoji="" text={String(v)} selected={ml === String(v)} onPress={() => setMl(String(v))} />
            ))}
          </View>
          <View style={styles.gap} />
          <TextInput
            value={ml} onChangeText={setMl} keyboardType="number-pad" placeholder="或手动输入 ml"
            placeholderTextColor={T.sub}
            style={{ backgroundColor: T.card2, borderColor: T.line, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 17, color: T.text }}
          />
          <View style={styles.gap} />
          <PrimaryBtn text="保存这次瓶喂" onPress={async () => {
            const v = parseInt(ml, 10);
            if (!v || v <= 0) return Alert.alert('提示', '先填毫升数');
            if (v > 500) return Alert.alert('提示', '毫升数不太对吧？最大 500ml');
            await logBottle(v);
            router.back();
          }} />
        </Card>
      )}
      <View style={styles.gap} />
      <GhostBtn text="← 返回" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
