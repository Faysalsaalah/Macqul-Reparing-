# Macqul Mobile Repairing

Next.js App Router / TypeScript / Tailwind workshop app with an isolated local demo and a shared Supabase workspace. Shared mode now uses Clerk authentication; see [Clerk setup](docs/CLERK_SETUP.md) for identity linking and first sign-in.

## Run

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Use the clearly labeled demo user switcher to try Admin and Staff. The interface uses hash routes so records can be bookmarked without a backend.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

## Data and reporting

Data access lives in `lib/storage.ts`, separately from typed models and business rules in `lib/domain.ts`. Data is saved in browser localStorage; a private window or another browser has separate data. Image attachments are limited to JPEG/PNG/WebP, 350 KB each, with a 3.5 MB total demo limit. Failed saves report errors and do not commit a partial update. Reset in Settings requires typing RESET.

Money uses integer minor units. Orders, receipts, assignments, returns, and payments are distinct records. Purchase costs are copied into part usage, and completion stores revenue/cost snapshots. Completed prices and assignments are locked to protect reports. Customer refunds and vendor reversals retain linked financial history. Vendor balances are derived per vendor across their purchases. A negative balance is vendor credit.

Revenue and matching parts costs are recognized on first Ready for Pickup (or direct collection). Cash collected is separate from revenue and is net of linked refunds. Operating expenses reduce profit once. Debts are current balances.

Browser printing provides intake receipts, individual payment receipts and device labels. Use browser print preview to select your printer and paper size.

## Boundaries

This is a single-device demo. The user switcher and action checks illustrate permissions, not secure authentication. localStorage does not provide safe concurrent multi-tab or multi-device editing. Keep one editing tab open. Production database, secure authentication, server-side permissions, audit integrity, backup and deployment are a separate next phase. No external services are connected.

## Optional Supabase phase

Shared-workspace authentication, tenant isolation and transactional persistence are implemented behind `APP_DATA_MODE=supabase`. Demo remains the default; the modes do not automatically copy data. See [Supabase setup](docs/SUPABASE_SETUP.md) before enabling shared mode. The server secret stays in the ignored `.env.local` file. Run `pnpm check:connection` after configuring it privately. The reviewed migration was applied to the supplied project on 2026-10-17; Admin account and membership setup are still pending.
