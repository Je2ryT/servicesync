# ServiceSync · Mont Carmel

Sunday service scheduling for Mont Carmel Church: teams and positions (coordinators, worship, sound, ushers…), monthly calendar with auto-fill, coverage and workload checks, double-booking warnings, live Sunday checklists, a live service timer with a full-screen stage screen, confirm/decline and swap requests, and order-of-service templates.

- **Hosting:** Vercel (Vite build, settings in `vercel.json`)
- **Logins and data:** Supabase (free tier is plenty)
- **Files:**
  - `src/` — the app (`main.js` starts it; `domain.js` holds the scheduling rules; `views/` one file per screen)
  - `schema.sql` — database setup for a brand-new project
  - `migrations/` — database updates, run in order after `schema.sql`
  - `tests/` — run with `npm test` (`tests/db/` runs the migrations on a local Postgres)

## Updating an existing install

Database updates live in `migrations/`, numbered in order. For each one: in Supabase open **SQL Editor → New query**, paste the whole file, click **Run**, then merge the matching pull request so Vercel publishes the app. Every migration only adds things and is safe to run twice. Until a migration has run, the screens that need it show **Database update needed** and everything else keeps working.

| # | File | Adds | Notes |
|---|------|------|-------|
| 001 | `001-teams-and-positions.sql` | Teams, positions, assignments | Run it, then merge soon after: changes made in the old app in between don't carry over. Everyone on the roster becomes a *Coordinator*. |
| 002 | `002-live-timer.sql` | Live service timer | |
| 003 | `003-members-attendance-events.sql` | Members, check-in, events | |
| 004 | `004-service-reports.sql` | Service reports | |
| 005 | `005-activity-log.sql` | Activity log (who changed what) | Starts recording from the moment it runs; earlier changes aren't in the log. |
| 006 | `006-people.sql` | Richer people: categories, families, notes timeline, profile fields, saved filters | Each status becomes a category (member/regular → Congregation, newcomer/visitor → Visitors) and the move is written to the category history; the old status column is kept. Notes move to the notes timeline. Everyone on the serving team gets a member record (Volunteers). Check-in keeps working before and after. |
| 007 | `007-messaging.sql` | Email and text messages: message log, recipients, opt-out history | Sending also needs the Vercel settings below. |
| 008 | `008-followups.sql` | Follow-up flows (Newcomer flow with four steps), board, weekly reminder | From now on, new Visitors join the Newcomer flow automatically. People already in Visitors aren't added; use *Add to a follow-up* for them. The weekly email also needs `CRON_SECRET` below. |
| 009 | `009-reports.sql` | Attendance & people reports, weekly report emails | Reports read what's already there, so they include history from before 009. Weekly emails need the messaging settings and `CRON_SECRET`. |
| 010 | `010-admins.sql` | Manage administrators in the app (People → Administrators) | Emails are stored lower-case, the last administrator can't be removed, and changes go in the activity log. |
| 011 | `011-service-layout.sql` | Printable service layout: names typed for one service | Placeholders themselves live in the templates, so the layout shows and prints before 011; typing a name needs 011. |
| 012 | `012-admin-permissions.sql` | Different access for each administrator (including Live service for the timer) | Everyone who is an administrator today keeps full access; narrow it on People → Administrators afterwards. |
| 013 | `013-volunteers-from-members.sql` | Add volunteers from the members list | A member added to the serving team is linked to their existing record instead of creating a second one. |
| 014 | `014-hide-admin-list.sql` | Only full administrators see who the administrators are | Others see only their own access. |

Run `npm test` to apply `schema.sql` and every migration to a throwaway local Postgres and check the access rules, without touching Supabase.

## People

**People → Everyone** is the church directory (the serving team and teams & positions are the other two tabs).

- **Filters:** search by name, phone or email; category, language, service attended, last attended (in the last 2 weeks / month / 3 months, not in the last month / 3 months, never), has a phone, has an email. **Save filter** keeps a combination (shared with the serving team, or just for you).
- **Bulk:** tick people or **Select all shown**, then **Set category…** (admins) or **Export CSV**. The CSV opens in Excel and can be imported back.
- **Profile:** tap a name for details (birthday and age, gender, address, language), family members, what they serve and their upcoming Sundays (if they're on the serving team), a **notes timeline**, attendance over the last 26 Sundays, and the **category history**.
- **Categories** (admins): rename (English and French), reorder, hide, add. The starting list is Congregation, Volunteers, Visitors, Community Contacts, New Believers, Guest Speakers, Online Attendees.
- **EN | FR** in the header switches the newer screens (People, profiles…) between English and French on that device.
- Admins edit people; anyone on the serving team can read the directory and write notes.

## Messages (email and text)

**Contact** opens the composer from: the people you've ticked (or everyone shown, including a saved filter) on **People**, a person's profile, a team on **Teams & positions**, or a service's team on **Live**. Choose **Text (SMS)**, **Email** or **Both**, write the message (**Insert first name** adds `{first_name}`), check who won't receive it (opted out, no mobile, no email), review the total, and send. The counter shows characters and text segments as you type.

- Admins can message anyone; coordinators can message the people on their own team(s). The server checks this again.
- Opted-out people are always skipped. Replying **STOP** (or ARRÊT) to a text opts the person out; **START** opts them back in. Every email has an unsubscribe link.
- A retried or double-clicked send never goes out twice. Each person can send up to 5 messages per 10 minutes, to at most 1,000 people at a time.
- **Reports → Sent messages** lists every send and, for each person, whether it was sent, delivered, failed or skipped, and why.

**Setting it up (Vercel → Project → Settings → Environment Variables):**

| Variable | What it is |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string, **Transaction pooler** (port 6543), with your database password filled in |
| `UNSUBSCRIBE_SECRET` | Any long random text (signs the unsubscribe links). For example, the output of `openssl rand -hex 32` |
| `APP_URL` | Your site address, e.g. `https://servicesync-ruby.vercel.app` |
| `TWILIO_SID`, `TWILIO_TOKEN` | Twilio Console → Account Info |
| `TWILIO_FROM` | Your Twilio number (`+1…`) or Messaging Service SID (`MG…`) |
| `RESEND_API_KEY` | Resend → API Keys |
| `MAIL_FROM` | e.g. `Mont Carmel <noreply@yourdomain.org>` (the domain must be verified in Resend) |

Then in Twilio, set the number's (or Messaging Service's) **incoming message webhook** to `https://<your site>/api/twilio-inbound` (HTTP POST). US carriers require registering business texting (A2P 10DLC) in Twilio before bulk texts are delivered; this can take a couple of weeks.

## Follow-ups

The **Follow-ups** tab shows one board per flow, with a column for each step. The church starts with a *Newcomer* flow: Welcome text (1 day), Phone call (3 days), Second visit (7 days), Connect to a group (14 days). Administrators can rename steps, change their due days, give each step a default person, and add new flows.

- Anyone added through check-in, or moved into the *Visitors* category, joins the Newcomer flow. Imports don't, unless you tick *Add new Visitors to the Newcomer follow-up* on the import screen.
- **Mark done** writes a line on the person's notes timeline and moves them to the next step (with that step's default person, if it has one). After the last step the follow-up is finished.
- Home shows *My follow-ups*, overdue first; the bell counts overdue ones.
- Every Monday morning (12:00 UTC, which is 8 a.m. Eastern in summer and 7 a.m. in winter), each person with follow-ups due that week gets one email listing them. It needs the messaging settings above plus:

| Variable | What it is |
|---|---|
| `CRON_SECRET` | Any long random text. Vercel sends it to `/api/cron` so nobody else can trigger the emails |

## Printable service layout

Print the order of service before every service, with who leads each part.

1. **Templates → Order of service**: under each part, press **Add placeholder**. Pick the role (Pastor, Moderator, Interpreter, Choir, or **Other** with your own label such as Usher or Reader) and the tag colour: **blue, white or yellow**. Press **Done**, then **Save** the template. The default templates start with Moderator (welcome), Choir (worship), and Pastor and Interpreter (sermon).
2. **Reports → Layout** next to a service (or **Service layout** on its report): each placeholder shows its coloured tag and a name.
   - Names fill in from the schedule: from the position you linked to the placeholder, or a position with the same name (Pastor, Moderator, Interpreter/Interprète, Choir/Chorale).
   - Type a different name to change it for that service only. Leave it empty to go back to the schedule.
   - Places nobody fills print as a blank line, to write in by hand.
3. Press **Print**. The sheet has the church logo, the date and times, a Notes area, and prints in colour. French services print in French.

Administrators can fill in any service; people on the roster can fill in published Sundays (the same rule as service reports).

## Adding volunteers from the members list

Everyone in check-in and the People list is a member. To make one of them a volunteer:

- **People → Serving team → Add person**: type a few letters of their name or phone under **Pick from the members list** and pick them. Name, phone, email and language fill in; add a sign-in email if they don't have one, tick their positions, and **Save**.
- Or open the member's profile (**People → Everyone**) and press **Add to serving team**.
- Or, editing a position on **Teams & positions**, press **Add someone from the members list**; that position comes pre-ticked.

The new serving-team card is linked to the member's record (attendance, notes, follow-ups stay together); it never creates a duplicate. Members already on the serving team are greyed out in the list, and their profile shows **On the serving team**. This needs the Schedule & teams area (or full access).

## Attendance & people reports

**Reports → Attendance & people** has these reports. Each one downloads as CSV (it opens in Excel) and works in English and French:

| Report | What it shows |
|---|---|
| Absentees | People who came at least *N* times, then missed the last *N* weeks. Tick people to text or email them, or add them to a follow-up |
| Attendance | Charts and tables by service, category and month, with first visits |
| One person's attendance | Every Sunday someone came, for the period you choose |
| People activity | New people, category changes, notes, finished follow-ups and opt-outs |
| No notes lately | People nobody has written a note about in *N* days |
| Category changes | Who moved between categories, when and by whom |
| Volunteer positions | Who served in which position, how often, and how many times they confirmed or declined |
| Text message log | Every text with its delivery status. Team members see only their own |
| Unsubscribes | Opt-outs and opt-ins by email and text (administrators only) |

Team members see the same people and attendance they can already see in the app. Administrators can also choose **Email weekly** on a report: pick the weekday, the language and up to 20 addresses. The cron job runs every day at 12:00 UTC and sends the reports that are due that weekday. Each email has the first 50 rows and the full CSV attached, and it's logged under Sent messages.

## Dashboard, check-in and events

- **Home** opens with the profile of whoever is signed in (next time serving, positions, contact), notifications (confirmations to answer, swap requests, coverage issues, newcomers, events this week), today's check-in numbers and upcoming events. Admins also see the planning overview below.
- **Check-in**: pick the service (it picks English before 11:15 on Sundays, French after), search by name or phone, tap a name when someone arrives. Tap twice to undo. **New person** adds a newcomer and checks them in at once. Anyone on the roster can check people in; only admins edit or remove members.
- **Import from Elvanto** (Check-in, admins): in Elvanto open **People → Export → CSV**, then choose that file. ServiceSync matches the columns (first/last name, email, mobile, gender, birthday, address, family and family relationship, category), creates the families, shows a preview, and skips anyone already here (same email, phone or name). Nothing is saved until you press Import.
- **Events**: the church calendar by month, with Sundays marked. Admins add, edit and delete events.
- After signing in, the Mont Carmel logo plays a short intro (once per browser tab; tap to skip).
- The serving-team calendar tab is now called **Schedule**.

## Service reports

**Reports** has a report for every service (English, French and special events), newest first, showing how many notes, how many people were present and how long it ran. Each report has:

- the order of service with a **notes box for every segment** (Welcome, Worship, Sermon…), with planned and actual minutes from the live timer;
- attendance and newcomers from Check-in, total length, and who served in each position;
- **Summary** and **Follow-ups**;
- **Print / PDF** for a clean copy.

Notes save when you click out of the box ("Saved" appears). Two people can write notes on different segments at the same time without overwriting each other. Open a report from the list or from **Report & notes** on the Live screen. Admins can write any report; people on the roster can write reports for published Sundays.

## Activity log

**Reports → Activity log** (administrators only) lists every change to the schedule, serving team, members, check-ins, events, templates and reports: who made it, when, and in plain words ("Anna confirmed: Jerry as Coordinator · English Service, Nov 1"). Search it, or filter by area or by person. Bursts such as an import show as one line ("added 120 members") that expands.

The database records the changes itself, so nothing done through the app can skip the log, and nobody can edit or delete entries through the app. Live-timer and checklist ticks aren't logged.

## Live service timer

On **Live**, each service has a **Service timer** card. Press **Start service** and it counts down each segment of the order of service (from **Templates**), in sync on every screen.

- **Next** finishes the current segment, ticks it off in the order of service, and starts the next one. **←** goes back one segment.
- **Pause / Resume**, and **−1 / +1 / +5 min** to stretch or shorten the current segment.
- **Message** puts a short note in large type on the stage screen ("Wrap up", "Merci de conclure"). **Clear** removes it.
- **End service** stops the clock. Afterwards the card shows planned against actual minutes for every segment, and the order of service shows the actual time next to each item.

**Stage screen.** **Stage screen** opens the timer in a new window: segment name, a giant countdown, what's next, the time of day, and whether the service is on time. It turns amber near the end of a segment and red when it runs over. Press **Full screen** (or **F**). The French service's screen is in French.
The address looks like `…/#stage/2026-11-01/en`, so a booth laptop or TV can bookmark it. It needs someone signed in. From a keyboard, **Space** or **→** = next, **←** = back, **P** = pause, **+** = add a minute (for people allowed to run the timer).

**Phone remote.** Press **Remote** on the timer card. Scan the QR code with a phone (or copy the link, `…/#remote/2026-11-01/en`), sign in, and the phone becomes a remote: a big **Next** button, **Back**, **Pause**, **−1 / +1 / +5 min**, a stage message and **End service**. Every press updates the stage screen, the Live tab and any other remote within a second (through Supabase Realtime), so the timer can be run from the front row while the stage screen sits on the booth computer. Several remotes can be used at once; the phone stays awake while the remote is open.

Who can run the timer: administrators with **Full access** or the **Live service** area (any service, even before it's published), and people on the roster on published Sundays. Others see the countdown without the buttons.

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

### Adding or removing administrators

Go to **People → Administrators** (administrators only). Pick someone from the serving team, or type any email address, then press **Add administrator** and choose what they manage. To take someone off the list, press **Remove** next to their name. They stay on the serving team with a team member's access. The change applies the next time they open or reload the app. The last administrator can't be removed, so the church is never locked out.

**Access levels** (after migration 012): give an administrator **Full access**, or tick only the areas they manage:

| Area | What it allows |
|---|---|
| Schedule & teams | Plan and publish months, teams, positions, the serving team, swaps, days off, events |
| Live service | Run the service timer and phone remote for any service, even before it's published |
| People | Edit and remove members, categories, families, import; manage anyone's notes and saved filters |
| Messaging | Text or email anyone; see every sent message and unsubscribe |
| Follow-ups | Edit follow-up flows and steps; delete follow-ups |
| Reports | Activity log and weekly report emails |
| Templates | Order of service, placeholders, checklists |

Every administrator can still see everything, write service reports and check people in. Anyone on the roster can still run the timer on published Sundays. Only administrators with full access see the list of administrators, add or remove them, or change their access, and there is always at least one with full access. The database enforces all of this, not just the screens.

Before migration 010, or if you're ever locked out, you can do the same in the Supabase SQL Editor:
```sql
insert into admins (email) values ('their@email.com');
delete from admins where email = 'their@email.com';
```

## Notes

- Changes show up live for everyone who has the app open.
- Supabase's built-in email sender is limited to a few sign-in emails per hour. For a team of 10–15 that's usually fine. If links stop arriving, connect a free email service (for example Resend) under **Authentication → SMTP Settings**.
- Free Supabase projects pause after about a week with no activity. Opening the app weekly keeps it awake. If it pauses, click **Restore** in the Supabase dashboard.
