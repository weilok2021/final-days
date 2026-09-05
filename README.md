# Final Days

**Every day left is one of your final days.**

A typical human life is about 30,000 days. Ask people and most guess hundreds of
thousands. Written down, the real number is small enough to be frightening, and
frightening enough to be useful: whatever you are doing today, is it worth one of
the days you have left?

Final Days is a small add-on for the Chrome and Edge browsers that keeps that
number in front of you. You enter one thing, your date of birth. Lifespan is
fixed at 80 years, which is 29,220 days.

## What it does

- **The countdown.** Once a day, the first time you come back to your browser,
  the page you are looking at goes dark and shows how many days you have left,
  with your life drawn as a bar under the number. One click and it is gone.
  It never comes back until tomorrow.
- **Or only on chosen sites.** In the options you can switch it to a list of
  sites, for example YouTube or the social sites. It then shows up every time
  you open one of them and nowhere else, so it stays off work pages and shared
  screens.
- **The toolbar icon.** The icon shows your life as a tiny bar. Click it to see
  the numbers, show the countdown right now, or open the options.

It works only inside the browser. It does not appear over other programs or on
the desktop, and it cannot appear on the browser's own pages (settings, the new
tab page, the extension store) or on PDFs, because browsers keep add-ons out of
those.

## Install it

You need Chrome or Edge on a computer. It takes about two minutes.

1. **Download the add-on.** Go to the
   [latest release](https://github.com/weilok2021/final-days/releases/latest)
   and download `final-days-extension.zip`. Unzip it. You get a folder with a
   file called `manifest.json` inside.
2. **Put the folder somewhere permanent**, for example in your Documents
   folder. The browser reads from this folder every time it starts, so do not
   delete it and try not to move it later (moving it means entering your date
   of birth again).
3. **Open the extensions page.** In Chrome, type `chrome://extensions` in the
   address bar and press Enter. In Edge, type `edge://extensions`.
4. **Turn on Developer mode.** In Chrome it is a switch at the top right of the
   page. In Edge it is a switch in the left column.
5. **Click "Load unpacked"** and choose the folder from step 1.
6. **Enter your date of birth.** The options page opens by itself. Type your
   date of birth and click Save. That is it.

Optional: pin the icon so you can see it. Click the puzzle-piece button on the
right of the address bar and click the pin next to Final Days.

**Why "Developer mode"?** Browsers install add-ons with one click only from
their own store. Final Days is not in a store yet, so the browser loads it from
a folder instead, and it calls that Developer mode. It is the same add-on either
way, and nothing else about your browser changes. If Final Days goes into the
store later, this step goes away.

## Update it

When a new version comes out:

1. Download the new `final-days-extension.zip` from the
   [latest release](https://github.com/weilok2021/final-days/releases/latest).
2. Unzip it into the same folder as before, replacing the old files.
3. On the extensions page, find the Final Days card and click its reload
   button (the circular arrow).

Because the folder is the same, your date of birth and settings stay.

## Remove it

On the extensions page, click Remove on the Final Days card. Then delete the
folder. Nothing else is left behind.

## Privacy

Nothing leaves your browser. There is no account, no sign-in and no server.

- Your date of birth is kept in the browser's own storage for add-ons. If you
  sign in to your browser and have sync on, it follows your profile to your
  other computers, the same way your bookmarks do.
- The add-on asks for two permissions when it installs. **Access to all
  sites**: it needs this to draw the countdown over whatever page you are
  looking at. It reads nothing from the page and changes nothing on it. **Idle
  detection**: this is how it notices that you came back after a break or after
  unlocking your computer.
- It never connects to the internet.

## Questions or problems

Open an issue on the
[issues page](https://github.com/weilok2021/final-days/issues) and describe
what you saw.

## For developers

The add-on lives in `extension/`, written in TypeScript for Manifest V3. A
content script shows the countdown on the page, a background worker owns the
settings, the numbers and the once-a-day rule, and the options page and popup
are plain HTML. `SPEC.md` defines the behaviour every version follows.
`design/` holds the mockups the design was chosen from and `notes/` the
decision log of each feature.

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

Releases are built by GitHub Actions: pushing a tag such as `v0.1.0` runs the
checks, zips `extension/dist` and attaches it to a release together with a
SHA-256 checksum file.

A native Windows app that follows the same specification is on the
`feature/windows-v1` branch and is not finished yet.

## Licence

MIT. See `LICENSE`.
