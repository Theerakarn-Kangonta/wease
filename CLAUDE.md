# Wease

## What this is
Wease is a free, ad-free web music player for phones. The user picks audio files they already downloaded
to their device, and the page plays them. No accounts, no server, no uploads: files never leave
the device.

## Current state
- Project name: **Wease** (use this name in the UI, title, PWA manifest and app icon label).
- Files (no build step): `index.html` (markup), `style.css`, `app.js`, `manifest.json`,
  `sw.js` (service worker, network-first for app files, cache-first for fonts + tag lib;
  bump `VERSION` when the file list changes), `icons/` (svg, 192, 512, maskable 512, apple-touch 180).
- UI language: English (switched from Thai on 2026-10-25 at the user's request). Keep all user-facing text in English. Fonts still cover Thai so Thai song titles display well.
- Features: add multiple files (MP3, M4A, AAC, WAV, OGG, FLAC, OPUS), read ID3 tags
  (title, artist, cover) via jsmediatags 3.9.5 from cdnjs, fallback to filename
  ("Artist - Title" is split), play/pause, prev/next, seek, shuffle, repeat (off/all/one),
  search, delete one / delete all (with in-page confirm), Media Session (lock-screen controls).
- Also: playlists (create, rename, delete, add/remove songs, drag to reorder via the ≡ handle,
  plus move up/down in the ⋯ menu), sort (oldest/newest added, title, artist, custom for playlists),
  sleep timer (minutes or "end of this song", 10 s fade-out), playback speed, volume (hidden on iOS
  where the browser ignores it), folder import (`webkitdirectory`, not shown on iOS), duplicate
  skip (same name + size), PWA install banner (Android prompt / iOS how-to hint).
- Equalizer: 5 bands (60, 230, 910, 3.6k, 14k Hz, ±12 dB) + presets, via Web Audio
  (MediaElementSource → pre-gain headroom → biquad filters → output gain). The graph is built lazily on a
  user tap only when needed (EQ on, or volume < 100% on iOS where `audio.volume` is ignored) and then
  volume goes through the output gain. Prefs `eqOn`, `eq`, `eqPreset`. Watch for iOS background/lock-screen
  playback issues when the graph is active.
- EQ profiles: users can save custom profiles (`prefs.eqProfiles` [{id,name,gains}]) and pick one per song
  (`prefs.songEq` {trackId: profileKey}, key = preset name or saved profile id), via "Use for this song" in the
  EQ sheet or "Sound" in the song ⋯ menu. A song's profile overrides the default EQ while it plays
  (`activeEq()`); deleting a profile or song cleans up these links.
- UI uses one bottom-sheet `<dialog id="sheet">` for all menus and confirms (no `prompt()`/`confirm()`).
- Layout (user preference): minimal, one full-height screen, the page never scrolls. Top bar (icons only),
  playlist tabs + ⋯ menu (sort, list actions), song list scrolls inside `#listwrap`, player pinned at the
  bottom (sleep/speed/volume behind the tune icon). No explanatory text in the UI; status goes in toasts.
- Persistence: IndexedDB db `local-music` (version 2): store `tracks` (incl. the audio Blob),
  store `playlists` ({id, name, ids, created}). Prefs (shuffle, repeat, sorts, speed, volume,
  current view, last played) in localStorage key `lm-prefs`. All storage calls are
  wrapped in try/catch and the app must still work without storage.
- Theming: color tokens on `:root`, dark mode via `prefers-color-scheme` and `data-theme`.
  Fonts: Mitr (display) + IBM Plex Sans Thai (body) from Google Fonts.

## Hard requirements (do not break)
1. Free and ad-free. No analytics, trackers, ads, or third-party calls beyond fonts and the tag library.
2. Local only. Never upload or send audio files or metadata anywhere.
3. Mobile first: must work well at ~380px width, large tap targets, no horizontal scroll.
4. Works by opening `index.html` directly or from any static host. No backend.

## How to run
- Quick: open `index.html` in a browser.
- Phone on same Wi-Fi: `python3 -m http.server 8000` in this folder, then open
  `http://<computer-ip>:8000` on the phone.
- To install on the phone as an app and get better background playback, host it over HTTPS
  (e.g. GitHub Pages, Netlify, Cloudflare Pages) and add a PWA manifest + service worker.

## Ideas / backlog (ask the user before starting big ones)
- (Done 2026-10-25: PWA, playlists, sorting, sleep timer/speed/volume, folder import, file split.)
- (Done: minimal one-screen redesign, English UI, cover thumbnails, equalizer.)
- Possible next: album/artist grouping, export/import library or playlists as a file.

## Working rules for Claude
- Keep it dependency-light; no frameworks unless the user asks.
- Test on a narrow viewport and in both light and dark mode after UI changes.
- Explain changes to the user in simple language.
