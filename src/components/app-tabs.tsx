import { Feather } from '@expo/vector-icons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

// Same brown as the `tabby` Tailwind scale (tailwind.config.js) -- these are
// native tab-bar props, not NativeWind classNames, so the exact hex values
// are duplicated here rather than referenced from the Tailwind config.
const TABBY_BROWN = '#8B5A2B'; // tabby-600, light-mode accent
const TABBY_DARK_BG = '#2B1810'; // tabby-900, dark-mode background
const TABBY_MUTED = '#C98A52'; // tabby-400, dark-mode unselected icon/label

export default function AppTabs({ hideFlatTab = false }: { hideFlatTab?: boolean }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <NativeTabs
      backgroundColor={isDark ? TABBY_DARK_BG : '#ffffff'}
      iconColor={{
        default: isDark ? TABBY_MUTED : '#9ca3af',
        selected: isDark ? '#ffffff' : TABBY_BROWN,
      }}
      labelStyle={{
        default: { color: isDark ? TABBY_MUTED : '#9ca3af' },
        selected: { color: isDark ? '#ffffff' : TABBY_BROWN },
      }}
      indicatorColor={isDark ? '#4A2F1F' : '#F3E2CD'}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Feather} name="home" />} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="transactions">
        <NativeTabs.Trigger.Label>Transactions</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="credit-card" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="flat" hidden={hideFlatTab}>
        <NativeTabs.Trigger.Label>Flat</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Feather} name="users" />} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Feather} name="user" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
