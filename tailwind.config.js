/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,jsx,ts,tsx}', './src/components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
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
      },
    },
  },
  plugins: [],
};
