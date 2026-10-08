// Plain-structured versions of legal/privacy-policy.md and
// legal/terms-of-service.md, kept in sync by hand -- rendered in-app via
// LegalModal. Source-of-truth markdown files live in /legal at the repo
// root (also usable as a public URL for App Store Connect's privacy
// policy field, since GitHub renders markdown files directly).

export type LegalSection = { heading: string; body: string };
export type LegalDoc = { title: string; lastUpdated: string; sections: LegalSection[] };

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy Policy',
  lastUpdated: 'October 2026',
  sections: [
    {
      heading: '1. What we collect',
      body:
        'Account information: your email address and password (stored securely by our authentication provider, Supabase -- we never see or store your plaintext password), and a display name you choose.\n\n' +
        'Financial data you enter: transaction amounts, descriptions, dates, and categories you log for your own budgeting. This data is yours and is only ever visible to you.\n\n' +
        "Flat/shared expense data: if you create or join a flat, we store the flat's name, an invite code, who its members are, shared expenses you or your flatmates log (amount, description, date, who paid, who it's split between), and settlement records (who paid whom back). This data is only visible to members of that specific flat -- never to anyone outside it, and never to us for any purpose beyond operating the app.\n\n" +
        'We do not collect your location, contacts, photos, or any data beyond what you directly enter into the app. We do not use advertising trackers or sell data to third parties.',
    },
    {
      heading: '2. How AI features work',
      body:
        'Some features (automatic categorization, natural-language expense entry, monthly spending summaries) send the relevant text -- a transaction description, or a summary of your category totals -- to Google\'s Gemini API to generate a result. This happens through our own server-side proxy, not directly from your device, and only includes the minimum data needed for that specific feature (e.g. "coffee $8.50", not your full transaction history, email, or identity). We do not control Google\'s own data retention for API requests; refer to Google\'s API terms for details on their handling of this data.\n\n' +
        "AI features are optional to use -- the app's core functionality (manually logging transactions and shared expenses) works without them.",
    },
    {
      heading: '3. Where your data is stored',
      body:
        'Your data is stored in a managed Postgres database hosted by Supabase. Access to your data is restricted by database-level security rules (Row Level Security) that only allow you to read your own personal data, and only allow flat members to read their shared flat\'s data -- enforced at the database level, not just in the app\'s interface.',
    },
    {
      heading: '4. Your rights',
      body:
        "You can access, edit, or delete any transaction, category, or shared expense you've created at any time within the app. To request deletion of your entire account and all associated data, contact us at the email address below -- we aim to process such requests within a reasonable timeframe. (A self-service \"delete my account\" option within the app itself is planned but not yet implemented.)",
    },
    {
      heading: '5. Compliance',
      body:
        'We aim to handle personal information consistently with the principles of the New Zealand Privacy Act 2020 -- collecting only what\'s needed, being transparent about its use, keeping it secure, and allowing you to access or correct it.',
    },
    {
      heading: "6. Children's privacy",
      body: 'Tabby is not directed at children and we do not knowingly collect data from children under 13.',
    },
    {
      heading: '7. Changes to this policy',
      body:
        'If this policy changes meaningfully, we\'ll update the "last updated" date above. Continued use of the app after changes means you accept the updated policy.',
    },
    {
      heading: '8. Contact',
      body: 'Questions about this policy or your data: [contact email to be added].',
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDoc = {
  title: 'Terms of Service',
  lastUpdated: 'October 2026',
  sections: [
    {
      heading: '1. What Tabby is',
      body:
        'Tabby is a personal finance tracker with flatmate bill-splitting features. It helps you log and categorize your own spending, and share/split household expenses with flatmates you choose to connect with.',
    },
    {
      heading: '2. Your account',
      body:
        "You're responsible for keeping your login credentials secure and for all activity under your account. You must provide a real, working email address -- it's how you sign in and (if needed) how we'd contact you about your account.",
    },
    {
      heading: '3. Your data, your content',
      body:
        "Transactions, categories, and shared expenses you enter belong to you. By entering shared-expense data in a flat, you're sharing that specific data with the other members of that flat -- nothing more.",
    },
    {
      heading: '4. Not financial advice',
      body:
        'Tabby is a budgeting and expense-splitting tool. It does not provide financial, tax, or legal advice. Spending summaries and category breakdowns are informational only. AI-generated insights and categorizations may occasionally be inaccurate -- always check figures that matter before acting on them (e.g. settling a balance with a flatmate).',
    },
    {
      heading: '5. Acceptable use',
      body:
        "Don't use Tabby to log, share, or process data you don't have the right to share (e.g. someone else's financial information without their consent), and don't attempt to access another user's or flat's data outside the app's normal sharing features (e.g. via another member adding you).",
    },
    {
      heading: '6. Flats and shared data',
      body:
        "Joining a flat shares your name and the shared expenses you log with other members of that flat. Leaving a flat removes your access to its data going forward but does not retroactively delete expense history you contributed while a member, since other members' balances depend on that history.",
    },
    {
      heading: '7. No warranty',
      body:
        'Tabby is provided "as is." We don\'t guarantee it will be error-free, available at all times, or that AI-generated categorizations/parsing will always be accurate.',
    },
    {
      heading: '8. Limitation of liability',
      body:
        "To the extent permitted by law, we aren't liable for financial decisions made based on information in the app, or for disputes between flatmates about shared expenses -- the app is a record-keeping tool, not a party to those arrangements.",
    },
    {
      heading: '9. Changes',
      body: 'We may update these terms as the app evolves. Continued use after a change means you accept the updated terms.',
    },
    {
      heading: '10. Governing law',
      body: 'These terms are governed by the laws of New Zealand.',
    },
    {
      heading: '11. Contact',
      body: 'Questions about these terms: [contact email to be added].',
    },
  ],
};
