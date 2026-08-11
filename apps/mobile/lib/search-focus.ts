// One-shot "jump to Work and focus the search field" signal (Slice 6).
//
// A route param would be WRONG here: expo-router keeps tab params sticky, so
// `/(tabs)/work?focus=search` re-fires the autofocus on every later visit to the
// tab. This is a module-level latch instead — the header sets it immediately
// before navigating, and Work consumes it exactly once on focus.

let pending = false;

/** Called by the header magnifier just before navigating to the Work tab. */
export function requestSearchFocus(): void {
	pending = true;
}

/** Returns true at most once per request. Consuming always clears the latch. */
export function consumeSearchFocus(): boolean {
	if (!pending) return false;
	pending = false;
	return true;
}
