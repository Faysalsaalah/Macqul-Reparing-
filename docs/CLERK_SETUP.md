# Clerk authentication

Current access model: public registration is disabled and the Clerk instance is restricted. See [PRIVATE_ACCESS.md](PRIVATE_ACCESS.md) for the current Admin/Technician dashboards and server-only database permissions. The first-owner signup instructions below describe the completed bootstrap, not an ongoing public signup flow.

The shared app uses Clerk sessions for login and Supabase for workshop data. The project is linked to the owner's existing development application. Clerk keys are in ignored `.env.local`; do not commit or paste them into chat.

`APP_DATA_MODE=demo` still runs the isolated local demo. Shared mode uses Clerk middleware, SignIn/SignUp components, and server-side session verification. Supabase passwords and cookies no longer sign into the app.

## Preserve workshop identities

Workshop records retain their UUID authors and foreign keys. A Clerk user's backend-controlled `externalId` maps to that existing UUID. The server reads it using Clerk's Backend API after verifying the session, then checks active membership and permissions in Supabase on every request. Signing up alone grants no workshop access. No browser receives the Supabase server key, and no email matching happens automatically during login.

After the owner creates an account **in the workshop app**, get its exact Clerk User ID and run:

```powershell
$env:NODE_USE_SYSTEM_CA='1'
node --env-file=.env.local scripts/link-clerk-user.mjs user_EXACT_ID
```

This links only the sole existing active Admin, requires the same verified primary email as its existing Supabase identity, rejects conflicting links, and changes no passwords or roles. Dashboard login and workshop app login are separate accounts.

For staff, provision an internal account in Supabase Auth and a Clerk account with the same verified email, add its UUID through Users and Activity, then run the same script with both the exact Clerk User ID and workshop UUID. This provisioning step preserves the database's existing auth.users foreign key; Supabase is not used for interactive login. Deactivation in the workshop takes effect on the next server request even while a Clerk session remains signed in.

All data access is through the authenticated Next.js API and service-only database RPCs. Direct browser access using a Clerk JWT is not enabled; no Supabase third-party provider or relaxed RLS policy is needed for this architecture.

## Verification

Check anonymous `/api/workspace` returns 401, an unlinked signed-in account cannot read the workshop, and a linked active Admin can load it. Verify Staff permissions, deactivation, sign-out, and two-device writes before business use. Passwords are not migrated; users sign in or create their credentials with Clerk. Production Clerk setup and deployment are separate work.
