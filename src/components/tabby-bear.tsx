import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export type BearMood = 'good' | 'warn' | 'over';

// Same thresholds as MoneyFlowRow's own bar color logic (index.tsx) --
// kept here as a single function so the bear and the progress bar can never
// disagree about what "over budget" means.
export function moodFromPct(pct: number | null): BearMood {
  if (pct === null) return 'good';
  if (pct >= 100) return 'over';
  if (pct >= 80) return 'warn';
  return 'good';
}

const MOOD_STYLES: Record<
  BearMood,
  { glow: string; browL: string; browR: string; mouth: string; label: string }
> = {
  good: {
    glow: '#BEE3F8',
    browL: 'M 375 480 Q 412 460 448 478',
    browR: 'M 576 478 Q 612 460 649 480',
    mouth: 'M 440 672 Q 512 730 584 672',
    label: 'Doing great this month',
  },
  warn: {
    glow: '#C98A52',
    browL: 'M 375 478 Q 412 465 448 480',
    browR: 'M 576 480 Q 612 465 649 478',
    mouth: 'M 445 690 Q 512 705 579 690',
    label: 'Getting close to your limit',
  },
  over: {
    glow: '#A8503C',
    browL: 'M 378 495 Q 412 478 445 492',
    browR: 'M 579 492 Q 612 478 646 495',
    mouth: 'M 448 705 Q 512 680 576 705',
    label: 'A bit stretched this month',
  },
};

// Tapping Tabby is the only way to see the AI insight now -- replaces the
// always-visible quote row that used to sit under the hero (see git
// history on index.tsx). Keeps the hero calm by default, rewards a glance
// with the full sentence instead of showing it unconditionally.
export function TabbyBear({ mood, insight, size = 96 }: { mood: BearMood; insight: string | null; size?: number }) {
  const style = MOOD_STYLES[mood];
  const [showBubble, setShowBubble] = useState(false);

  const breathe = useSharedValue(1);
  const tapScale = useSharedValue(1);
  const blink = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.035, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
    blink.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 4500 }),
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 90 })
      ),
      -1
    );
  }, [breathe, blink]);

  useEffect(() => {
    if (!showBubble) return;
    const timer = setTimeout(() => setShowBubble(false), 4200);
    return () => clearTimeout(timer);
  }, [showBubble]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value * tapScale.value }],
  }));
  const blinkProps = useAnimatedProps(() => ({ opacity: blink.value }));

  const handlePress = () => {
    tapScale.value = withSequence(
      withTiming(0.88, { duration: 120 }),
      withTiming(1.1, { duration: 160 }),
      withTiming(1, { duration: 150 })
    );
    if (insight) setShowBubble((v) => !v);
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        {showBubble && insight && (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(180)}
            style={{
              position: 'absolute',
              bottom: size + 10,
              left: -70,
              width: 220,
              backgroundColor: 'white',
              borderRadius: 16,
              padding: 12,
              borderWidth: 1,
              borderColor: '#E8C39E',
              zIndex: 10,
            }}>
            <Text className="font-nunito-semibold text-xs text-tabby-700 dark:text-tabby-900">{insight}</Text>
          </Animated.View>
        )}

        {/* Soft color wash behind the bear, no blur lib -- a flat tint
            reads as "glow" well enough at this size. */}
        <View
          style={{
            position: 'absolute',
            top: -12,
            left: -12,
            right: -12,
            bottom: -12,
            borderRadius: 999,
            backgroundColor: style.glow,
            opacity: 0.45,
          }}
        />

        <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Tabby, tap for this month's insight">
          <Animated.View style={wrapStyle}>
            <Svg width={size} height={size} viewBox="0 0 1024 1024">
              <Circle cx={290} cy={300} r={120} fill="#8B5A2B" />
              <Circle cx={290} cy={300} r={62} fill="#E8C39E" />
              <Circle cx={734} cy={300} r={120} fill="#8B5A2B" />
              <Circle cx={734} cy={300} r={62} fill="#E8C39E" />
              <Circle cx={512} cy={560} r={330} fill="#8B5A2B" />
              <Circle cx={320} cy={660} r={52} fill="#C98A52" opacity={0.55} />
              <Circle cx={704} cy={660} r={52} fill="#C98A52" opacity={0.55} />
              <Ellipse cx={512} cy={650} rx={215} ry={175} fill="#E8C39E" />

              <Ellipse cx={412} cy={545} rx={30} ry={38} fill="#2B1810" />
              <Ellipse cx={612} cy={545} rx={30} ry={38} fill="#2B1810" />
              <Circle cx={422} cy={532} r={9} fill="#FFFFFF" />
              <Circle cx={622} cy={532} r={9} fill="#FFFFFF" />
              {/* Eyelids: same fill as the muzzle, drawn on top -- opacity
                  flicks to 1 briefly to "close" the eyes for a blink. */}
              <AnimatedEllipse cx={412} cy={545} rx={30} ry={38} fill="#E8C39E" animatedProps={blinkProps} />
              <AnimatedEllipse cx={612} cy={545} rx={30} ry={38} fill="#E8C39E" animatedProps={blinkProps} />

              <Path d={style.browL} stroke="#6B4420" strokeWidth={12} fill="none" strokeLinecap="round" />
              <Path d={style.browR} stroke="#6B4420" strokeWidth={12} fill="none" strokeLinecap="round" />
              <Ellipse cx={512} cy={600} rx={58} ry={40} fill="#2B1810" />
              <Path d={style.mouth} stroke="#2B1810" strokeWidth={14} fill="none" strokeLinecap="round" />
            </Svg>
          </Animated.View>
        </Pressable>
      </View>

      <Text className="font-nunito-bold text-tabby-700 dark:text-tabby-100 text-xs mt-1">{style.label}</Text>
      {insight && (
        <Text className="font-nunito text-tabby-500 dark:text-tabby-300 text-[10px] mt-0.5">
          Tap Tabby for the full story
        </Text>
      )}
    </View>
  );
}
