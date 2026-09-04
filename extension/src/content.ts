// Content script: the 4 px life bar at the top of every page and the daily
// moment overlay. It is a classic script (no imports) and computes nothing
// itself: everything it shows arrives from the background worker in one
// message, so the numbers and wording live in exactly one place (life.ts).
(() => {
  const docRoot = document.documentElement;
  if (!(docRoot instanceof HTMLElement)) return; // XML, SVG and other non-HTML documents

  const Z_INDEX = '2147483647';
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const GRADIENT = 'linear-gradient(90deg, #16a34a 0%, #eab308 50%, #dc2626 100%)';
  const QUIET_GREY = '#6b7280';
  const TIP_DELAY_MS = 350;
  /** A moment on screen this long counts as seen even if the page then goes away. */
  const SEEN_AFTER_MS = 3000;
  /** Identifies this document to the worker; a redirect target is a new document with a new id. */
  const DOC_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  /** Inline !important declarations beat any stylesheet the page has for our host elements. */
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

  // ---- the strip ------------------------------------------------------------

  interface StripEls {
    host: HTMLElement;
    bar: HTMLElement;
    rest: HTMLElement;
    tip: HTMLElement;
  }

  let strip: StripEls | null = null;
  let tipTimer = 0;
  let tipX = 0;

  function mountStrip(): StripEls {
    const host = document.createElement('final-days-strip');
    pin(host, { ...HOST_RESET, top: '0', left: '0', right: '0', height: '4px' });
    host.setAttribute('aria-hidden', 'true');
    const shadow = host.attachShadow({ mode: 'closed' });
    adopt(
      shadow,
      `.bar{position:absolute;top:0;left:0;right:0;bottom:0}
.rest{position:absolute;top:0;bottom:0;right:0;background:#e7e5e4}
.tip{position:fixed;top:10px;left:0;transform:translateX(-50%);background:#1f2430;color:#fff;font:13px/1.2 ${FONT};font-variant-numeric:tabular-nums;padding:6px 10px;border-radius:6px;white-space:nowrap;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.25)}
.tip[hidden]{display:none}`,
    );
    shadow.innerHTML = '<div class="bar"><div class="rest"></div></div><div class="tip" hidden></div>';
    const els: StripEls = {
      host,
      bar: shadow.querySelector<HTMLElement>('.bar')!,
      rest: shadow.querySelector<HTMLElement>('.rest')!,
      tip: shadow.querySelector<HTMLElement>('.tip')!,
    };
    // The label appears after a short hover so that a mouse passing through
    // the bar on its way to the browser's tabs does not flash it.
    host.addEventListener('mouseenter', (e) => {
      tipX = e.clientX;
      window.clearTimeout(tipTimer);
      tipTimer = window.setTimeout(() => {
        els.tip.hidden = false;
        placeTip(els);
      }, TIP_DELAY_MS);
    });
    host.addEventListener('mousemove', (e) => {
      tipX = e.clientX;
      if (!els.tip.hidden) placeTip(els);
    });
    host.addEventListener('mouseleave', () => {
      window.clearTimeout(tipTimer);
      els.tip.hidden = true;
    });
    host.addEventListener('click', () => void refresh('force'));
    docRoot.appendChild(host);
    return els;
  }

  function placeTip(els: StripEls): void {
    const half = els.tip.offsetWidth / 2 + 6;
    const x = Math.min(Math.max(tipX, half), window.innerWidth - half);
    els.tip.style.left = `${x}px`;
  }

  function renderStrip(view: StripView | null): void {
    if (!view) {
      strip?.host.remove();
      strip = null;
      return;
    }
    if (!strip) strip = mountStrip();
    else if (!strip.host.isConnected) docRoot.appendChild(strip.host); // the page rebuilt its DOM
    strip.bar.style.background = view.quiet ? QUIET_GREY : GRADIENT;
    strip.rest.style.width = `${(1 - view.fraction) * 100}%`;
    strip.tip.textContent = view.tip;
  }

  // ---- the moment -----------------------------------------------------------

  let moment: HTMLElement | null = null;
  /** Claim token of the moment on screen, "" when none or when it was a forced show. */
  let momentToken = '';
  let momentShownAt = 0;

  function showMoment(view: MomentView): void {
    hideMoment();
    momentToken = view.token;
    momentShownAt = Date.now();
    const host = document.createElement('final-days-moment');
    pin(host, { ...HOST_RESET, top: '0', left: '0', right: '0', bottom: '0', cursor: 'default' });
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'Final Days');
    host.tabIndex = -1;
    const shadow = host.attachShadow({ mode: 'closed' });
    adopt(
      shadow,
      `.root{all:initial;position:absolute;top:0;left:0;right:0;bottom:0;background:#0b0d12;color:#fff;font-family:${FONT};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:default;user-select:none;-webkit-user-select:none}
.bar{position:absolute;top:0;left:0;right:0;height:3px;background:${GRADIENT}}
.rest{position:absolute;top:0;bottom:0;right:0;background:#27272a}
.big{font-size:16vh;font-weight:600;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:#fff}
.line{margin-top:1.6vh;font-size:max(2vh,13px);color:#a1a1aa}
.q{margin-top:6vh;padding:0 6vw;font-size:max(2.3vh,15px);font-style:italic;color:#e4e4e7}
.foot{position:absolute;bottom:4vh;left:0;right:0;font-size:max(1.2vh,11px);color:#52525b}`,
    );
    shadow.innerHTML =
      '<div class="root"><div class="bar"><div class="rest"></div></div><div class="big"></div><div class="line"></div><div class="q"></div><div class="foot"></div></div>';
    const text = (selector: string, value: string) => {
      shadow.querySelector<HTMLElement>(selector)!.textContent = value;
    };
    shadow.querySelector<HTMLElement>('.rest')!.style.width = `${(1 - view.fraction) * 100}%`;
    text('.big', view.number);
    text('.line', view.line);
    text('.q', view.question);
    text('.foot', view.footer);
    // Any click or key dismisses it, as on Windows.
    host.addEventListener('click', hideMoment);
    host.addEventListener('auxclick', hideMoment);
    host.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      hideMoment();
    });
    window.addEventListener('keydown', onMomentKey, true);
    docRoot.appendChild(host);
    moment = host;
    host.focus({ preventScroll: true });
  }

  function onMomentKey(e: KeyboardEvent): void {
    if (!moment) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hideMoment();
  }

  function hideMoment(): void {
    if (!moment) return;
    moment.remove();
    moment = null;
    momentToken = '';
    window.removeEventListener('keydown', onMomentKey, true);
  }

  /**
   * The page is going away (navigation, redirect, close). If the moment is up
   * and had only just appeared, nobody can have read it: give the day back so
   * the next page shows it. If it had been up for a few seconds, the user saw
   * it and chose to move on, which counts as seen. If a check is still
   * unanswered, tell the worker so its answer cannot claim the day for a page
   * that no longer exists.
   */
  function onPageHide(): void {
    let token: string | null = null;
    if (moment) {
      const seen = Date.now() - momentShownAt >= SEEN_AFTER_MS;
      if (momentToken !== '' && !seen) token = momentToken;
      hideMoment();
    } else if (checksInFlight > 0) {
      token = '';
    }
    if (token === null) return;
    const lost: MomentLostMessage = { type: 'momentLost', doc: DOC_ID, token };
    try {
      void chrome.runtime.sendMessage(lost).catch(() => undefined);
    } catch {
      // the extension is gone; nothing to release
    }
  }

  // ---- talking to the background --------------------------------------------

  /** Local date for which this tab already knows no moment is due; "" means ask. */
  let momentDoneFor = '';
  let changeTimer = 0;
  /** Moment checks sent and not yet answered. */
  let checksInFlight = 0;

  function localToday(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  async function refresh(mode: HelloMessage['moment']): Promise<void> {
    if (mode === 'check' && (momentDoneFor === localToday() || document.visibilityState !== 'visible')) mode = 'none';
    const message: HelloMessage = { type: 'hello', doc: DOC_ID, moment: mode, host: location.hostname };
    let reply: HelloReply | undefined;
    if (mode !== 'none') checksInFlight++;
    try {
      reply = await chrome.runtime.sendMessage<HelloMessage, HelloReply | undefined>(message);
    } catch {
      // The worker was unreachable. If the extension itself was disabled,
      // removed or reloaded, this script is orphaned: take the bar down.
      if (!chrome.runtime?.id) teardown();
      return;
    } finally {
      if (mode !== 'none') checksInFlight--;
    }
    if (!reply) return;
    renderStrip(reply.strip);
    if (reply.moment) showMoment(reply.moment);
    momentDoneFor = reply.momentDoneFor;
    schedule(reply.nextChangeAt);
  }

  /** Re-render when the day count or the quiet-hours state next changes. */
  function schedule(at: number): void {
    window.clearTimeout(changeTimer);
    const delay = Math.min(Math.max(at - Date.now(), 0) + 1000, 0x7fffffff);
    changeTimer = window.setTimeout(() => void refresh('none'), delay);
  }

  function teardown(): void {
    window.clearTimeout(changeTimer);
    renderStrip(null);
    hideMoment();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh('check');
  });
  window.addEventListener('focus', () => void refresh('check'));
  window.addEventListener('pagehide', onPageHide);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      // The day was claimed or released somewhere: ask again on the next return.
      if ('lastMoment' in changes) momentDoneFor = '';
      return;
    }
    if (area !== 'sync') return;
    momentDoneFor = '';
    void refresh('none');
  });
  chrome.runtime.onMessage.addListener((message: FdMessage) => {
    if (message?.type !== 'momentPrompt') return;
    // The worker checked the stored state before asking, so it outranks this tab's memory.
    momentDoneFor = '';
    void refresh(message.force ? 'force' : 'check');
  });

  void refresh(document.visibilityState === 'visible' ? 'check' : 'none');
})();
