// A deep link that arrives while the app is already running (a "warm
// start") gets consumed by expo-router's own Linking subscription to
// decide which screen to navigate to, before the destination screen
// even mounts. A Linking.addEventListener registered inside that screen
// (in a useEffect) is always too late to see the event that brought it
// there. The fix: register one listener here, at module load time in
// the root layout, which runs before any screen mounts or expo-router's
// own navigation subscribes, so it never misses the event. The
// destination screen then just reads it back on mount, alongside
// Linking.getInitialURL() for the cold-start case.
let latestUrl: string | null = null;

export function setLatestDeepLink(url: string) {
  latestUrl = url;
}

export function getLatestDeepLink(): string | null {
  return latestUrl;
}
