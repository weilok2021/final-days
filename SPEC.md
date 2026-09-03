# Final Days: behaviour specification

This document defines what Final Days does. Every port (Windows, macOS, browser
extension) follows it, so the numbers, colours and wording match wherever it runs.
The Windows implementation lives in `windows/`.

## 1. The number

- The only input is the user's **date of birth**.
- Lifespan is a constant: **80 years = 29,220 days** (80 × 365.25, rounded). It is
  not a setting. Ports may expose it as a compile-time constant only.
- `lived` = whole calendar days from the date of birth to today (local date), never
  negative.
- `left` = `29,220 − lived`, floored at 0.
- `fraction` = `lived / 29,220`, capped at 1.
- All three are recomputed at local midnight and whenever the process starts.

Numbers shown to the user use thousands separators ("18,271").

## 2. The strip (always on)

A horizontal bar across the full width of the **primary** display, along the **top**
edge, **4 px tall** at 100 % scaling (scale with DPI).

- It **reserves** its space: maximised windows start below it, the strip is never
  covered and never covers anything. On Windows this is an AppBar. When a
  full-screen application is in front, the strip drops behind it and returns when
  the application closes.
- Fill runs **left to right for life passed**. The fill reveals a gradient anchored
  to the full bar: `#16a34a` (green) at 0 %, `#eab308` (yellow) at 50 %,
  `#dc2626` (red) at 100 %. The unlived remainder is `#e7e5e4` (grey).
- **Quiet hours**: during configured ranges the lived part is painted `#6b7280`
  instead of the gradient. Nothing else changes.
- No text, no icon, no animation. Hovering shows a one-line label:
  `Day 11,201 of 29,220 · 18,019 days left`.
- The strip can be toggled at runtime (tray menu, hotkey Ctrl+Alt+F). Off means
  removed entirely, space returned to the desktop.

## 3. The moment (once a day)

A full-screen, black (`#0b0d12`) window on the primary display, shown at most
**once per calendar day**, the first time the user comes back to the machine:

1. on process start, if not yet shown today;
2. on session unlock, if not yet shown today;
3. on return from ≥ 5 minutes of no input, if not yet shown today.

Content, centred:

- a 3 px strip at the very top (same gradient, remainder `#27272a`);
- the **days left** number, very large (about 16 % of screen height), white;
- one line under it, grey `#a1a1aa`: `days left · day 11,201 of 29,220`;
- the question, italic, `#e4e4e7`: **Is today worth one of your remaining 18,271 days?**
- a footer in `#52525b`: `click anywhere to continue`.

Any click or key dismisses it. It is never shown twice in a day, and never on a
timer during the day. Wording centres on the remaining count; the "1/N" fraction is
not used anywhere.

## 4. Tray and controls

- A tray icon drawn as a miniature of the strip. Tooltip: `Final Days · 18,271 days left`.
- Menu: days left (title), Show today's moment, Strip on/off, Start with Windows,
  Open config file, Quit.
- Hotkey Ctrl+Alt+F toggles the strip.

## 5. Portability rules

- One executable. No installer.
- Configuration lives in `final-days.toml` **next to the executable**; runtime state
  (the date the moment was last shown) in `final-days.state` next to it.
- No registry writes. "Start with Windows" is opt-in and creates a single shortcut in
  the user's Startup folder; turning it off deletes that shortcut.
- First run with no config: create the file, open it, and ask for the date of birth.
- One instance at a time.

## 6. Config file (flat TOML)

```toml
# Final Days
birth = "1996-01-01"         # required, YYYY-MM-DD
strip = true                 # show the 4 px strip
moment = true                # show the once-a-day moment
quiet_hours = "09:00-12:00"  # comma-separated HH:MM-HH:MM ranges, strip goes grey
```

Only flat `key = value` pairs, strings in double quotes, booleans bare, `#` comments.
