# Deployment Guide

## Simplest no-monthly-fee deployment

Run the app on a spare Windows or Linux office computer that can stay powered on.

1. Install Node.js 22 or newer.
2. Put every package file in one folder.
3. Copy `.env.example` to `.env` and enter the SMTP settings.
4. Run `npm install`.
5. Run `npx playwright install chromium`.
6. Run `npm start`.
7. Open `http://localhost:3000` on that computer.

To access the app from other devices on the same network, use the computer's local IP address, for example `http://192.168.1.50:3000`. Allow TCP port 3000 through the computer firewall only on the trusted work network.

Use the operating system's startup tools to run `npm start` after reboot. Docker Compose with `restart: unless-stopped` is also included.

## Docker deployment

1. Copy `.env.example` to `.env`.
2. Enter SMTP settings and change `COOKIE_SECRET`.
3. Run:

```bash
docker compose up -d --build
```

4. Open `http://localhost:3000`.

The included named volume stores `tcg-monitor.sqlite` outside the replaceable container so recipients and the sent-alert lock survive container rebuilds.

Useful commands:

```bash
docker compose logs -f
docker compose restart
docker compose down
docker compose up -d --build
```

## Generic GitHub-to-cloud deployment

This repository includes a root-level `Dockerfile` and `Procfile`. A container or Node.js host should use:

- Build: `npm ci` and `npx playwright install --with-deps chromium`, or build the included Dockerfile
- Start: `node server.js`
- Health check: `/health`
- Port: read from the host-provided `PORT` variable
- Persistent database path: set `DB_PATH` to a mounted persistent disk

Required secrets:

```text
APP_PASSWORD
COOKIE_SECRET
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
MAIL_FROM
```

Recommended production values:

```env
NODE_ENV=production
COOKIE_SECURE=true
TRUST_PROXY=true
BROWSER_HEADLESS=true
```

## Persistent storage warning

Recipients, logs, current state, and the one-billion sent lock live in SQLite. Many cloud web services use temporary filesystems. Mount a persistent disk and set, for example:

```env
DB_PATH=/data/tcg-monitor.sqlite
```

Without persistent storage, a restart could erase the email list and sent-alert lock.

## First live check

After deployment:

1. Log in with the configured password.
2. Confirm the live counter changes to the current TCG website value.
3. If it does not, enter the exact counter CSS selector in Advanced settings.
4. Add one recipient.
5. Send a test email.
6. Confirm the email arrives.
7. Add the remaining recipients.

Do not manually reset the one-billion sent lock after the milestone unless you have verified that a repeat announcement is intended.
