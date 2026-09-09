# Final Days

I got the idea for Final Days after reading Andrew Ng's short ebook, *How to
Build a Career in AI*. In one passage, he asks how many days are in a typical
human lifespan. Most people guess in the hundreds of thousands. When he
calculated his own life expectancy, the result was 27,649 days. He printed that
number and put it on his office wall because seeing it made the limited time
harder to ignore.

The number shocked me. A human life is only around 30,000 days—not the hundreds
of thousands many of us imagine. I thought about how many of my days I had
already spent without thinking about where they went, and how easily I was
still wasting them on things that did not matter. That was difficult to admit.

I wanted a reminder that would make this harder to ignore. Not a notification
that interrupts me all day, but something that appears once in a while and
makes me stop and think about what I am doing with the days I have left.

So I made Final Days. It is a Chrome and Edge extension. You enter your date of
birth, and it uses an 80-year lifespan: 29,220 days. Once a day, the first time
you come back to your browser, it shows the number of days you have left.

## What it does

- The page goes dark and shows the days left, with your life drawn as a bar
  beneath the number. Click anywhere to continue.
- You can instead choose a list of sites—such as YouTube or social sites—and
  show the countdown each time one of them opens.
- The toolbar icon shows a small version of the bar. Its popup shows the
  numbers, lets you show the countdown immediately, and opens the options.

The extension runs only inside the browser. It does not appear over other
programs, on browser pages such as Settings or New Tab, or on PDFs.

## Install

The extension is not in the Chrome or Edge store yet, so it is loaded from a
folder:

1. Download `final-days-extension.zip` from the
   [latest release](https://github.com/weilok2021/final-days/releases/latest)
   and unzip it.
2. Keep the unzipped folder somewhere permanent. It should contain
   `manifest.json`.
3. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
4. Turn on **Developer mode**.
5. Click **Load unpacked** and choose the unzipped folder.
6. Enter your date of birth on the options page and save it.

You can pin Final Days from the browser's extensions menu if you want to see
its icon. To update it later, replace the files in the same folder and click
the reload button on its extensions card.

## Privacy

There is no account, server, or network connection. Your date of birth and
settings stay in the browser's extension storage. If browser sync is enabled,
they can follow your browser profile to another computer.

The extension needs access to pages so it can put the countdown over the page
you are viewing. It does not read page content or change the page. It also uses
idle detection to notice when you return after a break or unlock your computer.

## For developers

The extension is in `extension/`. It is TypeScript and Manifest V3. `SPEC.md`
describes the behaviour, and `design/` and `notes/` contain the design work and
decision notes.

Node 22.18 or later is required (the release build uses Node 24):

```sh
cd extension
npm ci
npm run build
npm test
npm run check
npm run e2e
```

The build writes the unpacked extension to `extension/dist`. The end-to-end
tests use Playwright; install its Chromium browser once with
`npx playwright install chromium`.

GitHub Actions builds the extension and attaches `final-days-extension.zip`
and its SHA-256 checksum to releases. A native Windows version is being worked
on separately in the `feature/windows-v1` branch.

## Questions or problems

[Open an issue](https://github.com/weilok2021/final-days/issues).

## Licence

MIT. See `LICENSE`.
