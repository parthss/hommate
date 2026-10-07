# Hommate

A shared-house app for chores, reminders and expenses. It's a PWA (an installable web app) for iPhone and Android, with a backend that runs on an old Android tablet.

- **Chores:** one-off and repeating chores, fixed owners or take-turns rotations, a weekly rota, swaps between housemates and "up for grabs" jobs.
- **Reminders:** push notifications before a chore is due, a nudge the morning after a missed one, swap requests and new expenses.
- **Expenses:** several payers per expense, split equally, by exact amounts, by percentage or by shares. Debts are simplified into the fewest payments. Settle up records payments only; Hommate never moves money.
- **Recurring bills:** added to Expenses on their day each month.
- **House issues:** a board the whole house can see, with optional anonymous posting.
- **Activity:** a full history of everything anyone does.
- **Accounts:** a username and password per person. People join a house by asking with its code, and an admin approves them. Admins can remove housemates, reset passwords and make other admins.

## How it's built

| Part | What | Why |
|---|---|---|
| Server | Node.js 22.13+ using only built-ins: `http`, `node:sqlite`, `crypto` | Nothing to install or compile on the tablet |
| Database | SQLite, one file at `data/hommate.db` | Light, and easy to back up |
| Push | Web Push (VAPID + aes128gcm), written on Node's `crypto` (`server/lib/push.js`) | No `web-push` package needed |
| App | Plain JavaScript ES modules, no build step (`web/`) | Copy the folder and it runs |
| Design | Lumen design system tokens and components (`web/css/lumen.css`) | Matches the designs in `design/canvas/` |

There is **no `npm install`**: `package.json` has no dependencies.

```
server/
  server.js          HTTP server, router, static files
  schema.sql         database tables (money in pence, times in house-local time)
  db.js              opens SQLite
  lib/chores.js      repeat rules → dated tasks, rotations
  lib/money.js       split maths, balances, debt simplifying
  lib/push.js        Web Push encryption and VAPID signing
  lib/scheduler.js   once-a-minute jobs: reminders, nudges, bills, weekly summary
  routes/*.js        the JSON API
  lib/auth.js        passwords (scrypt), sessions, lockouts
  lib/account.js     what the app gets about the signed-in person
  lib/membership.js  removing someone and re-planning their chores
  seed.js            the "Elm Road" demo house from the designs
  backup.js          safe database backup
  test/              npm test
web/
  index.html, sw.js, manifest.webmanifest, icons/
  css/lumen.css      design system (copied from design/canvas)
  css/app.css        app layout
  js/app.js          router and screen runtime
  js/screens/*.js    one file per screen
scripts/
  start.sh                       start on the tablet (wake lock, auto-restart, tunnel)
  termux-boot/start-hommate      start when the tablet turns on
```

## Try it on your laptop first

You need Node.js 22.13 or newer (`node --version`).

```bash
cd Hommate
npm test         # 15 tests: money, push encryption, accounts, joining, removing, scheduler
npm run demo     # demo house on http://localhost:8081
npm start        # your real (empty) house on http://localhost:8080
```

With `npm run demo`, open http://localhost:8081 and sign in as `maya` (the admin), `sam`, `raj` or `leo`. The password for all of them is `hommate-demo`. `tom` has already asked to join, so as Maya you'll see his request in the House tab. Use your browser's device toolbar (390px wide) to see it at phone size. Notifications work on `localhost` in desktop Chrome, so you can test them before the tablet is set up.

## Put it on the tablet (Termux)

### 1. Install the tools

Install **Termux** from F-Droid. The Play Store version is outdated. Also install **Termux:Boot** from F-Droid if you want Hommate to start when the tablet turns on. Then, in Termux:

```bash
pkg update && pkg upgrade
pkg install nodejs-lts git cloudflared
termux-setup-storage
node --version     # needs v22.13 or newer
```

### 2. Get the code onto the tablet

The easiest way is through GitHub, which also makes it your portfolio repo:

```bash
# on your Mac, in the Hommate folder
git init && git add . && git commit -m "Hommate"
# create an empty repo on GitHub, then:
git remote add origin https://github.com/<you>/hommate.git && git push -u origin main

# on the tablet
cd ~ && git clone https://github.com/<you>/hommate.git Hommate
```

After you change something later: `git push` on the Mac, then `cd ~/Hommate && git pull` on the tablet and restart.

### 3. Run it

```bash
cd ~/Hommate
npm test
./scripts/start.sh
```

Open `http://localhost:8080` in the tablet's browser to check it works. The server writes logs to `~/hommate.log`.

**Stop Android killing it:**

- Pull down the Termux notification and tap **Acquire wakelock** (`start.sh` does this for you).
- Go to Settings › Apps › Termux › Battery and choose **Unrestricted** (or "Don't optimise").

### 4. A stable HTTPS address (Cloudflare Tunnel)

Phones need HTTPS for the PWA and notifications, and they need to reach the tablet when they're not on your Wi-Fi. A Cloudflare Tunnel gives you both, without opening ports on your router.

1. Buy a cheap domain and add it to a free Cloudflare account. You can buy it through Cloudflare.
2. In the Cloudflare dashboard, go to **Zero Trust › Networks › Tunnels › Create a tunnel** and choose **Cloudflared**. Name it `hommate`.
3. Copy the token from the install command it shows (the long string after `--token`). Save it on the tablet:
   ```bash
   echo 'PASTE_TOKEN_HERE' > ~/.hommate-tunnel-token && chmod 600 ~/.hommate-tunnel-token
   ```
4. In the tunnel's **Public hostname** tab, add `hommate.yourdomain.com` → Service `HTTP`, URL `localhost:8080`.
5. Restart `./scripts/start.sh`. It starts the tunnel too. Open `https://hommate.yourdomain.com` on your phone.

Avoid the free `trycloudflare.com` quick tunnels: their address changes on every restart, which breaks installed apps and notification subscriptions.

### 5. Start on boot (optional)

```bash
mkdir -p ~/.termux/boot
cp ~/Hommate/scripts/termux-boot/start-hommate ~/.termux/boot/
```

Open the Termux:Boot app once so Android lets it run.

### 6. Set up the house

On your phone, open `https://hommate.yourdomain.com` → **Create an account** → **Create a new house**. Share the invite code from the House tab.

Each housemate then creates their own account, enters the code and taps **Ask to join**. You get a notification and a **Join requests** card at the top of the House tab, with Approve and Decline.

> **iPhone:** add it to the Home Screen first (Share › Add to Home Screen). The Home Screen app doesn't share storage with Safari, so sign in there once with your username and password. Then tap **Allow notifications**.

## Accounts and admins

- **Signing in:** a username (3–20 letters, numbers, `.`, `-` or `_`; not case-sensitive) and a password of at least 8 characters. Passwords are stored as scrypt hashes, never as plain text.
- **Staying signed in:** each device stays signed in for 90 days after it was last used.
- **Lockout:** 5 wrong passwords in a row lock that account for 15 minutes.
- **Forgotten password:** an admin opens House › the person › **Reset password** and gets a one-time temporary password to pass on. Every device the person is signed in on is signed out. When they sign in with the temporary password, they must choose a new one.
- **Removing someone:** an admin opens House › the person › **Remove from house**.
  - **Rotations:** they're taken out of every rotation, and whoever was next stays next.
  - **Their chores:** their one-person chores, and anything else still on their list, go to Unclaimed. Pending swaps with them are cancelled.
  - **Money:** their balance stays on Expenses as "Sam (left)" until it's settled.
  - **Bills:** any bills they paid are flagged so you can pick a new payer.
  - **For them:** they see "You're no longer in Elm Road" and can ask to join again. If they're approved, they get their old history and balance back.
- **Admins:** the creator is the first admin. Admins can make others admins, and a house always keeps at least one.
- **New housemates and chores:** someone who joins isn't added to existing rotations automatically. Edit a chore to add them.

## Settings (environment variables)

| Variable | Default | |
|---|---|---|
| `PORT` | `8080` | |
| `HOST` | `0.0.0.0` | Use `127.0.0.1` to allow only the tunnel and the tablet itself |
| `HOMMATE_DB` | `data/hommate.db` | |
| `HOMMATE_CONTACT` | `mailto:hommate@example.com` | Contact address sent to push services. Use your own email |
| `HOMMATE_FAKE_NOW` | (none) | Freeze the clock, e.g. `2026-10-05T09:30`. For testing only |

## Backups

```bash
npm run backup                         # → data/backups/, keeps 14 days
npm run backup -- ~/storage/downloads  # → the tablet's Downloads folder
```

The whole house is that one `.db` file. Keep a copy somewhere other than the tablet.

## Updating the app on phones

The service worker caches the app so it opens instantly. After changing files in `web/`, bump `VERSION` in `web/sw.js` (e.g. `hommate-v2`). Phones pick up the new version the next time they open the app.

## API at a glance

Every endpoint except sign-up and sign-in needs `Authorization: Bearer <token>`. House endpoints also need the account to be a current member of a house. Otherwise they answer `403` with `code: "no-house"` (or `"must-change"` after a password reset).

| | |
|---|---|
| `POST /api/register` · `POST /api/login` · `POST /api/logout` | Accounts |
| `GET/PATCH /api/account` · `POST /api/account/password` · `POST /api/account/signout-all` | Your account |
| `POST /api/houses` · `GET /api/invite/:code` · `POST /api/join-requests` · `DELETE /api/join-requests/mine` | Create a house, or ask to join one |
| `GET /api/house/requests` · `POST /api/house/requests/:id/approve\|decline` | Answer join requests (admins) |
| `GET /api/members/:id` · `POST /api/members/:id/admin\|reset-password\|remove` · `GET /api/members/:id/removal` | Housemates (admin actions) |
| `GET /api/today` · `GET /api/chores?filter=` · `GET /api/rota?week=` | Chore views |
| `POST/PUT/DELETE /api/chores[/:id]` · `GET /api/chores/:id` | Manage chores |
| `POST /api/tasks/:id/done\|undo\|claim` | One occurrence of a chore |
| `GET /api/tasks/:id/swap-options` · `POST /api/swaps` · `POST /api/swaps/:id/accept\|decline\|cancel\|undo` | Swaps |
| `GET/POST /api/expenses` · `GET/PUT/DELETE /api/expenses/:id` | Expenses and balances |
| `POST /api/payments` · `DELETE /api/payments/:id` | Settle up |
| `GET/POST /api/bills` · `PUT/DELETE /api/bills/:id` | Recurring bills |
| `GET/POST /api/issues` · `GET /api/issues/:id` · `POST /api/issues/:id/agree\|onit\|resolve\|reopen\|replies` | House issues |
| `GET /api/activity/feed` · `GET /api/activity?kind=&person=&before=` | Activity |
| `GET/PATCH /api/me` · `PATCH /api/house` · `POST /api/push/subscribe\|unsubscribe\|test` | Settings |

## Not built yet

- Photos on house issues (the design shows a placeholder).
- Leaving a house yourself (for now an admin removes you).
- An LLM feature, e.g. "paid £42 at Tesco, split with Raj and Sam" → a filled-in expense.

## Licence

MIT. See [LICENSE](LICENSE).
