# demo-media

**Branch:** feature/demo-media
**Worktree:** .worktrees/feature-demo-media
**Started:** 2026-09-09
**Issue:** none (small, self-contained)

## What this is

Demo media of the countdown for the README and for showing people: a short
video, an animated GIF, a 1280x800 screenshot (the Chrome Web Store size), and
a script that regenerates all of them after a UI change.

## What was done

- `extension/scripts/demo.ts`, run with `npm run demo` (after `npm run build`).
  It drives the built extension in Playwright's headless Chromium like the e2e
  harness does, answers every https request with a fake article page ("The
  Ledger"), sets the date of birth (2000-01-01, override with `FD_DEMO_BIRTH`),
  claims the day on a warm-up page, then records one take: article for 2 s,
  "come back to the tab" (focus event), countdown for 4 s, click, article for
  2 s. About 10 s in total. The screenshot is taken in the middle of the hold.
- Output in `design/demo/`: `demo.webm` (Playwright's raw recording),
  `demo.mp4` (H.264, silent), `demo-music.mp4` (same video with a music bed),
  `demo.gif` (800 px wide, 12 fps, about 550 KB) and `countdown-1280x800.png`.
- The README shows the GIF above "What it does" and links the screenshot and
  the video with music. The developer section mentions `npm run demo`.
- `design/demo/music/contemplation.mp3`: a 15 s clip of "Contemplation" by
  Joth, CC0 from OpenGameArt. `design/demo/music/README.md` records the source.

## Decisions

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
  fades in over 1.5 s and out over the last 2 s, at 80 % volume.
- **GIF settings.** 12 fps at 800 px wide with no dithering was the smallest of
  six variants tried (1.4 MB on the first take); the second take came out at
  550 KB. Bayer dithering and 960 px pushed it over 2 MB.

## Loose ends

- The user may want a different birth date in the demo (the number shown is
  19,472 for 2000-01-01 on 2026-09-09). `FD_DEMO_BIRTH=YYYY-MM-DD npm run demo`.
- Nobody has listened to the music clip against the video; the track was
  chosen from a CC0 "calm / relaxing" collection by title and licence.
- If the user wants an inline video player in the README, they upload
  `demo-music.mp4` (or `demo.mp4`) through the GitHub web editor and paste the
  returned URL; see Decisions.
- The fake article uses whatever fonts the machine has; on this WSL that is
  DejaVu. Recording on Windows would show Segoe UI.
