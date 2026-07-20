# TCG 1 Billion Monitor v1.9.1 - Railway Milestone Bug Fix

This is the full, flat, Railway-ready app package. It keeps the live counter locked to:

`https://tcgmachines.com/product`

It sends independent email and Microsoft Teams notifications when the verified counter reaches each configured countdown milestone, followed by the final one-billion alert.

## What this Railway bug fix changes

Earlier milestone changes required editing `milestones.js` and uploading another code package. Version 1.9.1 adds one Railway variable so future countdown changes can be made directly in Railway without editing JavaScript:

```text
MILESTONE_REMAINING=10000000,5000000,2000000,500000,100000,50000,10000,5000
```

Use plain digits only. Do not put thousands separators inside the numbers.

The final `1,000,000,000` notification is always included automatically and cannot be removed accidentally.

## Default notification schedule

- 10,000,000 remaining
- 5,000,000 remaining
- 2,000,000 remaining
- 500,000 remaining
- 100,000 remaining
- 50,000 remaining
- 10,000 remaining
- 5,000 remaining
- 1,000,000,000 reached

Every milestone requires two verified readings. Email and Teams have separate permanent delivery locks.

## Upgrade the existing Railway service

1. Extract the ZIP.
2. Upload the extracted root-level files to the existing GitHub repository.
3. Commit the changes.
4. Railway automatically deploys the connected branch.
5. Keep the existing `/data` volume attached.
6. Add or update the `MILESTONE_REMAINING` variable in Railway.
7. Review and deploy Railway's staged variable changes.
8. Wait for the deployment to become Active.
9. Open `/healthz` and confirm version `1.9.1`.
10. Open the app and use **Send test email** and **Send test post**.

## Build behavior

Railway performs no `npm ci` or `npm install`. Production dependencies are already packaged in `production-dependencies.tgz` and verified during the Docker build.

## Login

`#1Billion`

See `RAILWAY-BUGFIX-GUIDE.md` or the separate PDF guide for beginner-friendly instructions.
