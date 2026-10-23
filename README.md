# Tabby

Tabby is a mobile personal finance tracker that also handles flatmate bill-splitting. AI auto-categorizes transactions, parses natural-language expense entries, answers plain-English questions about your spending, and summarizes trends — so budgeting your own money and splitting shared costs with flatmates both live in one simple app.

## Features

- **Transactions** — manual entry or AI-assisted natural-language add ("coffee $6 at Starbucks"), auto-categorization, receipt scanning, CSV export.
- **Budgeting** — overall and per-category budgets, AI-suggested budgets, a live spending pie chart, plain-English Q&A over your own spending ("how much did I spend on dining out?").
- **Bills** — recurring fixed or variable bills, due-date reminders, payment confirmation.
- **Savings Goals** — set a target amount and optional date, log manual contributions, track progress toward it, with a preview on the Home screen.
- **Flat (flatmate) features** — shared expense splitting with balances, AI-parsed split entry, recurring chores (fixed or rotating assignment) with reminders, friend requests, and a flat health score.
- **Profile & account** — multiple avatar animals, income sources with pay-cycle budgeting, data export, account deletion.

## Tech stack

- [Expo](https://expo.dev) (React Native + TypeScript), SDK 57
- [NativeWind](https://www.nativewind.dev) (Tailwind CSS for React Native)
- [Supabase](https://supabase.com) (Postgres database, auth, Edge Functions, Row Level Security)
- Expo Router (file-based navigation, routes live in `src/app/`)
- [Sentry](https://sentry.io) (crash reporting)
- Gemini (via a Supabase Edge Function proxy) for AI features

## Getting started

This project pins Node 22 LTS via `.nvmrc`. If you use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use
```

Install dependencies:

```bash
npm install
```

Create a `.env.local` file in the project root with:

```
EXPO_PUBLIC_SUPABASE_URL=your-supabase-project-url
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
EXPO_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

(`EXPO_PUBLIC_SENTRY_DSN` is optional — the app still runs without crash reporting if it's missing.)

Then start the dev server:

```bash
npx expo start
```

From the Expo CLI output you can open the app in:

- an iOS Simulator (Mac only, via Xcode)
- an Android Emulator (via Android Studio, works on Mac/Windows/Linux)
- [Expo Go](https://expo.dev/go) on a physical device (scan the QR code)

Some native modules (e.g. `expo-sharing`, notifications) aren't available in Expo Go — use `npm run ios` / `npm run android` for a full dev build if a feature doesn't seem to work in Expo Go.

### Backend (Supabase)

The database schema lives in `supabase/migrations/` and the two Edge Functions (`ai-proxy`, `delete-account`) live in `supabase/functions/`. If you're pointing at your own Supabase project rather than an existing one, apply the migrations and deploy the functions via the [Supabase CLI](https://supabase.com/docs/guides/cli) or the Supabase MCP server.

## Project structure

- `src/app/` — screens and routes (Expo Router file-based routing)
- `src/components/` — reusable UI components, mostly full-screen modals per feature
- `src/lib/` — data access and business logic (one file per feature, paired with a `.test.ts` for the pure logic)
- `src/constants/`, `src/hooks/` — shared theme/logic
- `src/global.css` — Tailwind directives + base styles (via NativeWind)
- `supabase/` — migrations and Edge Functions

## Scripts

- `npm run ios` / `npm run android` / `npm run web` — start on a specific platform
- `npm run lint` — run ESLint
- `npm test` — run the Jest test suite
- `npx tsc --noEmit` — typecheck
