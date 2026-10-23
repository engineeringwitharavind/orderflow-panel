# Build log

How this was built: I (Aravind) directed, and Claude Code wrote the code. This file records
how I steered it, what it got wrong, and how each problem was caught. Commit hashes point
at the change.

## How I directed it

- **Spec before code.** I wrote the brief: stack, data source, the five features, design
  tokens, no layout shift, flash limits, keyboard support, a 6–8 hour time box, and an
  honesty rule (a resume bullet only once the thing is public). The first step was a
  proposal (folder structure, store shape, WebSocket manager interface) that I reviewed
  before any code was written.
- **Decisions I made:**
  - Draggable split ratio: yes.
  - A deliberately naive baseline for honest before/after numbers: yes.
  - Calmer ladder flashes: yes, after seeing the live book.
  - A flash on/off setting: no (README next step).
- **Review gates.** I stopped after Block 2 to learn the domain (order book, aggressor
  side, ticks, DOM ladder) and the data flow before more code was written. I checked
  every block on live Binance data myself, because the agent's sandbox couldn't reach
  Binance.

## What went wrong, and how it was caught

| # | Problem | Caught by | Fix |
|---|---|---|---|
| 1 | Two tabs editing at once could leave the *losing* state in `localStorage`, so a reload showed the wrong symbol until a peer corrected it. | Review of the sync middleware, before the tests were written | A tab also saves remote state when it wins (`c6879be`) |
| 2 | An `as never` cast hid a real typing mistake in the middleware's dispatch. | Typecheck after removing the cast | Typed the dispatch properly (`c6879be`) |
| 3 | A socket stuck in its opening handshake had no timeout and could hang forever. | Review of `ConnectionManager` before testing | The silence watchdog starts at connect time, not on open (`9056659`) |
| 4 | A race when switching symbols: React updates the handler ref before cleaning up the old subscription, so a late message for the old symbol could be filed under the new one. | Reasoning about effect ordering while designing `useStream` | The symbol is taken from the stream key on each message, never from component state (`9056659`) |
| 5 | The ladder body subscribed to the whole book just to keep a ref, which would have re-rendered the body and re-run its map over every row 10 times a second. This is the exact "Redux churn" the project exists to avoid. | Review of the ladder draft | Read the book on demand from the store; never subscribe to it (`d115a0e`) |
| 6 | Flash colours were passed as `var()` inside Web Animations keyframes (not reliable in every browser); the alternative, `getComputedStyle` per flash, forces style recalculation. | Design review before testing | Animate only the opacity of an overlay whose colour comes from CSS (`d115a0e`) |
| 7 | Two focus rings showed at once (grid and active row). | Screenshot review | One indicator: the grid's ring only while no row is active (`d115a0e`) |
| 8 | **Ladder flashes were exhausting on a live book.** Every size change filled a whole cell, dozens of times every 100 ms. | **Me, watching live data** ("seeing it continuously causes a headache") | Flash only changes of at least 25% of the largest visible size, as a 3 px edge marker with a 1 s cooldown per cell. Measured: 1,000 → 21 flashes in 10 s (`7092204`) |
| 9 | The first flash benchmark used a mock that re-randomised every level on every update, which is far harsher than a real book, and it showed only a 10× improvement. | Questioning the first number before quoting it | Rebuilt the mock to behave like a real book (sizes persist, ~1% big changes) and quoted that result instead (`7092204`) |
| 10 | The tape's "back to live" button floated over the list and hid the top row's price. | Screenshot review | Moved into the panel header (`182cdda`) |
| 11 | Moving it into the header caused a **0.2 px layout shift** (17 px button in a 16.8 px text line). | Playwright measuring the list's position before and after pausing | Fixed the cause, not the symptom: panel headers have a fixed height (`182cdda`) |
| 12 | The capture script required Node 22 while `package.json` allows Node 20. | **Me, running it** | Fall back to the `ws` package (`9ac4f47`) |
| 13 | Profiling hypothesis: dropped frames under 4× CPU throttling were blamed on forced reflow spreading across the page. CSS containment was added to test it. | Measuring with and without containment: no difference | Reverted rather than keeping CSS that doesn't help. A Chrome trace then showed the real cost: re-laying-out the tape's rows each frame (see README, "Known limits") |

| 14 | **The first results table flattered the frozen versions.** At 10×, the naive build showed only "3 frames over 33 ms". That was because it rendered only about 5 frames in 30 s; each took around 10 s. | Asking why a page that was blocked 20 of 30 s had "few slow frames" | The table now leads with frames rendered per second and main-thread blocking (`1633c97`) |
| 15 | **A false comment hid a real cost.** The market reducer "returned a new state instead of mutating, so there's nothing for Immer to diff". But `createSlice` still passes an Immer draft, and `concat` on the 5,000-trade array went through the proxy: a child draft per trade, then a full walk to finalise. It made "batching off" as frozen as the naive baseline, and it was the largest per-frame cost in main too. | The batching-off numbers didn't fit what that configuration should cost; a CPU profile then put `frameFlushed` and Immer internals at the top | A plain reducer for the market slice; the other slices keep Immer. Two tests pin purity (`1633c97`). This also corrected an earlier conclusion that the tape's layout was the main per-frame cost (#13), which had come from a synthetic capture. |

Several test failures turned out to be mistakes in the tests, not the code: a handshake
message still in flight, the watchdog's check interval, Map ordering, and one ask grouped
into the wrong row. Each was diagnosed before anything was changed, and only the test was
fixed.

## What the AI could not do

- **Reach Binance.** Its sandbox's network policy blocked the exchange. Every block was
  tested there with Playwright standing in for the WebSocket, then checked on live data by
  me, and the 60 s capture used for the numbers was recorded on my machine.
