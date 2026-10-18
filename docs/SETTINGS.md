# Workshop settings

Current role separation is documented in [PRIVATE_ACCESS.md](PRIVATE_ACCESS.md). Workshop settings belong to Admin Dashboard; the database Staff role now opens the assigned-repair Technician Dashboard.

Open **More → Settings** on a phone, or **Settings** in the desktop sidebar. Admin can edit; Staff can view. Changes apply to the shared workshop after **Save Settings**. Unsaved changes can be discarded. If another Admin updates settings while a draft is open, load the latest settings before saving.

Settings navigation has ten categories:

1. **General Settings:** shop details, currency, timezone and dates.
2. **Users & Management:** My Profile plus workshop user management. My Profile includes Personal Information (Clerk name and contacts), Account Information (role, access, dates), My Activity (only the current workshop user's actions), and Profile Settings. Clerk manages personal information, sign-in methods and sessions. Workshop roles remain Admin-controlled.
3. **Security Settings:** authentication and access information; opens Clerk account and session controls in shared mode.
4. **Notifications:** current in-app alert channels. Email and SMS are explicitly marked not configured.
5. **Activity:** searchable workshop audit history.
6. **Appearance & Preferences:** number format, receipt layout and receipt content.
7. **Data Management:** Admin-only JSON export of currently loaded records. Demo reset is available only in demo mode; restore is not implemented.
8. **Integrations & API:** current Clerk/Supabase connections and authenticated API information, without exposing credentials.
9. **System Configuration:** repair defaults, payment methods, expense categories and status wording.
10. **About & Support:** version, environment, usage help and troubleshooting.

Switching categories preserves the current draft. Save Settings applies the complete draft. Editable fields include:

Personal preferences are separate from shared shop settings: save-confirmation visibility, standard/large text, and reduced motion are saved per workshop user on the current browser. Errors and pending-save warnings stay visible. Email/SMS delivery is not configured. Editing personal details opens Clerk's account controls; it does not edit another user's role or workshop history.

- **Shop Details:** name/text logo, subtitle, phone, email, address and website. The saved name appears in the app and on receipts.
- **Currency and Dates:** currency, timezone, date format and number format. Existing financial records lock the currency to preserve their amounts. New dates use the workshop timezone.
- **Repair Defaults:** number prefix, next number, promised days, brands, issue categories and accessories. Defaults apply to new repairs; existing records retain their values.
- **Payments and Expenses:** custom payment methods and expense categories, separated by commas. Removed methods cannot be used for new payments. Historical payments keep their original method and remain reversible.
- **Repair Status Names:** editable display names for all eight existing stages. The underlying workflow, completion calculations and collection rules stay unchanged.
- **Receipts and Printing:** header, footer, terms, warranty, compact layout and optional contact details, IMEI, technician and diagnosis. A draft receipt preview appears in Settings.

Existing settings load without resetting data. Server validation, active membership checks, revisions and audit records also apply to settings saves.

Owner-requested values saved and reloaded from Supabase on 2026-10-18: shop name **maqul**, currency **USD**. Contact fields remain blank until the owner supplies them.
