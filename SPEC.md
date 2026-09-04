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

## 3. The countdown (once a day)

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
- Menu: days left (title), Show the countdown, Strip on/off, Start with Windows,
  Open config file, Quit.
- Hotkey Ctrl+Alt+F toggles the strip.

## 5. Portability rules

- One executable. No installer.
- Configuration lives in `final-days.toml` **next to the executable**; runtime state
  (the date the countdown was last shown) in `final-days.state` next to it.
- No registry writes. "Start with Windows" is opt-in and creates a single shortcut in
  the user's Startup folder; turning it off deletes that shortcut.
- First run with no config: create the file, open it, and ask for the date of birth.
- One instance at a time.

## 6. Config file (flat TOML)

```toml
# Final Days
birth = "1996-01-01"         # required, YYYY-MM-DD
strip = true                 # show the 4 px strip
countdown = true             # show the once-a-day countdown
quiet_hours = "09:00-12:00"  # comma-separated HH:MM-HH:MM ranges, strip goes grey
```

Only flat `key = value` pairs, strings in double quotes, booleans bare, `#` comments.
The keys `countdown` and `last_countdown` were `moment` and `last_moment`
until 2026-09-04; the old names are still read when the new ones are absent.

## 7. Browser extension port

`extension/` implements the same behaviour inside Chrome and Edge (Manifest
V3). Where a browser cannot do what Windows does, the port does the nearest
thing, and this section is the record of those differences.

- **Strip.** A content script draws it over the top 4 CSS px of every web page
  (a page cannot reserve screen space) at the highest stacking level. It cannot
  appear on the browser's own pages, the extension store or PDFs. Colours,
  quiet hours, the hover label and click-to-show-the-countdown follow section 2.
  The keyboard toggle is `Alt+Shift+F`, because browsers reserve `Ctrl+Alt`
  combinations. Off means the element is removed from every page.
- **Countdown.** Covers the current tab, not the whole screen; content and
  dismissal follow section 3. "The first time the user comes back" is
  whichever of these happens first on a day when it has not been shown:
  1. a page loads in a visible tab;
  2. a tab becomes visible or the browser window regains focus;
  3. the browser's idle API reports a return to `active` after a lock or after
     at least 5 minutes without input (the page in front is asked to show it).
  The day is claimed the instant one tab wins, so several tabs loading at once
  show it exactly once. Pages without the content script (browser pages) fall
  through to the next page that has it. If the page goes away (a redirect, a
  navigation) within 3 seconds of the countdown appearing, nobody can have read
  it: the day is released and the next page shows it. After 3 seconds on
  screen it counts as seen, whether dismissed or left behind.
- **Two modes for the countdown**, chosen on the options page. *Once a day* is
  section 3 as described above, and the default. *Every time you open one of
  these sites* takes a list of host names (subdomains included): the countdown
  then appears each time a listed site loads, once per page load, and never
  anywhere else, so it stays off work pages and shared screens. In that mode
  there is no daily claim, no release and no idle trigger; a page loads, the
  countdown shows. A forced show from the popup or the strip works on any page
  in either mode.
- **Settings.** The four values of section 6 plus the site list, entered on
  an options page instead of a file, kept in the browser's synced extension
  storage. The last-shown date lives in local extension storage.
- **Toolbar.** The icon is the miniature strip of section 4, redrawn with the
  real fraction; its tooltip is `Final Days · 18,271 days left`. Its popup
  holds the days left, the day count, **Show the countdown**, the strip
  switch and a link to the options.
- **Not ported.** Start-with-Windows (the browser starts the extension), the
  config file, and hiding behind full-screen applications (a full-screen video
  already covers the page, so the strip and the countdown are not seen over it).
