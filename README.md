# Poker Settle Tracker

Mobile-first Netlify webpage for tracking poker buy-ins, final stacks, settlements, and all-time stats.

## What it does

- Everyone starts each session with 1 buy-in by default.
- Buy-ins move up/down in ₹1,000 increments, or whatever increment you set before starting.
- Add/remove players per session.
- Confirm buy-ins before ending the game.
- Enter final chip/cash amounts live.
- Automatically checks that final amounts equal total buy-ins.
- Shows each player's net result and who pays who.
- Saves finished sessions to Netlify Blobs.
- Shows all-time stats and past sessions.

## Deploy on Netlify

1. Put these files in a GitHub repo.
2. In Netlify, create a new site from that repo.
3. Build settings:
   - Framework preset: `None` or `Other`
   - Build command: `npm run build`
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
4. Deploy.

## Optional password protection

In Netlify → Site configuration → Environment variables, add:

```txt
APP_PASSWORD=whatever-password-you-want
```

Then open the site, tap the gear, enter the same password, and save settings.

If you do not set `APP_PASSWORD`, anyone with the site URL can load/save sessions.

## Default player names

New sessions start with these players by default:

- Rishabh
- Raj
- Divy
- Karan
- Rowan
- Akshat

You can still use the gear icon in the app to change defaults from your phone/browser, or edit `STARTER_PLAYERS` near the top of `app.js`.

## Local development

```bash
npm install
npx netlify dev
```

Netlify Blobs works best inside Netlify's function environment. For persistent production data, deploy to Netlify.
