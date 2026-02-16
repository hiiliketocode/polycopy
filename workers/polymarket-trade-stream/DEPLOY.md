# Deploy the Trade Stream Worker to Fly.io

Follow these steps in order. You'll need a terminal (Terminal.app on Mac, or the terminal in Cursor).

---

## Step 1: Install flyctl

Open Terminal and run:

```bash
brew install flyctl
```

If you don't have Homebrew: [install it first](https://brew.sh), or get flyctl from [fly.io/docs](https://fly.io/docs/hands-on/installing-flyctl/).

---

## Step 2: Log in to Fly.io

```bash
flyctl auth login
```

A browser window will open. Sign in with your Fly.io account (or create one at fly.io). When it says "Success", you can close the browser and return to the terminal.

---

## Step 3: Go to the worker folder

```bash
cd ~/PolyCopy/workers/polymarket-trade-stream
```

(Adjust the path if your project is somewhere else.)

---

## Step 4: Create the app (first time only)

If you've never deployed this worker before:

```bash
flyctl launch --name polycopy-trade-stream --no-deploy
```

- When it asks "Would you like to copy its configuration from an existing app?", say **No**
- When it asks about a database, say **No**
- It will create the app but not deploy yet.

If the app already exists, skip this step.

---

## Step 5: Set your secrets

Replace the values with your real ones, then run:

```bash
flyctl secrets set \
  API_BASE_URL=https://polycopy.app \
  CRON_SECRET=your-cron-secret-from-vercel \
  -a polycopy-trade-stream
```

- `API_BASE_URL`: Your PolyCopy app URL (e.g. `https://polycopy.app` or `https://polycopy-two.vercel.app`)
- `CRON_SECRET`: Same value as in your Vercel project (Settings → Environment Variables → CRON_SECRET)

---

## Step 6: Deploy

```bash
flyctl deploy -a polycopy-trade-stream
```

This builds the worker and deploys it. It may take 1–2 minutes.

---

## Step 7: Check it's running

```bash
flyctl status -a polycopy-trade-stream
flyctl logs -a polycopy-trade-stream
```

You should see logs like `[worker] Connected to Polymarket WebSocket` and `[worker] Loaded N target traders`.

---

## Troubleshooting

**"app not found"**  
Run Step 4 first to create the app.

**"No access token"**  
Run `flyctl auth login` again.

**Worker keeps restarting**  
Check logs: `flyctl logs -a polycopy-trade-stream`. Ensure `API_BASE_URL` and `CRON_SECRET` are correct and match your Vercel app.
