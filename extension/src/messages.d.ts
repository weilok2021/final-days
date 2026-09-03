// Message shapes between the content script, the background worker and the
// popup. Declared globally (no imports or exports) so the content script,
// which is a classic script with no module imports, can use them too.

/** Content script to background: "here is what I need right now". */
interface HelloMessage {
  type: 'hello';
  /**
   * none: just the strip (page load in a background tab, a timer tick).
   * check: also show today's moment if it has not been shown yet.
   * force: show the moment now regardless (strip click, popup button).
   */
  moment: 'none' | 'check' | 'force';
}

/** Background or popup to content script: run a moment check now. */
interface MomentPromptMessage {
  type: 'momentPrompt';
  force: boolean;
}

/**
 * Content script to background: the page went away while the moment was
 * still up, so nobody saw it. Carries the claim token so that only the
 * claim it belongs to is released.
 */
interface MomentLostMessage {
  type: 'momentLost';
  token: string;
}

type FdMessage = HelloMessage | MomentPromptMessage | MomentLostMessage;

interface StripView {
  fraction: number;
  quiet: boolean;
  tip: string;
}

interface MomentView {
  /** The claim token for the daily moment; "" for a forced show, which is never released. */
  token: string;
  fraction: number;
  number: string;
  line: string;
  question: string;
  footer: string;
}

interface HelloReply {
  /** Null when the strip is off or the date of birth is not set. */
  strip: StripView | null;
  /** Non-null exactly when the content script should show the moment now. */
  moment: MomentView | null;
  /** Local date ("YYYY-MM-DD") for which no further moment checks are needed, or "". */
  momentDoneFor: string;
  /** Epoch milliseconds of the next time the strip may change. */
  nextChangeAt: number;
}
