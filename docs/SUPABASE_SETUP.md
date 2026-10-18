# Supabase connection and rollout

The reviewed migration was applied through Supabase SQL Editor on 2026-10-17, the existing owner was assigned Admin, and `.env.local` now enables shared mode. No demo records were uploaded. Authentication has since moved to **Clerk**; follow [CLERK_SETUP.md](CLERK_SETUP.md) for current login and identity linking. Supabase Auth identities remain internal UUID anchors for the existing database relationships. The older Supabase password-login instructions below are historical and do not configure the current app login.

Project URL supplied by the owner: `https://YOUR_PROJECT.supabase.co`.

## 1. Inspect the destination before applying SQL

Use the connected Supabase integration or the project's SQL Editor to inspect existing tables and migrations. The migration creates tables with names such as `shops`, `customers`, and `repairs`; if these names already exist, stop and adapt the migration rather than replacing existing tables. Use a development branch or staging project first when the destination contains data. Take a database backup before production changes.

Apply `supabase/migrations/202610170001_shop_foundation.sql` through Supabase migrations or SQL Editor after checking for collisions. It runs in a transaction, creates tables and functions, and never drops existing tables. The optional local test uses PGlite and does not contact the hosted project.

## 2. Create the first real account

In Supabase Authentication → Users, create the Admin account using an account email you control. Set its password privately in the Supabase UI, or use your organization's normal account provisioning. Do not paste passwords into chat or source code. This application does not send invitations automatically.

Copy the account's **User ID**. Edit the Admin UUID and display name in `supabase/bootstrap.sql`, then run that file in the project's SQL Editor. This creates an empty shop with an active Admin membership. It imports no fictional customers, repairs, or money records. The function rejects an account already assigned to a shop.

## 3. Configure the local server privately

The ignored `.env.local` file contains the project URL and blank key fields. Supply the following locally:

```dotenv
APP_DATA_MODE=demo
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SECRET_KEY=your_server_secret_key
APP_ORIGIN=http://localhost:3000
```

Get API details from the project's **Connect** dialog / API Keys settings. The publishable key is safe for browser use. The secret key (or legacy service-role key) must remain on the server: never give it a `NEXT_PUBLIC_` prefix, commit it, put it in a screenshot, or send it in chat. No secret is included in this repository. The server uses it only after verifying the current user's Auth identity and active shop membership.

Run `pnpm check:connection`. It reports missing variable names, connection availability, migration presence, and whether an active Admin membership exists; it never prints key values. This check reads the destination and makes no schema changes.

After this succeeds, set `APP_DATA_MODE=supabase` and restart `pnpm dev`. Sign in at `/login`. Demo storage is ignored in shared mode. Do not enable shared mode before the migration and Admin membership are ready.

## 4. Add the second person

Create the Staff account privately in Supabase Authentication. As the app's Admin, open **Users and Activity → Add User**, enter that Auth User ID, its display name and the Staff role, then save. The Auth foreign key prevents linking a nonexistent account. A user belongs to one shop in this version. Deactivation removes access while preserving historical records.

No password, invitation email, or Auth user is created from the app's Users form. This avoids accidentally emailing someone or creating an account in the wrong project. Disable public self-signup if the shop uses Admin-provisioned accounts only. An unassigned Auth account has no access even if it can authenticate.

## 5. Verify shared mode before use

1. Open two separate browser profiles/devices and sign in as Admin and Staff.
2. Create a new repair and deposit. Confirm the other profile sees it after Refresh or the 15-second synchronization interval.
3. Order a part, partially receive, receive the remainder, and assign a received part. Confirm costs and available stock.
4. Try an overpayment, assigning unreceived stock, and a Staff vendor payment. Each must be rejected.
5. Edit the same revision from both profiles. The second save must show a conflict and load the latest data, without overwriting it.
6. Mark Ready, collect the balance, print, and mark Picked Up. Confirm completion revenue, matched parts cost, handover, and reports.
7. Return an unassigned paid part and confirm vendor credit. Refund a customer payment with a reason and confirm the linked negative record.
8. Deactivate Staff and confirm the next read/save is denied. Sign out from both profiles.

## Security and storage design

- Supabase Auth is verified on the server with `getUser()`. Cookie sessions use HTTP-only cookies; production cookies require HTTPS. Next.js 15 uses `middleware.ts` to refresh sessions.
- RLS allows active members to read their own shop only. Anonymous access, direct browser writes, and browser execution of the transactional save function are revoked.
- Browser requests submit a proposed change. `lib/cloud-mutations.ts` reconstructs the allowed operation from authoritative database records and the verified user; it does not trust client roles, numbering, audit history, financial totals, completion dates or purchase costs.
- `commit_workspace` locks the shop row, checks its revision, rechecks membership, and writes all related records in one transaction. A repeated request ID with the same request hash is idempotent. A stale revision gets a conflict rather than overwriting newer work.
- Financial records, part usage, status history, movements and activity are append-only. Purchase terms, completion financial values, original handover and transactional currency have additional database guards.
- Entities live in separate tenant-scoped tables. Each row retains its typed application's JSON payload with generated relational columns for foreign keys, unique repair numbers, integer monetary values, quantities, roles, and indexes. A purchase currently contains one item; `purchase_items` keeps the item distinct for future multiple-item support.
- Photos and receipts are private inline data in their entity rows in this phase, not public bucket URLs. Files are limited to 350 KB and validated server-side. Workspace save requests have a 5 MB limit. Large datasets and multiple large attachments should move to private Supabase Storage and per-record queries before scaling.
- Synchronization polls every 15 seconds and on manual Refresh. This is not push-based Realtime synchronization. Unsaved stale edits must be reviewed again after a conflict.
- After an uncertain network result, the client retains the exact request and offers Retry Save; it does not create a new payment request. Pending retry information is kept in memory for the open tab. If the tab closes before confirmation, review the payment history before re-entering a payment.

## Deployment is separate

This phase does not deploy the app or alter DNS. Before public deployment, set the HTTPS application origin, configure Supabase site/redirect URLs and password policy, verify backup/recovery, monitor Auth and application logs, and run the two-user checks against the hosted staging database. Do not claim a hosted migration or login was verified from local tests alone.

References: [Supabase SSR for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database functions](https://supabase.com/docs/guides/database/functions).
