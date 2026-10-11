/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,jsx,ts,tsx}', './src/components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'class' (rather than the default 'media') lets the Settings screen
  // override the OS appearance via nativewind's colorScheme.set() --
  // 'media' would only ever follow the system setting and throws if you
  // try to set it manually.
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Static weight files loaded via expo-font (see src/app/_layout.tsx)
        // -- each weight is its own named font, not synthesized, so pick the
        // exact class for the weight you want rather than pairing with
        // font-bold/font-semibold.
        fredoka: ['Fredoka_400Regular'],
        'fredoka-medium': ['Fredoka_500Medium'],
        'fredoka-semibold': ['Fredoka_600SemiBold'],
        'fredoka-bold': ['Fredoka_700Bold'],
        nunito: ['Nunito_400Regular'],
        'nunito-medium': ['Nunito_500Medium'],
        'nunito-semibold': ['Nunito_600SemiBold'],
        'nunito-bold': ['Nunito_700Bold'],
        'nunito-extrabold': ['Nunito_800ExtraBold'],
      },
      colors: {
        // Tabby's brand palette -- lifted straight from the bear icon
        // (assets/brand/icon-full.svg), filled out into a full Tailwind-style
        // shade scale so it's a drop-in replacement for the generic blue/gray
        // that was used everywhere before. 200/400/600/800/900 are the bear's
        // actual hex values; the rest are derived tints/shades to fill gaps.
        tabby: {
          50: '#FAF3EC',
          100: '#F3E2CD',
          200: '#E8C39E', // cream -- bear's muzzle/ear fill
          300: '#DCA873',
          400: '#C98A52', // caramel -- bear's inner ear/nose highlight
          500: '#A86F3D',
          600: '#8B5A2B', // brown -- bear's head, primary accent
          700: '#6B4420',
          800: '#4A2F1F', // dark brown -- bear's eyebrows
          900: '#2B1810', // darkest brown -- bear's outline
        },
        // The soft sky blue used behind the bear on the splash screen,
        // app icon background, and avatar badges.
        'tabby-sky': '#BEE3F8',
        // Semantic money colors, re-tinted off stock Tailwind green/red so
        // "earned" and "over budget" still sit in the same warm family as
        // the brand palette instead of reading as a cold, generic alert.
        sage: {
          50: '#EDF3E7',
          100: '#DBE7CE',
          200: '#BBD6A4',
          300: '#99C178',
          400: '#86BD63',
          500: '#5F8F42',
          600: '#4C7535',
          700: '#3D5E2B',
          800: '#304A22',
          900: '#253A1B',
        },
        rust: {
          50: '#F7E8E1',
          100: '#EFD0C1',
          200: '#E1AC93',
          300: '#D08765',
          400: '#C06B47',
          500: '#A8503A',
          600: '#8E3F2C',
          700: '#723323',
          800: '#592A1E',
          900: '#3E1F17',
        },
      },
    },
  },
  plugins: [],
};
