# Railway Milestone Bug Fix - Step-by-Step Guide for Beginners

## What this fixes

This update lets you change the countdown notification points from Railway's **Variables** screen. After this one-time upgrade, you do not need to edit `milestones.js` for ordinary milestone changes.

## Part A - Install the bug fix once

### Step 1: Download and extract the ZIP

Download `TCG-1-Billion-Monitor-v1.9.1-RAILWAY-MILESTONE-BUGFIX-FLAT.zip` and extract it. You should see `index.html`, `server.js`, `Dockerfile`, `milestones.js`, and the other files directly in the extracted location.

### Step 2: Open the GitHub repository connected to Railway

Sign in to GitHub and open the repository your Railway service already deploys from.

### Step 3: Upload the replacement files

Use **Add file -> Upload files**. Drag every extracted file into the upload area. The files must stay at the repository root. Do not upload the ZIP itself and do not create another containing folder.

### Step 4: Commit

Use the commit message:

`Install Railway milestone bug fix v1.9.1`

Commit to the branch Railway is connected to, normally `main`.

### Step 5: Watch Railway deploy

Open Railway, select the project, select the service, and open **Deployments**. A new deployment should start after the GitHub commit. Wait until it says **Active**.

### Step 6: Do not remove the data volume

Keep the volume mounted at `/data`. It stores the recipient list and the one-time delivery locks.

## Part B - Add the milestone schedule in Railway

### Step 1: Open Variables

In Railway, open the app service and select **Variables**.

### Step 2: Add the variable

Create this variable exactly:

Name:

`MILESTONE_REMAINING`

Value:

`10000000,5000000,2000000,500000,100000,50000,10000,5000`

Use plain digits. Do not type commas inside a number. The commas shown above separate one milestone from the next.

### Step 3: Deploy the staged change

Railway stages variable changes. Review the staged changes and press the button to deploy/apply them.

### Step 4: Wait for Active

Open **Deployments** and wait for the newest deployment to say **Active**.

## Part C - Check that the fix worked

### Step 1: Check the health page

Open your Railway app URL and add `/healthz` to the end, for example:

`https://your-app.up.railway.app/healthz`

Look for:

- `"version":"1.9.1"`
- `"milestoneCount":9`
- `"countdownRemaining":[10000000,5000000,2000000,500000,100000,50000,10000,5000]`

### Step 2: Check the app

Open the normal app URL, log in with `#1Billion`, and confirm the milestone panel shows all countdown points.

### Step 3: Test delivery

Press **Send test email**, then press **Send test post**. Confirm both arrive.

## Part D - Change milestones yourself later

Only edit the Railway variable. Example:

`MILESTONE_REMAINING=20000000,10000000,5000000,1000000,100000,10000`

Then deploy Railway's staged variable changes and confirm `/healthz` shows the new list.

The final one-billion alert is always added automatically.

## Important warning

Before adding a new milestone, compare it with the live counter. If the counter has already crossed that threshold, the new email and Teams post can become eligible after two verified readings.

For example, if the counter is already 995,500,000 and you add `5000000`, the app sees the 5-million-remaining threshold as already reached.

## If something goes wrong

1. Open Railway **Deployments** and view the newest logs.
2. Confirm the service still has the `/data` volume.
3. Confirm `MILESTONE_REMAINING` contains plain digits only.
4. Confirm `/healthz` reports version `1.9.1`.
5. If necessary, use Railway's previous deployment action to redeploy or roll back, then correct the variable.
