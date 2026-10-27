# Wease

## What this is
Wease is a free, ad-free web music player for phones. The user picks audio files they already downloaded
to their device, and the page plays them. No accounts, no server, no uploads: files never leave
the device.

## Current state
- Project name: **Wease** (use this name in the UI, title, PWA manifest and app icon label).
- 2026-10-25: tried a rename to "Kassandra" with a Spartan/300 theme; the user rolled it back to Wease and
  the green style (they have a new idea). Don't reintroduce it unless asked.
- Files (no build step): `index.html` (markup), `style.css`, `app.js`, `manifest.json`,
  `sw.js` (service worker, network-first for app files, cache-first for fonts + tag lib;
  bump `VERSION` (and `APP_V` in app.js, shown as "Wease vNN · Check for update" at the bottom of the Playback
  sheet) on every deploy so phones pick up the update; the app re-checks for an update each time it
  comes to the front and reloads once the new version takes over, only while paused), `icons/` (svg, 192, 512, maskable 512, apple-touch 180).
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
- Edit details (song ⋯ menu): change title, artist and picture. Pictures are centre-cropped to a square,
  max 512px, saved as a JPEG data URL in the track's `cover` (same field the ID3 cover uses), stored in IndexedDB.
- Smooth playback while scrolling (user reported stutter): AudioContext uses `latencyHint:'playback'`;
  covers are capped at 512px and each track has a 128px `thumb` used in the list (old tracks get one
  in idle time, only while paused); list rows use `content-visibility:auto`; animations use transform only.
  Keep it that way: avoid animating layout properties or putting full-size images in the list.
- Tap responsiveness (iPhone, 2026-10-25): `touch-action:manipulation` on html, a passive touchstart listener so
  :active works, scale-on-press feedback, play/pause icon updates before `audio.play()` resolves (`setPlayingUI(true)`),
  `load()` starts the sound first and defers the rest a frame, and the waveform waits ~1.5 s after a song change
  (`calm()`) before decoding. All text inputs are 16px (iOS zooms below that) and the viewport has maximum-scale=1.
- iPhone background/lock stutter (user reported): `navigator.audioSession.type='playback'` (Safari 16.4+),
  `<audio preload="auto">`, and a few delayed `ac.resume()` retries with backoff (no tight resume loop) when iOS suspends the
  AudioContext. Not verifiable on desktop; needs testing on a real iPhone.
- Stuck-playback watchdog (2026-10-26, user reported "button shows playing but no sound, timer frozen"): every 1 s,
  if the audio is not paused but `currentTime` hasn't moved for 2.5 s: 1) `ac.resume()`, 2) `reloadCurrent()` from
  IndexedDB at the last good position, 3) pause and show Play so one tap restarts it. `resumeSoon()` retries with
  backoff (0.25/1/2/4 s). Next-song waveform prefetch only runs while paused (decoding is heavy on iPhone).
  Reproduced in Chrome by making `ac.resume()` reject after `ac.suspend()`.
- Crossfade (2026-10-27, user asked for Apple Music AutoMix-style "no gap between songs"; no beat-matching):
  two `<audio>` elements (`players`); `audio` is a `let` pointing at the one playing the current song, static
  listeners use `onAudio()` which ignores events from the other one. Each player has its own gain (`elGain`) before
  the EQ chain. `maybeMix()` (from timeupdate) starts the next song on the spare player at the cue from `mixPlan()`, then
  swaps. 2026-10-27 (user request): the current song is NEVER faded early; it plays at full volume until its sound ends
  (then 0.4 s fade over the silence) so last words aren't cut; the next song fades in (`FADE_IN`, sin² curve) from the
  cue = latest of: end − `prefs.xfade` (On/Off switch in the Playback sheet; On = fixed 6 s `XFADE`, user asked for no seconds choice), the last loud waveform moment (outro start),
  the last synced-lyrics line + typical line length (empty last line = singing stops); capped at end − 1.5 s.
  Silence is skipped using the waveform peaks (`loudEdges`: up to 15 s at the end, 10 s at the start; next song's
  peaks read from IndexedDB by `peekWave`, no decode). Any tap (pause, next, prev, pick song) calls `endMix()`.
  No mix with repeat-one, sleep "End of song", or short songs. The spare player is "unlocked" with a moment of
  silence on the first tap (`unlockSpare`) so iPhone lets it start by itself. Crossfade on = Web Audio graph always
  built. If the next song fails to start within 5 s, the current one just ends normally (`mixSkip`).
- Flow-aware shuffle (2026-10-27): with shuffle + crossfade on, `arrangeNext()` moves the best-flowing song to be
  next (`flowDist`: this song's outro level vs. candidate's intro level ×2, mean, dynamics, tempo with half/double
  allowed); picks randomly only among songs within 0.25 of the best. Tempo: `estBpm()` runs while decoding the
  waveform (90 s middle, onset autocorrelation, 70–180 BPM, 0 = unsure), stored as `bpm` in the `waves` record /
  `waveBpm`. All saved waves are loaded at startup; `analyzeLibrary()` decodes missing ones one at a time, only
  while paused. Vocals are NOT detected from audio (a centre-channel vocal heuristic was rejected before): synced
  lyrics are the vocal cue.
- Background: the playing song's picture (thumb or cover), shrunk to 40px and blurred (, two
  layers cross-fade, overlay of --bg for readability). No picture = plain background. (A mood-analysis /
  mood-theme feature was tried on 2026-10-25 and removed at the user's request; don't bring it back unasked.)
- IMPORTANT (iPhone bug, fixed 2026-10-25): never re-`put` a `tracks` record after import. Safari can break
  an audio Blob that is read from IndexedDB and saved again (song stopped mid-play and never played again).
  `tracks` records (with the Blob) are written once at import; all later changes (title, artist, cover, thumb)
  go to the `edits` store (DB version 3) via `saveEdits()` and are merged on startup. If playback errors,
  the app re-reads the Blob from IndexedDB once and resumes (`recovering`).
- Waveform scrubber (replaces the old range slider `#pos`): `#wave` with two canvases (grey base + accent
  "played" layer revealed by clip-path). Peaks: 200 RMS slices per song, decoded at 8 kHz on the device the
  first time a song plays (`computePeaks`, files > 60 MB skipped → flat bars), cached in memory + IndexedDB
  store `waves` (DB version 4; `{id, p: Uint8Array|null}`), next song pre-computed in idle time. Tap to jump,
  drag to scrub with a time bubble (seeks on release), arrow keys ±5 s, role="slider" with aria-valuetext.
- (2026-10-25: tried colouring vocal parts of the waveform with a centre-channel heuristic; the user found
  it not accurate enough and asked to remove it. Don't bring it back unasked.)
- Lyrics (local only, never fetched online — hard requirements 1–2): sources are built-in tags (jsmediatags
  `tags.lyrics` / USLT, read at import), a `.lrc` with the same base file name picked with the songs (or picked
  alone later → attached to matching existing songs), or the Lyrics box in Edit details (paste or import
  .lrc/.txt). Stored as `t.lyrics` (string) via `edits`. `parseLyrics()` handles LRC ([mm:ss.xx], multiple
  stamps, [offset:]); ≥3 timed lines = synced. Lyrics view (`#lyrics`) replaces tabs+list while open; current
  line highlighted + auto-scrolled (paused 4 s after user scroll), tap a line to seek. Search also matches lyrics.
- (2026-10-25: a Wishlist with online song search (iTunes, Deezer, MusicBrainz) was added, then removed at the
  user's request: they download songs on their computer and put them in Google Drive, then pick them from the
  phone's file picker. Don't bring back online search unasked; the app makes no calls beyond fonts + tag library.)
- Add (+): on iPhone it opens the system picker directly (that menu already lists Files, Google Drive, etc.).
  A separate "Google Drive" button was tried on 2026-10-25 and removed: the user found it a duplicate step. The
  Add sheet only appears when there's a real extra choice (From library in a playlist, Choose folder off iOS).
  The `#files` input has NO `accept` filter on purpose: `audio/*` made phones open a music-only picker without
  Google Drive. Non-audio files are filtered out in JS (`isAudio`, `.lrc`).
- Library backup (2026-10-27, user wanted "log in anywhere and my songs come back" without Google sign-in): "Export library"
  / "Import library" in the All songs ⋯ menu. One `.wease` file: "WEASE1" + uint32 LE header length + JSON header
  (tracks with details/cover/thumb/lyrics/waveform/bpm + byte offset/size, playlists, eqProfiles, songEq) + audio Blobs
  back to back. Export uses the share sheet (Save to Files / Drive) or falls back to a download. Import (also when a
  .wease is picked with +) merges: same name+size skipped, playlists merged by id or name, each song's bytes copied
  into a new Blob and written to `tracks` once.
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
- Possible next: album/artist grouping.

## Working rules for Claude
- Keep it dependency-light; no frameworks unless the user asks.
- Test on a narrow viewport and in both light and dark mode after UI changes.
- Explain changes to the user in simple language.
