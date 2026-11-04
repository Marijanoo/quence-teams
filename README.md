# Quence Teams

A Teams-style workspace for Quence accounts: teams and channels, direct and group chats, threaded
replies, mentions, reactions, file sharing, search, a calendar with scheduled meetings, and voice/video
calls with screen sharing. Desktop app built with Electron; the backend is a small Node server.

No Microsoft account or Microsoft API is involved. Sign-in goes through the existing **Quence auth
service** (`/auth/login`, `/auth/register`); the Teams server only keeps a profile row per user.

```
quence-teams/
  app/      Electron + React + TypeScript client (Vite)
  server/   Node/Express + WebSocket server, SQLite storage
```

## Run the desktop app (on your PC)

You need Node 20+.

```bash
cd app
npm install
npm start          # builds the UI and opens the Electron window
```

On the sign-in screen, type the **Server** address of a running Teams server
(for example `https://teams.example.com`), then sign in or create a Quence account.
The address is remembered.

Handy variants:

```bash
npm run electron:dev      # Electron pointed at a running `npm run dev` (Vite) for hot reload
npm run dist:win          # Windows installer + portable exe  -> app/release/
npm run dist:mac          # macOS dmg
npm run dist:linux        # Linux AppImage
```

## Run the server

```bash
cd server
cp .env.example .env      # set JWT_SECRET to the Quence API's JWT_SECRET
npm install
npm start
npm test                  # end-to-end tests (uses a fake Quence API, no real accounts)
```

The server listens on `127.0.0.1:4380` by default. To reach it from another machine, put a reverse
proxy with TLS in front of it and forward both HTTP and WebSocket traffic (`/api` and `/ws`).
Set `WEB_DIR=../app/dist` and the same server also serves the web version of the client.

Example nginx location block:

```nginx
location / {
    proxy_pass http://127.0.0.1:4380;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    client_max_body_size 30m;
}
```

## How it works

- **Auth:** the server forwards login/register to the Quence API and accepts the Quence JWT it returns
  (verified with the shared `JWT_SECRET`). Only a profile (name, email, status) is stored here.
- **Realtime:** one WebSocket per client carries new messages, edits, reactions, typing, presence and
  call signalling. Unread counts and mentions are tracked per conversation.
- **Calls:** WebRTC in a full mesh (each person connects to every other person), with the server only
  relaying offers/answers/ICE over the WebSocket. Good for small groups (up to about six). Public STUN
  servers are used; there is no TURN relay, so a few strict corporate networks may not connect.
- **Data:** SQLite (`server/data/teams.db`) plus uploaded files on disk (25 MB per file).
- **Permissions:** private channels and chats are only visible to their members, files are checked
  against conversation membership on every download, and team owners manage members and channels.

## Desktop app notes

- Frameless window with the same custom title bar and window buttons as the other Quence apps.
- **Zoom:** `Ctrl` + `+` / `Ctrl` + `-` / `Ctrl` + `0` (also `Ctrl` + mouse wheel). The level is remembered.
- One **Chat** navigation like the newer Teams: quick views (Mentions, Drafts, Saved), Favorites, Chats, and Teams with their channels. Star any chat or channel to favorite it; drafts are kept across restarts.
- In chats, **Reply** quotes the message (like Teams); in channels it opens a thread.
- The **Calls** tab on the left shows call history (incoming, outgoing, missed) with call back.

## Not included

Compared with the real Microsoft Teams: no external/guest access, no meeting recordings or live
captions, no mobile app, no end-to-end encryption, and calls are not routed through a media server.
