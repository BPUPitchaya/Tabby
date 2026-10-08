// On web there's no native splash screen to transition away from, so this
// is intentionally a no-op -- kept as a separate .web.tsx file because
// Metro picks it automatically on web, keeping the native implementation
// (animated-icon.tsx) web-safe without any platform branching inside it.
export function AnimatedSplashOverlay() {
  return null;
}
