# ServiceSync · Mont Carmel

Sunday service scheduling for Mont Carmel Church: monthly calendar, coverage and workload checks, live Sunday checklists, roster, swap requests and templates.

- **Hosting:** Vercel (a static site, no build step)
- **Logins and data:** Supabase (free tier is plenty)
- **Files:** `index.html` (the whole app), `schema.sql` (database setup)

---

## 1. Create the database (about 5 minutes)

1. Go to **supabase.com**, sign in, and click **New project**. Name it `servicesync`, pick a region near Charlotte (US East), set a database password, and create it.
2. When it finishes, open **SQL Editor → New query**, paste all of `schema.sql`, and click **Run**.
   - The last line makes `tshibaljerry5@gmail.com` the administrator. Change it first if you sign in with a different email.
3. Open **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (the long key labeled *anon* / *publishable*). **Never** use the `service_role` key here.
4. Paste them at the top of `index.html`:
   ```js
   const SUPABASE_URL='https://abcd1234.supabase.co';
   const SUPABASE_ANON_KEY='eyJhbGciOi...';
   ```
   The anon key is safe to publish. The access rules in `schema.sql` decide what each person can see and change.

## 2. Put it online with Vercel

**Option A — from your computer (fastest)**
```bash
cd servicesync-web
npx vercel          # log in, accept the defaults
npx vercel --prod   # publish
```

**Option B — through GitHub**
Push this folder to a GitHub repo, then on vercel.com click **Add New → Project**, import the repo and click **Deploy**. Leave all build settings empty.

Your app will be at something like `servicesync.vercel.app`. To use your own domain, add it under **Project → Settings → Domains**.

## 3. Tell Supabase where the app lives

In Supabase, open **Authentication → URL Configuration**:
- **Site URL:** your Vercel address, for example `https://servicesync.vercel.app`
- **Redirect URLs:** add the same address (and your custom domain if you have one)

Without this step, the sign-in email links point to the wrong place.

**Optional — "Continue with Google":** in **Authentication → Providers → Google**, turn it on and paste a Google OAuth client ID and secret (created at console.cloud.google.com). Until then, coordinators use the email sign-in link.

## 4. Add your team

1. Open the app and sign in with your admin email (you'll get a link by email).
2. Go to **Roster → Add coordinator**. For each person, enter their name, the **email they will sign in with**, phone, and which services they can serve.
3. Send the team the app link. When a coordinator signs in with the email on their card, they're linked automatically and see only published schedules.

**Who can do what**

| | Administrator | Coordinator |
|---|---|---|
| Plan, auto-fill and publish months | ✓ | |
| Edit roster, templates, checklists | ✓ | |
| See published schedule | ✓ | ✓ |
| Confirm or decline own assignments | ✓ | ✓ |
| Mark own Sundays off | ✓ | ✓ |
| Request a swap | | ✓ |
| Approve or decline swaps | ✓ | |
| Tick checklists in Live view | ✓ | ✓ |

To add another administrator, run this in the Supabase SQL Editor:
```sql
insert into admins (email) values ('their@email.com');
```

## Notes

- Changes show up live for everyone who has the app open.
- Supabase's built-in email sender is limited to a few sign-in emails per hour. For a team of 10–15 that's usually fine. If links stop arriving, connect a free email service (for example Resend) under **Authentication → SMTP Settings**.
- Free Supabase projects pause after about a week with no activity. Opening the app weekly keeps it awake. If it pauses, click **Restore** in the Supabase dashboard.
