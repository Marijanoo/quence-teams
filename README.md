# Quence Teams

A Teams-style workspace for Quence accounts: teams and channels, direct and group chats, threaded replies, mentions,
reactions, file sharing, search, a calendar with meetings you can drag around, and voice and video calls with screen
sharing. This repository is the **client**: the desktop app (Electron), the web version and the Android app.

Sign-in uses your Quence account. The apps connect to the Quence Teams service at `teams.kolaj.fun`. The server is
not part of this repository.

```
app/      Electron + React + TypeScript client (Vite), Capacitor Android project in app/android
```

## Run the desktop app

You need Node 20+.

```bash
cd app
npm install
npm start          # builds the UI and opens the Electron window
```

Handy variants:

```bash
npm run electron:dev      # Electron pointed at a running `npm run dev` (Vite) for hot reload
npm run dist:win          # Windows installer (NSIS)  -> app/release/
npm run dist:mac          # macOS dmg + zip (Apple silicon and Intel)
npm run dist:linux        # Linux AppImage
```

## The app

- **Profile menu** (top right): status, status message, saved items, appearance, settings and sign out. Click your
  picture to change it.
- **Settings:** account and profile picture, notifications and sounds, chat, calendar, calls and devices (microphone,
  camera, speaker), privacy, accessibility and keyboard shortcuts.
- **Appearance** (bottom left): accent color, background and text, in a panel docked on the right.
- **Calendar:** drag a meeting to move it, drag its bottom edge to resize it, drag over empty space to create one and
  right-click for the menu (new, open, join, edit, cancel, accept or decline).
- **Messages:** hover a message for quick reactions and more actions. Reactions sit on the message, and one to three
  emoji on their own are shown big.
- **Zoom:** `Ctrl` + `+` / `Ctrl` + `-` / `Ctrl` + `0`.
- One **Chat** navigation: quick views (Mentions, Drafts, Saved), Favorites, Chats, and Teams with their channels.
- In chats, **Reply** quotes the message; in channels it opens a thread.

## Releases and auto-update

Installers are built by GitHub Actions (`.github/workflows/build.yml`) when a `v*` tag is pushed, and attached to the
GitHub release together with the `latest*.yml` update feeds. The installed app checks this repo's latest release on
start and every 4 hours, downloads new versions in the background and shows **Update ready, restart** in the title bar.
The same workflow builds a signed Android APK for the release.

To ship a new version: bump `version` in `app/package.json`, commit, then `git tag vX.Y.Z && git push --tags`.

The builds are unsigned: Windows SmartScreen may warn on first run (More info, Run anyway), and on macOS the first
launch needs right-click, Open.
