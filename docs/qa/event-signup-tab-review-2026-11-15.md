# Event detail: filled Sign Up tab — review note (2026-11-15)

**Tier:** cosmetic (+ one display condition). No reviewer agent, per tiered verification.

**Why:** a tester opened an event, stayed on the default Map tab, and didn't realise their home hadn't signed up.
On the list the Sign Up button is filled in the event's colour; on the detail page "Sign Up" was grey tab text.

**Change:** while the home isn't in, sign-ups are open and (venue events) places are left, the Sign Up tab is filled
with the event's accent (same rule as the list card's button, `events.js`). Once in, it's a plain "My Sign-Up" tab.
Still a normal WAI-ARIA tab for keyboard / screen readers.

**Checks:**
- `events.spec.js` signup test: filled on Map, filled while selected (same colour), plain after "Villa 12 is in";
  update test: never filled when already in. Confirmed the new assertion FAILS without the events.js change.
- Local: events + organizer-acts + event-day specs, mobile project: 106 passed. Full suite (both browsers) in CI.
- Screenshots looked at: detail page EN + AR (filled tab on the correct side in right-to-left).

**Known nit (accepted):** the filled label sits ~5 px lower than Map / List (the filled box centres its text).
