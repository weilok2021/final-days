// Message shapes between the content script, the background worker and the
// popup. Declared globally (no imports or exports) so the content script,
// which is a classic script with no module imports, can use them too.

/** Content script to background: "should this page show the countdown now?" */
interface HelloMessage {
  type: 'hello';
  /** Random id of the sending document, so a claim can be tied to the page that asked for it. */
  doc: string;
  /** The page's host name, matched against the countdown's site list. */
  host: string;
  /**
   * check: show today's countdown if it has not been shown yet.
   * force: show the countdown now regardless (popup button).
   */
  countdown: 'check' | 'force';
}

/** Background or popup to content script: run a countdown check now. */
interface CountdownPromptMessage {
  type: 'countdownPrompt';
  force: boolean;
}

/**
 * Content script to background: the page went away while the countdown was
 * still up, so nobody saw it. Carries the claim token so that only the
 * claim it belongs to is released.
 */
interface CountdownLostMessage {
  type: 'countdownLost';
  doc: string;
  /** The claim token, or "" when the page died before its answer arrived. */
  token: string;
}

type FdMessage = HelloMessage | CountdownPromptMessage | CountdownLostMessage;

interface CountdownView {
  /** The claim token for the daily countdown; "" for a forced show, which is never released. */
  token: string;
  fraction: number;
  number: string;
  line: string;
  question: string;
  footer: string;
}

interface HelloReply {
  /** Non-null exactly when the content script should show the countdown now. */
  countdown: CountdownView | null;
  /** Local date ("YYYY-MM-DD") for which no further countdown checks are needed, or "". */
  countdownDoneFor: string;
}
