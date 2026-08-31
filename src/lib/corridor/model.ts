/* One model id for every server-side caller.
 *
 * The agent loop and the watch runner both talk to Claude. Holding the id in
 * one place is what stops them drifting onto different versions, and makes a
 * version change a one-line edit rather than a search. */
export const MODEL = "claude-sonnet-4-5-20250929";
