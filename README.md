# Final Days

**Every day left is one of your final days.**

A typical human life is about 30,000 days. Ask people and most guess hundreds of
thousands. Written down, the real number is small enough to be frightening, and
frightening enough to be useful: whatever you are doing today, is it worth one of
the days you have left?

Final Days keeps that number in front of you:

- **The strip.** A 4-pixel bar along the top edge of the screen, filled from the
  left as life passes, green through yellow to red. Hover it for the numbers. It
  never moves, never blinks, never asks for anything.
- **The moment.** Once a day, the first time you come back, the screen goes dark
  and shows how many days you have left. One click and it is gone.

Lifespan is fixed at 80 years (29,220 days). The only thing you enter is your date
of birth.

It comes in two forms that follow one behaviour spec: a **Windows app** and a
**browser extension** for Chrome and Edge.

## Windows app

The strip reserves its own space along the top of the primary display, so
maximised windows start just below it and nothing ever covers it. The moment
takes the whole screen at the first unlock of the day.

### Run it

1. Download `final-days.exe` from the latest
   [release](https://github.com/weilok2021/final-days/releases) and put it in a
   folder of your choice. There is no installer.
2. Run it. It creates `final-days.toml` next to itself and opens it. Set
   `birth = "YYYY-MM-DD"`, save, click OK.
3. It lives in the tray. Right-click the icon for the menu.

To start it with Windows, use **Start with Windows** in the tray menu. That
creates one shortcut in your Startup folder and nothing else; turning it off
removes the shortcut.

Everything Final Days writes stays next to the executable: `final-days.toml`
(your settings), `final-days.state` (the date the moment was last shown) and
`final-days.log`. No registry, no other folders.

### Config

```toml
birth = "1996-01-01"         # required, YYYY-MM-DD
strip = true                 # the 4 px bar
moment = true                # the once-a-day reminder
quiet_hours = "09:00-12:00"  # strip goes grey in these ranges, comma-separated
```

`Ctrl+Alt+F` toggles the strip for the current session.

### Antivirus notes

The download is an unsigned executable, and some security products flag unknown
Go binaries on sight. If yours does, verify the download against `SHA256SUMS`
from the same release, or build it yourself (below). On a managed work machine,
assume the endpoint agent will block it and ask IT before running it; the
browser extension below exists for exactly that case.

### Build it yourself

You need Go 1.25 or later. Any operating system works, the build cross-compiles.

```sh
./build.sh          # Linux, macOS, WSL
.\build.ps1         # Windows PowerShell
```

The result is `dist/final-days.exe` plus its SHA-256. The only dependency is
`golang.org/x/sys`; the icon, manifest and version info are embedded at build
time by `go-winres`.

## Browser extension (Chrome and Edge)

Nothing runs outside the browser, so it works on machines where you cannot run
your own programs. The numbers, colours, wording and the once-a-day rule are
the same as on Windows; three things are necessarily different:

- The strip is drawn over the top 4 px of every web page. A web page cannot
  reserve screen space, so a page's own top edge sits under it.
- The moment covers the current tab, not the whole screen. "The first time you
  come back" is the first page you look at each day, or the first time the
  browser sees you return after a lock or five idle minutes. On a work
  machine you can list the sites it may appear on (YouTube, the social
  sites), and it then shows up the first time each day you open one of them
  and nowhere else, so it stays off work pages and shared screens.
- Neither can appear on the browser's own pages (settings, new tab, the
  extension store) or on PDFs, because extensions are kept out of those.

It asks for two permissions: access to all sites, which it needs to draw the
bar (it reads nothing from pages and never touches the network), and idle
detection, to notice when you come back. Your date of birth is kept in the
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

Pin the icon from the toolbar's extensions menu: it shows the bar in
miniature, and its popup has the numbers, **Show today's moment** and the bar
switch. `Alt+Shift+F` also toggles the bar (changeable at
`chrome://extensions/shortcuts`). Quiet hours and the moment's site list are
on the options page.

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
- `windows/` is the Windows implementation in Go, calling Win32 directly with no
  C toolchain. The strip is a registered AppBar; the moment is a plain top-level
  window; the tray icon is drawn at runtime as a miniature of the strip.
- `extension/` is the browser implementation in TypeScript (Manifest V3). A
  content script draws the strip and the moment on each page; a background
  worker owns the settings, the numbers and the once-a-day rule; the options
  page and popup are plain HTML.
- `design/` holds the interactive mockup the design was chosen from, and `notes/`
  the research behind it: reference products, the habituation studies that
  shaped the once-a-day rule, and the life tables.

## Licence

MIT. See `LICENSE`.
