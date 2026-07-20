# Railway deployment - v1.9.1 milestone bug fix

## Existing service settings

- Builder: root-level `Dockerfile`
- Build Command: leave blank
- Start Command: leave blank
- Health check: `/healthz`
- Persistent volume mount: `/data`

## Required milestone variable

Add this in the service's **Variables** tab:

```text
MILESTONE_REMAINING=10000000,5000000,2000000,500000,100000,50000,10000,5000
```

Railway stages variable changes. Review and deploy those changes to apply them.

## Safe upgrade

Keep the existing `/data` volume. The app preserves recipients, settings, and successful email/Teams delivery locks. A milestone already sent will not be resent merely because the app is redeployed.

A newly added milestone that the live counter has already passed becomes eligible after two verified readings. Check the current counter before adding a past threshold.

## Verify

After deployment becomes Active:

1. Open `https://YOUR-RAILWAY-DOMAIN/healthz`.
2. Confirm `version` is `1.9.1`.
3. Confirm `countdownRemaining` shows the desired values.
4. Open the app and log in.
5. Send one test email and one test Teams post.
