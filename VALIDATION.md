# Validation Report — v1.2 Flat Deploy Ready

Validation date: July 13, 2026

## Package structure

- `index.html` is at repository root.
- Both supplied images are at repository root.
- All backend modules, tests, setup scripts, documentation, and deployment files are at repository root.
- No `assets/`, `lib/`, `public/`, `src/`, `data/`, `scripts/`, `tests/`, or `.github/` source folders are included.
- The release ZIP is built with files directly at ZIP root and no outer containing folder.

## Automated validation

The final package passed:

- Root-package structure verification
- JavaScript syntax checks
- Authentication token and cookie tests
- Counter parsing tests, including protection against confusing the one-billion target with the live counter
- SQLite persistence test
- Email generation and recipient validation tests
- Playwright extraction tests using both an exact selector and nearby label text
- Authenticated WebSocket state and broadcast test
- Full server smoke test covering:
  - server startup and health endpoint
  - anonymous API rejection
  - correct and incorrect login behavior
  - recipient add, disable, and re-enable
  - generated test email
  - root-level HTML, CSS, JavaScript, logo, and wizard image delivery

Result: **17 tests passed, 0 failed, 0 skipped**, followed by a successful smoke test.

## Visual validation

The dashboard was rendered at desktop and mobile sizes. The wizard is visible as the main full-screen background, the TCG Machines logo remains readable, the counter is the visual focus, and the email controls reflow cleanly on a phone-width viewport.

## Live-site limitation

The current environment does not permit a final browser navigation to the public TCG Machines page, so the exact production counter element could not be confirmed here. The app supports automatic label, DOM, JSON-response, and WebSocket detection, plus an optional exact CSS selector that can be entered in Advanced settings during the first live deployment.

## Deployment validation

- Root-level `Dockerfile` included
- Root-level `docker-compose.yml` included with persistent SQLite volume
- Root-level `Procfile` included
- `/health` endpoint available
- Host and port are environment-configurable
- `DB_PATH` supports a mounted persistent disk
