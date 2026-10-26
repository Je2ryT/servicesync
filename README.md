# ServiceSync · Mont Carmel

Sunday service scheduling for Mont Carmel Church: teams and positions (coordinators, worship, sound, ushers…), monthly calendar with auto-fill, coverage and workload checks, double-booking warnings, live Sunday checklists, a live service timer with a full-screen stage screen, confirm/decline and swap requests, and order-of-service templates.

- **Hosting:** Vercel (Vite build, settings in `vercel.json`)
- **Logins and data:** Supabase (free tier is plenty)
- **Files:**
  - `src/` — the app (`main.js` starts it; `domain.js` holds the scheduling rules; `views/` one file per screen)
  - `schema.sql` — database setup for a brand-new project
  - `migrations/` — database updates, run in order after `schema.sql`
  - `tests/` — run with `npm test`

## Updating an existing install to teams & positions

Do these two steps close together, in this order:

1. In Supabase, open **SQL Editor → New query**, paste all of `migrations/001-teams-and-positions.sql`, and click **Run**. It only adds tables; nothing is deleted. Everyone on the roster becomes a *Coordinator* in a *Service coordination* team, and every existing assignment and confirm/decline carries over.
2. Merge the `teams-positions` branch into `main` on GitHub. Vercel builds and publishes it.

Then open **People → Teams & positions** to add teams such as Worship, Sound or Ushers, and tick on each person which positions they can serve.

Until step 2 is live, the old app keeps working, but anything changed in it after step 1 won't carry over. If the new app shows **Database update needed**, step 1 hasn't been run yet.

## Live service timer

On **Live**, each service has a **Service timer** card. Press **Start service** and it counts down each segment of the order of service (from **Templates**), in sync on every screen.

- **Next** finishes the current segment, ticks it off in the order of service, and starts the next one. **←** goes back one segment.
- **Pause / Resume**, and **−1 / +1 / +5 min** to stretch or shorten the current segment.
- **Message** puts a short note in large type on the stage screen ("Wrap up", "Merci de conclure"). **Clear** removes it.
- **End service** stops the clock. Afterwards the card shows planned against actual minutes for every segment, and the order of service shows the actual time next to each item.

**Stage screen.** **Stage screen** opens the timer in a new window: segment name, a giant countdown, what's next, the time of day, and whether the service is on time. It turns amber near the end of a segment and red when it runs over. Press **Full screen** (or **F**). The French service's screen is in French.
The address looks like `…/#stage/2026-11-01/en`, so a booth laptop or TV can bookmark it. It needs someone signed in. From a keyboard, **Space** or **→** = next, **←** = back, **P** = pause, **+** = add a minute (for people allowed to run the timer).

Admins can run any timer; people on the roster can run timers on published Sundays.

**Updating an existing install:** run `migrations/002-live-timer.sql` in Supabase (SQL Editor) before merging the timer into `main`. If you merge first, everything else keeps working and the timer card asks for the update.

## Working on the code

```bash
npm install
npm run dev     # local preview at http://localhost:5173
npm test        # scheduling rules and screens
npm run build   # what Vercel runs
```

---

## 1. Create the database (about 5 minutes)

1. Go to **supabase.com**, sign in, and click **New project**. Name it `servicesync`, pick a region near Charlotte (US East), set a database password, and create it.
2. When it finishes, open **SQL Editor → New query**, paste all of `schema.sql`, and click **Run**. Then do the same with each file in `migrations/`, in order.
   - The last line makes `tshibaljerry5@gmail.com` the administrator. Change it first if you sign in with a different email.
3. Open **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (the long key labeled *anon* / *publishable*). **Never** use the `service_role` key here.
4. Paste them at the top of `src/config.js` (or set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel → Project → Settings → Environment Variables):
   ```js
   export const SUPABASE_URL = ... || 'https://abcd1234.supabase.co';
   export const SUPABASE_ANON_KEY = ... || 'eyJhbGciOi...';
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
Push this folder to a GitHub repo, then on vercel.com click **Add New → Project**, import the repo and click **Deploy**. `vercel.json` sets the build for you.

Your app will be at something like `servicesync.vercel.app`. To use your own domain, add it under **Project → Settings → Domains**.

## 3. Tell Supabase where the app lives

In Supabase, open **Authentication → URL Configuration**:
- **Site URL:** your Vercel address, for example `https://servicesync.vercel.app`
- **Redirect URLs:** add the same address (and your custom domain if you have one)

Without this step, the sign-in email links point to the wrong place.

**Optional — "Continue with Google":** in **Authentication → Providers → Google**, turn it on and paste a Google OAuth client ID and secret (created at console.cloud.google.com). Until then, coordinators use the email sign-in link.

## 4. Add your team

1. Open the app and sign in with your admin email (you'll get a link by email).
2. Go to **People → Teams & positions** and create your teams and positions. For each position set the *minimum* a service can't run without and the *preferred* number.
3. Go to **People → Add person**. Enter their name, the **email they will sign in with**, phone, which services (English/French) they serve, and tick the positions they can fill.
4. Send the team the app link. When someone signs in with the email on their card, they're linked automatically and see only published schedules.

**Who can do what**

| | Administrator | Team member |
|---|---|---|
| Plan, auto-fill and publish months | ✓ | |
| Edit people, teams, templates, checklists | ✓ | |
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
