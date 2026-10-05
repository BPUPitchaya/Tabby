# Tabby

Tabby is a mobile personal finance tracker that also handles flatmate bill-splitting. AI auto-categorizes transactions, parses natural-language expense entries, and summarizes spending trends — so budgeting your own money and splitting shared costs with flatmates both live in one simple app.

## Tech stack

- [Expo](https://expo.dev) (React Native + TypeScript)
- [NativeWind](https://www.nativewind.dev) (Tailwind CSS for React Native)
- [Supabase](https://supabase.com) (Postgres database, auth)
- Expo Router (file-based navigation, routes live in `src/app/`)

## Getting started

This project pins Node 22 LTS via `.nvmrc`. If you use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use
```

Then install dependencies and start the dev server:

```bash
npm install
npx expo start
```

From the Expo CLI output you can open the app in:

- an iOS Simulator (Mac only, via Xcode)
- an Android Emulator (via Android Studio, works on Mac/Windows/Linux)
- [Expo Go](https://expo.dev/go) on a physical device (scan the QR code)

## Project structure

- `src/app/` — screens and routes (Expo Router file-based routing)
- `src/components/` — reusable UI components
- `src/constants/`, `src/hooks/` — shared theme/logic
- `src/global.css` — Tailwind directives + base styles (via NativeWind)

## Scripts

- `npm run android` / `npm run ios` / `npm run web` — start on a specific platform
- `npm run lint` — run ESLint
- `npx tsc --noEmit` — typecheck
