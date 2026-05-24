# KSS Accessibility Live Monitor

Operational monitoring for Download Festival accessibility campsite response.

This project deliberately avoids hidden Facebook scraping, fake-login bots, private group crawling, and platform bypasses. The private-group route is a Chrome extension used by an authorised monitor on a visible page they are already allowed to view.

## What is included

- Next.js App Router dashboard with live cases, alerts, SLA age, assignments, action logs, CSV export and daily summary.
- Rule-based classifier for operational keywords, severity, category, location hints, personal data indicators, special category risk and medical/safeguarding flags.
- Supabase schema and seed SQL for profiles, sources, source events, cases, actions, alerts, public reports, audit log and retention jobs.
- API routes for source event ingestion, case updates, action notes, public reports, live dashboard data and alert acknowledgement.
- Direct QR reporting form at `/report`.
- Compliance pages for DPIA, legitimate interests and special category warnings.
- Manifest V3 Chrome extension source under `extension/src`.
- Public-source adapter scaffolding for approved Reddit API, RSS, official Download feeds, weather APIs and manual CSV imports.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Without Supabase environment variables, the app uses an in-memory development store with safe demo cases. The local extension token defaults to `dev-extension-token` outside production.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql`.
3. Run `supabase/seed.sql`.
4. Create a source token for the Chrome extension using the commented SQL in `supabase/seed.sql`.
5. Set server environment variables:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SCHEMA=public
SUPABASE_TABLE_PREFIX=dl_
EXTENSION_API_TOKEN=
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Do not expose it with a `NEXT_PUBLIC_` prefix.

The SQL installs prefixed `dl_` tables in the standard `public` schema so it can share an existing Supabase project without colliding with other app tables. The Next.js API uses the service role key server-side; do not expose the service role key to browser code.

## Chrome extension

Build the unpacked extension:

```bash
npm run extension:build
```

Load `extension/dist` in Chrome as an unpacked extension. Configure:

- Dashboard API URL, for example `http://localhost:3000`
- Source API token
- Source id
- Allowed domains
- Monitoring mode

The extension:

- observes only visible DOM content on approved domains;
- is preconfigured with `https://www.facebook.com/groups/downloadfestivalaccess` as an approved page URL;
- does not bypass login;
- does not open hidden comments;
- does not crawl groups;
- redacts obvious phone/email/profile handles;
- queues Low and non-critical Manual Review detections;
- sends Critical matches immediately.

## Verification

Useful checks:

```bash
npm run lint
npm run typecheck
npm run build
npm run extension:build
```
