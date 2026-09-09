# demo-media

**Branch:** feature/demo-media
**Worktree:** .worktrees/feature-demo-media
**Started:** 2026-09-09
**Issue:** none (small, self-contained)

## What this is

Demo media of the extension for the README and for showing people: a short
video, an animated GIF, a 1280x800 screenshot (the Chrome Web Store size), and
a script that regenerates all of them after a UI change.

## What was done

- `extension/scripts/demo.ts`, run with `npm run demo` (after `npm run build`).
  It drives the built extension in Playwright's headless Chromium like the e2e
  harness does and answers every https request with a fake page: a photo feed
  for instagram.com, a video grid for youtube.com, a plain article elsewhere.
- The video has three beats, each recorded in its own tab, about 18 s in all:
  1. the options page: the date of birth is typed in (2000-01-01, override
     with `FD_DEMO_BIRTH`), "every time you open one of these sites" is
     chosen, `instagram.com, youtube.com` is typed, Save, "Saved.";
  2. instagram.com opens, the countdown takes over for 3 s, a click brings the
     feed back;
  3. youtube.com, the same again.
- Playwright records the page only, so a browser frame (tab strip, address bar
  with the site's address, the Final Days toolbar icon) is drawn over each clip
  with ffmpeg and the clips are joined. That is how the viewer sees which site
  is open.
- Output in `design/demo/`: `demo.mp4` (H.264, silent), `demo-music.mp4`
  (same video with a music bed), `demo.gif` (800 px wide, 12 fps, about 1 MB)
  and `countdown-1280x800.png` (the countdown alone, at the store size).
- The README shows the GIF above "What it does" and links the screenshot and
  the video with music. The developer section mentions `npm run demo`.
- `design/demo/music/happy-song.mp3`: a 30 s clip of "Happy Song" by Pro
  Sensory, CC0 from OpenGameArt. `design/demo/music/README.md` records the
  source. It replaced "Contemplation" by Joth (slow piano): the user asked for
  a brighter bed for LinkedIn and portfolio use, listened to five CC0 clips
  (Contemplation, Montage by wipics, Happy Song, Classical Pop by Pro Sensory,
  The Days Roll On by Chance de la Soul) and chose Happy Song.

## Decisions

- **The demo uses the sites mode, not the daily mode.** The user asked for a
  demo that configures the options and then clicks through sites. In the daily
  mode only the first site would show the countdown. The options beat still
  shows both modes on screen, so a viewer sees the daily option exists.
- **The sites are named only in the address bar.** The fake pages have the
  shape of a photo feed and a video grid but no logos or wordmarks. The tab
  title and the address bar say Instagram and YouTube, which is what the user
  would see in a real browser and needs no copying of anyone's branding.
- **One tab per beat, one browser frame per clip.** The first version recorded
  everything in one tab and switched the frame at times taken from the clock.
  Playwright's recordings do not keep wall-clock time (a 15.5 s take came out
  as an 18.8 s video, with the drift at the end of the recording), so the
  switch could land on the wrong page. Per-clip frames need no timing at all.
  Each clip also runs about 1.5 s past its last action before the tab closes,
  so the scripted holds are short to compensate.
- **ffmpeg comes from the `ffmpeg-static` dev dependency.** Playwright's own
  ffmpeg (`~/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux`) is a minimal build:
  VP8 and PNG only, no GIF, no H.264, no audio codecs. This WSL has no system
  ffmpeg and `sudo` needs a password, so a full static build as a dev
  dependency (77 MB, downloaded by `npm ci`) makes `npm run demo` work after a
  plain install. The script also accepts `FD_FFMPEG` or an `ffmpeg` on PATH.
- **The GIF is the README demo, not the video.** GitHub renders a GIF from the
  repository inline. A committed .mp4 does not play inline in a README; the
  only way to get an inline player is to upload the file through GitHub's web
  editor (drag it into the README editor or an issue comment), which stores it
  under `github.com/user-attachments/assets/...`, and paste that URL on its own
  line. That upload is a manual browser step and was left to the user. Sources:
  GitHub docs "Attaching files" (mp4, mov, webm; 10 MB limit on the free plan),
  bobbyhadz.com (2024) and GitHub community discussion #173635.
- **Music is a separate file.** The GIF cannot carry sound and the silent mp4
  is the one to upload to GitHub if the user prefers no music. The music bed
  fades in over 1.5 s and out over the last 2 s, at 80 % volume. The fade time
  is read from the finished video, not from the clock, for the reason above.
- **GIF settings.** 12 fps at 800 px wide with no dithering was the smallest of
  six variants tried; Bayer dithering and 960 px cost about 50 % more.

## Loose ends

- The user may want their own birth date in the demo. The number shown is
  19,472 for 2000-01-01 on 2026-09-09. `FD_DEMO_BIRTH=YYYY-MM-DD npm run demo`.
- The user chose the music from 30 s clips, not against the finished video.
- If the user wants an inline video player in the README, they upload
  `demo-music.mp4` (or `demo.mp4`) through the GitHub web editor and paste the
  returned URL; see Decisions.
- The pages use whatever fonts the machine has; on this WSL that is DejaVu.
  Recording on Windows would show Segoe UI.
- The date is typed as month, day, year because the recording runs with the
  en-US locale. Another locale would need a different key order in `keysFor`.
