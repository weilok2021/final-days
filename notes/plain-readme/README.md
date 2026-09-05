# plain-readme

**Branch:** feature/plain-readme, worktree `.worktrees/feature-plain-readme`, off origin/main at 70f8244.
**Started:** 2026-09-05
**Issue:** none (GitHub PR only)

## What this is
The README rewritten in plain English so that someone who has never installed a browser add-on can follow it. It goes with the first free release of the extension: tag v0.1.0 was pushed on 2026-09-05 on the same commit, which makes GitHub Actions build the zip and attach it to a GitHub Release, so the README's "download from the latest release" link points at a real file for the first time.

## Decisions (2026-09-05)
- Deployment route: the user chose the free route first (GitHub Release zip, still loaded unpacked) and will decide later whether to pay the one-time US$5 Chrome Web Store developer fee. The store research (fee, review, privacy policy requirement even for local-only data, Unlisted visibility, Edge Add-ons free with up to seven business days of certification) is in the session and in the learning workspace at `~/workspace/learn-extension-deployment/`, not in the repo.
- The tag sits on the code commit, not on this README change: the zip contains only `extension/dist`, so the README is documentation and does not need to be in the tagged tree.
- The README keeps a short "For developers" section at the end with the build commands and the release mechanism, and a one-line pointer to the pending Windows branch, so nothing from the old README is lost. Everything above that section is written for a non-technical reader: numbered install steps for Chrome and Edge, why Developer mode is needed, how to update without losing settings (same folder, reload), how to remove, and what the two permissions are for.
- Commit messages stay plain, no AI attribution, per the global rules.

## Loose ends
- The release job's result was being watched when this note was written; see the PR description or the releases page for the outcome.
- If the extension goes to the Chrome Web Store later, the Install section shrinks to one link and the Developer mode paragraph goes. The store needs a privacy policy at a public URL, per-permission justifications, a single-purpose statement and a 1280x800 screenshot; none of that exists yet.
- No PR could be opened from the session because `gh` is not logged in; the branch was pushed and the compare link handed over.
