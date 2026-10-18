# Private business access

Clerk sign-up must be restricted. Accounts are provisioned by the owner/Admin. The app redirects public sign-up to login. A Clerk session grants workshop access only when its backend-controlled external UUID matches an active app_users membership.

Admin accounts manage the workshop and its protected access policy. Staff use either a limited technician dashboard or the module workspace configured through Roles & Permissions. See [ROLES_PERMISSIONS.md](ROLES_PERMISSIONS.md).

The technical dashboard supports assigned repairs or all workshop repairs according to repairScope. It sends technical repair details without financial history, prices, other user accounts or shop configuration. Diagnosis and technical status writes are validated on the server. Collection, cancellation and financial changes require appropriate module permissions.

All database reads and writes pass through authenticated server APIs. Direct anon/authenticated table access is revoked; service credentials remain server-only. Every request checks active membership and current permissions.

The Admin-only technician preview is read-only and creates no technician session. Test real Staff login using that Staff member's own account.

Operator scripts require EXPECTED_SUPABASE_PROJECT_HOST to match the configured database URL, preventing accidental operations against a different project. Keep real environment values, account details and QA evidence outside version control.
