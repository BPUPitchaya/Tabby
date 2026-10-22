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

import type { AnimalKey } from '@/lib/profile';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export type MascotMood = 'good' | 'warn' | 'over';

// Same thresholds as MoneyFlowRow's own bar color logic (index.tsx) --
// kept here as a single function so the mascot and the progress bar can
// never disagree about what "over budget" means.
export function moodFromPct(pct: number | null): MascotMood {
  if (pct === null) return 'good';
  if (pct >= 100) return 'over';
  if (pct >= 80) return 'warn';
  return 'good';
}

// Brow/mouth curves, eye shape, nose -- entirely species-agnostic, so
// every animal shares the exact same mood-expression system the bear
// originally had. Only the shapes in ANIMAL_VARIANTS below (ears, head/
// muzzle color, optional markings) actually vary per animal.
const MOOD_STYLES: Record<
  MascotMood,
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

type EarShape = 'round' | 'triangle' | 'floppyDown' | 'tallUp';
type Markings = 'panda' | 'raccoon' | 'tiger' | 'foxTip' | null;

type AnimalVariant = {
  label: string;
  earShape: EarShape;
  headColor: string;
  innerColor: string;
  muzzleColor: string;
  cheekColor: string;
  markings: Markings;
};

export const ANIMAL_VARIANTS: Record<AnimalKey, AnimalVariant> = {
  bear: {
    label: 'Bear',
    earShape: 'round',
    headColor: '#8B5A2B',
    innerColor: '#E8C39E',
    muzzleColor: '#E8C39E',
    cheekColor: '#C98A52',
    markings: null,
  },
  cat: {
    label: 'Cat',
    earShape: 'triangle',
    headColor: '#A8A5A0',
    innerColor: '#F3D9C2',
    muzzleColor: '#F5F0E8',
    cheekColor: '#D08765',
    markings: null,
  },
  dog: {
    label: 'Dog',
    earShape: 'floppyDown',
    headColor: '#C98A52',
    innerColor: '#F3D9C2',
    muzzleColor: '#FAF3EC',
    cheekColor: '#D08765',
    markings: null,
  },
  fox: {
    label: 'Fox',
    earShape: 'triangle',
    headColor: '#D08765',
    innerColor: '#FAF3EC',
    muzzleColor: '#FFFFFF',
    cheekColor: '#C06B47',
    markings: 'foxTip',
  },
  rabbit: {
    label: 'Rabbit',
    earShape: 'tallUp',
    headColor: '#E8DCD3',
    innerColor: '#E8A8B8',
    muzzleColor: '#FFFFFF',
    cheekColor: '#E8A8B8',
    markings: null,
  },
  panda: {
    label: 'Panda',
    earShape: 'round',
    headColor: '#FFFFFF',
    innerColor: '#2B1810',
    muzzleColor: '#FFFFFF',
    cheekColor: '#F3D9C2',
    markings: 'panda',
  },
  koala: {
    label: 'Koala',
    earShape: 'round',
    headColor: '#9CA8AE',
    innerColor: '#D9DEE1',
    muzzleColor: '#E8E4DD',
    cheekColor: '#C9CDC9',
    markings: null,
  },
  tiger: {
    label: 'Tiger',
    earShape: 'round',
    headColor: '#D8872E',
    innerColor: '#FFF3E0',
    muzzleColor: '#FFF3E0',
    cheekColor: '#C98A52',
    markings: 'tiger',
  },
  raccoon: {
    label: 'Raccoon',
    earShape: 'round',
    headColor: '#6B6B6B',
    innerColor: '#D9D9D9',
    muzzleColor: '#E8E4DD',
    cheekColor: '#9CA3AF',
    markings: 'raccoon',
  },
  hamster: {
    label: 'Hamster',
    earShape: 'round',
    headColor: '#D8AE72',
    innerColor: '#F3D9C2',
    muzzleColor: '#FAF0DF',
    cheekColor: '#F3D9C2',
    markings: null,
  },
  otter: {
    label: 'Otter',
    earShape: 'round',
    headColor: '#7A5C3E',
    innerColor: '#C9A876',
    muzzleColor: '#E8D9BE',
    cheekColor: '#C9A876',
    markings: null,
  },
};

function Ears({ shape, headColor, innerColor }: { shape: EarShape; headColor: string; innerColor: string }) {
  switch (shape) {
    case 'triangle':
      return (
        <>
          <Path d="M 230 340 L 300 150 L 380 330 Z" fill={headColor} />
          <Path d="M 258 322 L 300 205 L 342 318 Z" fill={innerColor} />
          <Path d="M 644 330 L 724 150 L 794 340 Z" fill={headColor} />
          <Path d="M 682 318 L 724 205 L 766 322 Z" fill={innerColor} />
        </>
      );
    case 'floppyDown':
      return (
        <>
          <Ellipse cx={270} cy={430} rx={72} ry={130} fill={headColor} />
          <Ellipse cx={270} cy={430} rx={40} ry={90} fill={innerColor} />
          <Ellipse cx={754} cy={430} rx={72} ry={130} fill={headColor} />
          <Ellipse cx={754} cy={430} rx={40} ry={90} fill={innerColor} />
        </>
      );
    case 'tallUp':
      return (
        <>
          <Ellipse cx={372} cy={170} rx={55} ry={145} fill={headColor} />
          <Ellipse cx={372} cy={188} rx={28} ry={105} fill={innerColor} />
          <Ellipse cx={652} cy={170} rx={55} ry={145} fill={headColor} />
          <Ellipse cx={652} cy={188} rx={28} ry={105} fill={innerColor} />
        </>
      );
    case 'round':
    default:
      return (
        <>
          <Circle cx={290} cy={300} r={120} fill={headColor} />
          <Circle cx={290} cy={300} r={62} fill={innerColor} />
          <Circle cx={734} cy={300} r={120} fill={headColor} />
          <Circle cx={734} cy={300} r={62} fill={innerColor} />
        </>
      );
  }
}

function MarkingsOverlay({ markings }: { markings: Markings }) {
  switch (markings) {
    case 'panda':
      return (
        <>
          <Ellipse cx={412} cy={545} rx={55} ry={65} fill="#2B1810" />
          <Ellipse cx={612} cy={545} rx={55} ry={65} fill="#2B1810" />
        </>
      );
    case 'raccoon':
      return (
        <Path
          d="M 350 500 Q 512 460 674 500 L 674 560 Q 512 598 350 560 Z"
          fill="#2B1810"
          opacity={0.85}
        />
      );
    case 'tiger':
      return (
        <>
          <Path d="M 420 420 Q 440 460 410 490" stroke="#2B1810" strokeWidth={14} fill="none" strokeLinecap="round" />
          <Path d="M 604 420 Q 584 460 614 490" stroke="#2B1810" strokeWidth={14} fill="none" strokeLinecap="round" />
          <Path d="M 340 560 Q 380 580 350 610" stroke="#2B1810" strokeWidth={12} fill="none" strokeLinecap="round" />
          <Path d="M 684 560 Q 644 580 674 610" stroke="#2B1810" strokeWidth={12} fill="none" strokeLinecap="round" />
        </>
      );
    case 'foxTip':
      return (
        <>
          <Path d="M 230 340 L 270 230 L 310 335 Z" fill="#2B1810" />
          <Path d="M 714 335 L 754 230 L 794 340 Z" fill="#2B1810" />
        </>
      );
    default:
      return null;
  }
}

// The pure face -- no Pressable, no animation. Used both inside
// TabbyMascot (wrapped in its own breathing/tap Pressable) and directly
// by the animal picker grid (wrapped in the GRID's own selection
// Pressable) -- kept separate so a picker cell is never a Pressable
// nested inside another Pressable.
export function MascotFace({
  animal,
  mood,
  size = 96,
  blinkOpacity = 0,
}: {
  animal: AnimalKey;
  mood: MascotMood;
  size?: number;
  blinkOpacity?: number;
}) {
  const variant = ANIMAL_VARIANTS[animal];
  const style = MOOD_STYLES[mood];

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Ears shape={variant.earShape} headColor={variant.headColor} innerColor={variant.innerColor} />
      <Circle cx={512} cy={560} r={330} fill={variant.headColor} />
      <Circle cx={320} cy={660} r={52} fill={variant.cheekColor} opacity={0.55} />
      <Circle cx={704} cy={660} r={52} fill={variant.cheekColor} opacity={0.55} />
      <Ellipse cx={512} cy={650} rx={215} ry={175} fill={variant.muzzleColor} />

      <MarkingsOverlay markings={variant.markings} />

      <Ellipse cx={412} cy={545} rx={30} ry={38} fill="#2B1810" />
      <Ellipse cx={612} cy={545} rx={30} ry={38} fill="#2B1810" />
      <Circle cx={422} cy={532} r={9} fill="#FFFFFF" />
      <Circle cx={622} cy={532} r={9} fill="#FFFFFF" />
      {/* Eyelids: same fill as the muzzle, opacity passed in to "close"
          the eyes for a blink (animated by the caller, static 0 here). */}
      <Ellipse cx={412} cy={545} rx={30} ry={38} fill={variant.muzzleColor} opacity={blinkOpacity} />
      <Ellipse cx={612} cy={545} rx={30} ry={38} fill={variant.muzzleColor} opacity={blinkOpacity} />

      <Path d={style.browL} stroke="#6B4420" strokeWidth={12} fill="none" strokeLinecap="round" />
      <Path d={style.browR} stroke="#6B4420" strokeWidth={12} fill="none" strokeLinecap="round" />
      <Ellipse cx={512} cy={600} rx={58} ry={40} fill="#2B1810" />
      <Path d={style.mouth} stroke="#2B1810" strokeWidth={14} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// Tapping Tabby is the only way to see the AI insight now -- replaces the
// always-visible quote row that used to sit under the hero (see git
// history on index.tsx). Keeps the hero calm by default, rewards a glance
// with the full sentence instead of showing it unconditionally.
export function TabbyMascot({
  animal,
  mood,
  insight,
  size = 96,
  showLabel = true,
}: {
  animal: AnimalKey;
  mood: MascotMood;
  insight: string | null;
  size?: number;
  showLabel?: boolean;
}) {
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
  const variant = ANIMAL_VARIANTS[animal];

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

        {/* Soft color wash behind the mascot, no blur lib -- a flat tint
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

        <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel={`Tabby the ${variant.label.toLowerCase()}, tap for this month's insight`}>
          <Animated.View style={wrapStyle}>
            <Svg width={size} height={size} viewBox="0 0 1024 1024">
              <Ears shape={variant.earShape} headColor={variant.headColor} innerColor={variant.innerColor} />
              <Circle cx={512} cy={560} r={330} fill={variant.headColor} />
              <Circle cx={320} cy={660} r={52} fill={variant.cheekColor} opacity={0.55} />
              <Circle cx={704} cy={660} r={52} fill={variant.cheekColor} opacity={0.55} />
              <Ellipse cx={512} cy={650} rx={215} ry={175} fill={variant.muzzleColor} />

              <MarkingsOverlay markings={variant.markings} />

              <Ellipse cx={412} cy={545} rx={30} ry={38} fill="#2B1810" />
              <Ellipse cx={612} cy={545} rx={30} ry={38} fill="#2B1810" />
              <Circle cx={422} cy={532} r={9} fill="#FFFFFF" />
              <Circle cx={622} cy={532} r={9} fill="#FFFFFF" />
              <AnimatedEllipse cx={412} cy={545} rx={30} ry={38} fill={variant.muzzleColor} animatedProps={blinkProps} />
              <AnimatedEllipse cx={612} cy={545} rx={30} ry={38} fill={variant.muzzleColor} animatedProps={blinkProps} />

              <Path d={style.browL} stroke="#6B4420" strokeWidth={12} fill="none" strokeLinecap="round" />
              <Path d={style.browR} stroke="#6B4420" strokeWidth={12} fill="none" strokeLinecap="round" />
              <Ellipse cx={512} cy={600} rx={58} ry={40} fill="#2B1810" />
              <Path d={style.mouth} stroke="#2B1810" strokeWidth={14} fill="none" strokeLinecap="round" />
            </Svg>
          </Animated.View>
        </Pressable>
      </View>

      {showLabel && (
        <>
          <Text className="font-nunito-bold text-tabby-700 dark:text-tabby-100 text-xs mt-1">{style.label}</Text>
          {insight && (
            <Text className="font-nunito text-tabby-500 dark:text-tabby-300 text-[10px] mt-0.5">
              Tap Tabby for the full story
            </Text>
          )}
        </>
      )}
    </View>
  );
}
