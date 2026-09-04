# Final Days

**Every day left is one of your final days.**

A typical human life is about 30,000 days. Ask people and most guess hundreds of
thousands. Written down, the real number is small enough to be frightening, and
frightening enough to be useful: whatever you are doing today, is it worth one of
the days you have left?

Final Days keeps that number in front of you:

- **The strip** (Windows). A 4-pixel bar along the top edge of the screen,
  filled from the left as life passes, green through yellow to red. Hover it
  for the numbers. It never moves, never blinks, never asks for anything.
- **The countdown.** Once a day, the first time you come back, the screen goes dark
  and shows how many days you have left. One click and it is gone.

Lifespan is fixed at 80 years (29,220 days). The only thing you enter is your date
of birth.

It is a **browser extension** for Chrome and Edge. A **Windows app** that
follows the same behaviour spec is on its way (see below).

## Windows app (pending)

A native Windows app in Go, with the strip as a reserved bar along the top of
the screen and the countdown at the first unlock of the day, is on the
`feature/windows-v1` branch and not merged yet. Its download, config file and
antivirus notes arrive with it.

## Browser extension (Chrome and Edge)

Nothing runs outside the browser, so it works on machines where you cannot run
your own programs. The numbers, colours, wording and the once-a-day rule are
the same as on Windows; three things are different:

- There is no strip. Over a web page a bar at the edge stops registering
  within days, and a page cannot reserve screen space for it, so the
  extension draws nothing between countdowns; the bar is part of the
  countdown instead.
- The countdown covers the current tab, not the whole screen. "The first time you
  come back" is the first page you look at each day, or the first time the
  browser sees you return after a lock or five idle minutes. Or switch it to
  a list of sites (YouTube, the social sites): it then shows up every time you
  open one of them and nowhere else, so it stays off work pages and shared
  screens.
- It cannot appear on the browser's own pages (settings, new tab, the
  extension store) or on PDFs, because extensions are kept out of those.

It asks for two permissions: access to all sites, which it needs to show the
countdown on the page you are looking at (it reads nothing from pages and
never touches the network), and idle detection, to notice when you come back. Your date of birth is kept in the
browser's extension storage and follows your profile if browser sync is on.

### Install it

The extension is not on a store yet, so it loads "unpacked" from a folder:

1. Get the folder: download `final-days-extension.zip` from the latest
   [release](https://github.com/weilok2021/final-days/releases) and unzip it,
   or build it yourself (below).
2. **Chrome:** open `chrome://extensions`, turn on **Developer mode** (top
   right), click **Load unpacked** and choose the folder.
   **Edge:** open `edge://extensions`, turn on **Developer mode** (left column),
   click **Load unpacked** and choose the folder.
3. The options page opens. Enter your date of birth and save.

Pin the icon from the toolbar's extensions menu: it shows your life as a
miniature bar, and its popup has the numbers, **Show the countdown** and a
link to the options, where the countdown's mode is set.

### Build it yourself

You need Node 22.18 or later (24 is what it is built with).

```sh
cd extension
npm ci
npm run build       # writes extension/dist, the folder to load
npm test            # unit tests for the shared logic
npm run check       # type check
npm run e2e         # drives the built extension in a headless Chromium
```

The build needs only the TypeScript compiler; there is no bundler. The
end-to-end suite uses Playwright: run `npx playwright install chromium` once
(on Linux add its system libraries with `npx playwright install-deps chromium`,
or just `libnss3`, `libnspr4` and `libasound2`). It answers every website
request itself with a small fake page, so it never touches the network.

## How it is built

- `SPEC.md` defines the behaviour: the numbers, colours, wording and triggers,
  plus what each port does where its platform cannot follow them exactly. Any
  port follows it, so a macOS version would match these two.
- `windows/`, on the `feature/windows-v1` branch, is the Windows implementation
  in Go, calling Win32 directly with no C toolchain. The strip is a registered
  AppBar; the countdown is a plain top-level window; the tray icon is drawn at
  runtime as a miniature of the strip.
- `extension/` is the browser implementation in TypeScript (Manifest V3). A
  content script shows the countdown on the page; a background
  worker owns the settings, the numbers and the once-a-day rule; the options
  page and popup are plain HTML.
- `design/` holds the interactive mockups the design was chosen from, and
  `notes/` the decision log of each feature. The research behind the design
  (reference products, the habituation studies that shaped the once-a-day rule,
  the life tables) is with the Windows branch for now.

## Licence

MIT. See `LICENSE`.
