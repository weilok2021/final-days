// Content script: the daily countdown overlay. It is a classic script (no
// imports) and computes nothing itself: everything it shows arrives from the
// background worker in one message, so the numbers and wording live in
// exactly one place (life.ts). Between countdowns it draws nothing; the life
// bar is part of the countdown, under the number.
(() => {
  const docRoot = document.documentElement;
  if (!(docRoot instanceof HTMLElement)) return; // XML, SVG and other non-HTML documents

  const Z_INDEX = '2147483647';
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const GRADIENT = 'linear-gradient(90deg, #16a34a 0%, #eab308 50%, #dc2626 100%)';
  /** A countdown on screen this long counts as seen even if the page then goes away. */
  const SEEN_AFTER_MS = 3000;
  /** Identifies this document to the worker; a redirect target is a new document with a new id. */
  const DOC_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  /** Inline !important declarations beat any stylesheet the page has for our host element. */
  function pin(el: HTMLElement, props: Record<string, string>): void {
    for (const [name, value] of Object.entries(props)) el.style.setProperty(name, value, 'important');
  }

  /** Styles for a shadow root as a constructed sheet: CSSOM is never subject to a page's Content Security Policy. */
  function adopt(shadow: ShadowRoot, css: string): void {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];
  }

  const HOST_RESET: Record<string, string> = {
    position: 'fixed',
    display: 'block',
    margin: '0',
    padding: '0',
    border: '0',
    outline: '0',
    'box-sizing': 'border-box',
    'z-index': Z_INDEX,
    'pointer-events': 'auto',
    transform: 'none',
    opacity: '1',
    visibility: 'visible',
    'font-size': '16px',
  };

  // ---- the countdown --------------------------------------------------------

  let countdown: HTMLElement | null = null;
  /** Claim token of the countdown on screen, "" when none or when it was a forced show. */
  let countdownToken = '';
  let countdownShownAt = 0;

  function showCountdown(view: CountdownView): void {
    hideCountdown();
    countdownToken = view.token;
    countdownShownAt = Date.now();
    const host = document.createElement('final-days-countdown');
    pin(host, { ...HOST_RESET, top: '0', left: '0', right: '0', bottom: '0', cursor: 'default' });
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'Final Days');
    host.tabIndex = -1;
    const shadow = host.attachShadow({ mode: 'closed' });
    adopt(
      shadow,
      `.root{all:initial;position:absolute;top:0;left:0;right:0;bottom:0;background:#0b0d12;color:#fff;font-family:${FONT};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:default;user-select:none;-webkit-user-select:none}
.bar{position:relative;width:60vw;height:6px;margin-top:3.2vh;background:${GRADIENT};overflow:hidden}
.rest{position:absolute;top:0;bottom:0;right:0;background:#27272a}
.big{font-size:16vh;font-weight:600;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:#fff}
.line{margin-top:1.6vh;font-size:max(2vh,13px);color:#a1a1aa}
.q{margin-top:6vh;padding:0 6vw;font-size:max(2.3vh,15px);font-style:italic;color:#e4e4e7}
.foot{position:absolute;bottom:4vh;left:0;right:0;font-size:max(1.2vh,11px);color:#52525b}`,
    );
    shadow.innerHTML =
      '<div class="root"><div class="big"></div><div class="bar"><div class="rest"></div></div><div class="line"></div><div class="q"></div><div class="foot"></div></div>';
    const text = (selector: string, value: string) => {
      shadow.querySelector<HTMLElement>(selector)!.textContent = value;
    };
    shadow.querySelector<HTMLElement>('.rest')!.style.width = `${(1 - view.fraction) * 100}%`;
    text('.big', view.number);
    text('.line', view.line);
    text('.q', view.question);
    text('.foot', view.footer);
    // Any click or key dismisses it, as on Windows.
    host.addEventListener('click', hideCountdown);
    host.addEventListener('auxclick', hideCountdown);
    host.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      hideCountdown();
    });
    window.addEventListener('keydown', onCountdownKey, true);
    docRoot.appendChild(host);
    countdown = host;
    host.focus({ preventScroll: true });
  }

  function onCountdownKey(e: KeyboardEvent): void {
    if (!countdown) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hideCountdown();
  }

  function hideCountdown(): void {
    if (!countdown) return;
    countdown.remove();
    countdown = null;
    countdownToken = '';
    window.removeEventListener('keydown', onCountdownKey, true);
  }

  /**
   * The page is going away (navigation, redirect, close). If the countdown is
   * up and had only just appeared, nobody can have read it: give the day back
   * so the next page shows it. If it had been up for a few seconds, the user
   * saw it and chose to move on, which counts as seen. If a check is still
   * unanswered, tell the worker so its answer cannot claim the day for a page
   * that no longer exists.
   */
  function onPageHide(): void {
    let token: string | null = null;
    if (countdown) {
      const seen = Date.now() - countdownShownAt >= SEEN_AFTER_MS;
      if (countdownToken !== '' && !seen) token = countdownToken;
      hideCountdown();
    } else if (checksInFlight > 0) {
      token = '';
    }
    if (token === null) return;
    const lost: CountdownLostMessage = { type: 'countdownLost', doc: DOC_ID, token };
    try {
      void chrome.runtime.sendMessage(lost).catch(() => undefined);
    } catch {
      // the extension is gone; nothing to release
    }
  }

  // ---- talking to the background --------------------------------------------

  /** Local date for which this tab already knows no countdown is due; "" means ask. */
  let countdownDoneFor = '';
  /** Countdown checks sent and not yet answered. */
  let checksInFlight = 0;

  function localToday(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  async function refresh(mode: HelloMessage['countdown']): Promise<void> {
    if (mode === 'check' && (countdownDoneFor === localToday() || document.visibilityState !== 'visible')) return;
    const message: HelloMessage = { type: 'hello', doc: DOC_ID, countdown: mode, host: location.hostname };
    let reply: HelloReply | undefined;
    checksInFlight++;
    try {
      reply = await chrome.runtime.sendMessage<HelloMessage, HelloReply | undefined>(message);
    } catch {
      // The worker was unreachable. If the extension itself was disabled,
      // removed or reloaded, this script is orphaned: take the countdown down.
      if (!chrome.runtime?.id) hideCountdown();
      return;
    } finally {
      checksInFlight--;
    }
    if (!reply) return;
    if (reply.countdown) showCountdown(reply.countdown);
    countdownDoneFor = reply.countdownDoneFor;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh('check');
  });
  window.addEventListener('focus', () => void refresh('check'));
  window.addEventListener('pagehide', onPageHide);
  chrome.storage.onChanged.addListener((changes, area) => {
    // The day was claimed or released somewhere, or a setting changed: ask again on the next return.
    if (area === 'sync' || (area === 'local' && 'lastCountdown' in changes)) countdownDoneFor = '';
  });
  chrome.runtime.onMessage.addListener((message: FdMessage) => {
    if (message?.type !== 'countdownPrompt') return;
    // The worker checked the stored state before asking, so it outranks this tab's memory.
    countdownDoneFor = '';
    void refresh(message.force ? 'force' : 'check');
  });

  if (document.visibilityState === 'visible') void refresh('check');
})();
