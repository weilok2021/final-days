# Final Days

**Every day left is one of your final days.**

A typical human life is about 30,000 days. Ask people and most guess hundreds of
thousands. Written down, the real number is small enough to be frightening, and
frightening enough to be useful: whatever you are doing today, is it worth one of
the days you have left?

Final Days keeps that number in front of you on a Windows desktop:

- **The strip.** A 4-pixel bar along the top edge of the screen, filled from the
  left as life passes, green through yellow to red. It reserves its own space, so
  maximised windows start just below it and nothing ever covers it. Hover it for
  the numbers. It never moves, never blinks, never asks for anything.
- **The moment.** Once a day, the first time you come back to the PC, the screen
  goes dark and shows how many days you have left. One click and it is gone.

Lifespan is fixed at 80 years (29,220 days). The only thing you enter is your date
of birth.

## Run it

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

## Config

```toml
birth = "1996-01-01"         # required, YYYY-MM-DD
strip = true                 # the 4 px bar
moment = true                # the once-a-day reminder
quiet_hours = "09:00-12:00"  # strip goes grey in these ranges, comma-separated
```

`Ctrl+Alt+F` toggles the strip for the current session.

## Antivirus notes

The download is an unsigned executable, and some security products flag unknown
Go binaries on sight. If yours does, verify the download against `SHA256SUMS`
from the same release, or build it yourself (below). On a managed work machine,
assume the endpoint agent will block it and ask IT before running it.

## Build it yourself

You need Go 1.25 or later. Any operating system works, the build cross-compiles.

```sh
./build.sh          # Linux, macOS, WSL
.\build.ps1         # Windows PowerShell
```

The result is `dist/final-days.exe` plus its SHA-256. The only dependency is
`golang.org/x/sys`; the icon, manifest and version info are embedded at build
time by `go-winres`.

## How it is built

- `SPEC.md` defines the behaviour: the numbers, colours, wording and triggers.
  Any port follows it, so a macOS or browser version would match this one.
- `windows/` is the Windows implementation in Go, calling Win32 directly with no
  C toolchain. The strip is a registered AppBar; the moment is a plain top-level
  window; the tray icon is drawn at runtime as a miniature of the strip.
- `design/` holds the interactive mockup the design was chosen from, and `notes/`
  the research behind it: reference products, the habituation studies that
  shaped the once-a-day rule, and the life tables.

## Licence

MIT. See `LICENSE`.
