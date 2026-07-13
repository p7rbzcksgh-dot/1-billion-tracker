# TCG Machines — 1 Billion Card Monitor

A focused TCG Machines app that watches the live **Cards PhyzBatched** total, updates the dashboard in real time, manages an editable email list, and sends one protected announcement when the total reaches **1,000,000,000**.

## Flat repository package

This edition is intentionally flat. Every project file, image, test, startup script, and deployment file is located directly at the repository root.

There is no `assets/`, `src/`, `public/`, `lib/`, `server/`, or containing project folder. `index.html`, `tcg-machines-logo.jpeg`, and `phyzbatch-wizard.webp` are all at root level.

## What it does

- Password-only login. Default password: `#1Billion`
- Displays the TCG Machines logo and wizard artwork
- Keeps one Playwright Chromium page open on `tcgmachines.com`
- Reads the rendered counter every 250 ms by default
- Refreshes the source page every 30 seconds by default
- Tries an exact CSS selector first, then nearby label text, page text, JSON responses, and WebSocket messages
- Pushes counter changes to open dashboards through WebSockets
- Stores recipients, state, logs, and the sent-alert lock in SQLite
- Adds, removes, enables, and disables email recipients
- Sends a test email to all enabled recipients
- Requires two trustworthy readings at or above one billion before the milestone email is attempted
- Prevents the milestone email from being sent twice
- Restarts the browser automatically after page, browser, or connection failures
- Includes Docker, Docker Compose, Procfile, verification, automated tests, and a smoke test

## Important hosting note

This is a Node.js backend application, not a static website. GitHub Pages and ordinary static-site deployment cannot run the scraper, SQLite database, WebSocket server, or email sender.

Upload the files to a GitHub repository, then deploy the repository to a Node.js or Docker host. A spare office computer is the easiest no-monthly-fee option. Docker deployment instructions are in `DEPLOYMENT.md`.

## Fast local setup

1. Install Node.js 22 or newer.
2. Extract this package. Do not place the files inside another project folder when uploading them to GitHub.
3. Copy `.env.example` to `.env`.
4. Add the SMTP mailbox information to `.env`.
5. Run:

```bash
npm install
npx playwright install chromium
npm start
```

6. Open `http://localhost:3000`.
7. Enter `#1Billion`.
8. Add recipients and press **Send test email**.

Windows users can double-click `start-windows.bat`. Linux and macOS users can run `./start-linux.sh`.

## Uploading to GitHub

Create an empty GitHub repository and upload the **contents** of this package directly. After upload, the top level of the repository should show files such as:

```text
index.html
server.js
styles.css
client.js
tcg-machines-logo.jpeg
phyzbatch-wizard.webp
package.json
Dockerfile
README.md
```

There should not be another `TCG-1-Billion-Monitor` folder above those files.

## Email setup

The included `.env.example` contains a Microsoft 365 SMTP example:

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notifications@tcgmachines.com
SMTP_PASS=replace-with-mailbox-password-or-app-password
MAIL_FROM=TCG Machines Monitor <notifications@tcgmachines.com>
```

The app places recipients in BCC so the entire email list is not exposed to everyone receiving the announcement.

## Counter detection

The app first uses `COUNTER_SELECTOR` when one is configured. Without a selector it searches the rendered page for the text `Cards PhyzBatched` and reads a nearby number. It also watches relevant network responses and WebSocket messages.

If the monitor remains in **Reconnecting** status, open the TCG website in a browser, inspect the visible counter, copy its CSS selector, and save it in **Advanced settings**.

## Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `APP_PASSWORD` | `#1Billion` | Shared app password |
| `COOKIE_SECRET` | derived | Signs login cookies; set a random value for public deployment |
| `COOKIE_SECURE` | production-dependent | Use secure cookies over HTTPS |
| `TRUST_PROXY` | production-dependent | Trust the first reverse proxy |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `3000` | Web server port |
| `DB_PATH` | `./tcg-monitor.sqlite` | SQLite database location |
| `TARGET_URL` | TCG website | Counter source page |
| `COUNTER_LABEL` | `Cards PhyzBatched` | Visible label near the number |
| `COUNTER_SELECTOR` | blank | Optional exact CSS selector |
| `READ_INTERVAL_MS` | `250` | Loaded-page DOM read interval |
| `FULL_REFRESH_SECONDS` | `30` | Full source-page refresh interval |
| `BROWSER_HEADLESS` | `true` | Runs Chromium without a window |
| `CHROMIUM_EXECUTABLE_PATH` | blank | Optional custom Chromium path |
| `DISABLE_SCRAPER` | `false` | Disables scraping for testing |
| `SMTP_HOST` | blank | SMTP server |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | TLS mode |
| `SMTP_USER` | blank | SMTP username |
| `SMTP_PASS` | blank | SMTP password or app password |
| `MAIL_FROM` | SMTP user | Sender name/address |

## Validation

Run the complete local validation suite:

```bash
npm run check
```

This performs:

1. Flat-package and syntax verification
2. Unit and integration tests
3. A full server smoke test covering authentication, protected APIs, recipient storage, toggles, generated email, root-level images, and root UI delivery

## Database and one-time alert protection

The local database is created as `tcg-monitor.sqlite` at the repository root and is ignored by Git. For cloud deployment, set `DB_PATH` to a persistent disk location. Without persistent storage, a cloud restart can erase the recipient list and one-billion sent lock.

When the milestone is verified, the app records the alert as sent before allowing another send. Reset the lock only after confirming that a repeat email is actually required.

## License

MIT. TCG Machines branding and supplied artwork remain the property of their respective owner.
