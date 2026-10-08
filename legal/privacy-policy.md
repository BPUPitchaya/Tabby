# Tabby Privacy Policy

**Last updated: October 2026**

This policy explains what information Tabby ("the app", "we", "us") collects, how it's used, and your rights over it. Tabby is a personal finance and flatmate expense-splitting app.

## 1. What we collect

**Account information:** your email address and password (stored securely by our authentication provider, Supabase — we never see or store your plaintext password), and a display name you choose.

**Financial data you enter:** transaction amounts, descriptions, dates, and categories you log for your own budgeting. This data is yours and is only ever visible to you.

**Flat/shared expense data:** if you create or join a flat, we store the flat's name, an invite code, who its members are, shared expenses you or your flatmates log (amount, description, date, who paid, who it's split between), and settlement records (who paid whom back). This data is only visible to members of that specific flat — never to anyone outside it, and never to us for any purpose beyond operating the app.

**We do not collect:** your location, contacts, photos, or any data beyond what you directly enter into the app. We do not use advertising trackers or sell data to third parties.

## 2. How AI features work

Some features (automatic categorization, natural-language expense entry, monthly spending summaries) send the relevant text — a transaction description, or a summary of your category totals — to Google's Gemini API to generate a result. This happens through our own server-side proxy, not directly from your device, and only includes the minimum data needed for that specific feature (e.g. "coffee $8.50", not your full transaction history, email, or identity). We do not control Google's own data retention for API requests; refer to Google's API terms for details on their handling of this data.

AI features are optional to use — the app's core functionality (manually logging transactions and shared expenses) works without them.

## 3. Where your data is stored

Your data is stored in a managed Postgres database hosted by Supabase. Access to your data is restricted by database-level security rules (Row Level Security) that only allow you to read your own personal data, and only allow flat members to read their shared flat's data — enforced at the database level, not just in the app's interface.

## 4. Your rights

You can access, edit, or delete any transaction, category, or shared expense you've created at any time within the app. To request deletion of your entire account and all associated data, contact us at the email address below — we aim to process such requests within a reasonable timeframe. (A self-service "delete my account" option within the app itself is planned but not yet implemented.)

## 5. Compliance

We aim to handle personal information consistently with the principles of the New Zealand Privacy Act 2020 — collecting only what's needed, being transparent about its use, keeping it secure, and allowing you to access or correct it.

## 6. Children's privacy

Tabby is not directed at children and we do not knowingly collect data from children under 13.

## 7. Changes to this policy

If this policy changes meaningfully, we'll update the "last updated" date above. Continued use of the app after changes means you accept the updated policy.

## 8. Contact

Questions about this policy or your data: [contact email to be added].
