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

type FdMessage = HelloMessage | MomentPromptMessage;

interface StripView {
  fraction: number;
  quiet: boolean;
  tip: string;
}

interface MomentView {
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
