# LET ME EAT THE EGGS

**Live: https://let-me-eat-the-eggs.pages.dev**

A WebMCP demo where the **site**, not the model, owns the guardrail.

> Deadline changes the route. Not the authority.
> Evidence never becomes optional.

## The problem

One tray of 30 eggs was ordered. Two trays arrived. Grocery delivery platforms carry contradictory policies: *misdelivered items must be returned*, and *fresh food cannot be returned*. Humans paper over this with heuristics and agent discretion. An agent has no such heuristics, so it either (a) reinterprets the contradiction on its own, or (b) stalls and does nothing.

This project demonstrates a third route: **the agent recognizes it has no authority to interpret the contradiction, and works to reach whoever does.** As the deadline closes in, it does not expand its own authority — it shortens the distance to the authority holder.

## Why WebMCP

Most WebMCP demos expose what an agent *can* do. This one also defines what an agent **cannot conclude**.

- `check_policy` returns a genuine contradiction **without resolving it**, and tells the agent explicitly: `agentMayReinterpret: false`.
- `resolve_case` refuses any conclusion not backed by authoritative evidence — even two minutes before the deadline.
- `contact_support` refuses to escalate to a more intrusive channel unless the **site itself** holds a record of a less intrusive one having failed.
- `pay_seller` ignores the agent's `approved: true` and reads only `payment.humanConfirmedAt`, which a human UI click writes.

**The agent cannot mint evidence, cannot mint approval, and cannot mint its own authorization to escalate.** Every tool treats agent input as a *claim* and verifies it against site state.

## Tools

All five registered through `document.modelContext.registerTool()` in [`src/webmcp.ts`](src/webmcp.ts). Every `execute()` does nothing but call the shared action layer in [`src/actions.ts`](src/actions.ts) — the same functions `RUN DEMO` and the dev-panel buttons call. There is no separate demo code path.

| tool | what it refuses |
|---|---|
| `inspect_case` | — (the 24h user policy bound may only be *narrowed*, never widened) |
| `check_policy` | refuses to resolve the contradiction; names the authority holders instead |
| `contact_support` | refuses escalation without a recorded failure on a less intrusive channel |
| `resolve_case` | refuses a conclusion without authoritative evidence for that specific conclusion |
| `pay_seller` | refuses to send without a human UI confirmation |

### How `resolve_case` verifies

`evidenceIds` is a list of **lookup keys only**. Each id is looked up in the site's evidence store, and the `authoritative` / `supports` fields are read off the **stored record**. Nothing the agent sends alongside is trusted, and the check is on content, not count — passing four policy evidences does not satisfy it:

```
resolve_case({ decision: "keep", evidenceIds: [
  "order-record", "delivery-photo",
  "policy-misdelivery-return", "policy-fresh-nonreturnable"
]})
-> { status: "blocked",
     reason: "policy_conflict_requires_discretion",
     missing: ["authoritative_keep_permission"] }
```

Only after `contact_support({channel:"seller_call"})` — which the site permits only once the text has gone unanswered for an hour and under 2h remain — does the site mint `seller-call-confirmation` with `authoritative: true, supports: "keep_allowed"`. Then, and only then, `resolve_case` returns `resolved`.

## Trying it

**As a judge with an agent:** open the live URL in Chrome with `chrome://flags/#enable-webmcp-testing` enabled (or the ChatGPT in-app browser). The header shows `WebMCP connected` when registration succeeded. Ask the agent to resolve the extra-egg case; every tool call appears as a card on the RIGHT phone and moves the on-screen state.

Try asking it to conclude immediately — the site will block it.

**Without an agent:** press `RUN DEMO` for the 35-second scripted playback, or click the buttons in the `SHARED ACTION LAYER` footer to drive the same actions by hand. `RESET` returns to the start.

The virtual clock advances on its own (1 virtual hour per 4 real seconds) once a case is open, so the time-gated escalations are reachable in a live session.

## The capability diagram

Beside the agent's phone sits a live ladder of the agent's eight capabilities, each a ring that is **green when executable right now and red when it is not**. During playback it fills in — 4 available at 08:00, 5 once `check_policy` names the seller an authority holder, 6 when the deadline crosses the 2h line, 7 once the seller's confirmation exists.

Above the ladder, an **availability timeline** runs 08:00 to 18:00 with one lane per gated capability — locked in red, hatched amber where it will open later, green once open — and a playhead sweeping across all lanes at the shared clock time. It shows the *future*, so at 13:00 you can already see where the day turns.

Two lanes never turn green: `resolve_case` and `pay_seller` read `no clock opens this — evidence only`. Set against `seller_call`, whose green edge does slide into place, the split makes the distinction plain — some gates time opens, some gates no amount of waiting ever opens.

The boundary is not drawn from a schedule. `earliestUnlock()` evaluates the real requirement functions at hypothetical clock times, which is why `seller_call` reads `never` until 15:00 and then snaps to `earliest 16:00` the moment the text is on record. Time and evidence visibly move it together.

Nothing unlocks quietly. Every open gate lists, in small type, the record that opened it:

```
(📞) seller_call            lvl 3     AVAILABLE
     unlocked by
     ✓ the seller was texted first        text sent at 15:00
     ✓ that text is recorded as unanswered  silent for 60m
     ✓ 1h has passed since the text         60m elapsed of 60m required
     ✓ deadline pressure: 2h or less remains  2.0h until 18:00, unlocks at 2.0h
```

So the viewer reads the unlock as *time pressure plus a recorded failure* — never as the agent deciding it had waited long enough. A refused call flags its own node with `NOT AVAILABLE IN THIS STATE — the call was refused, not performed`, so reaching past the current authority is visible the instant it happens.

The panel is not a separate illustration. `src/gates.ts` is what `contact_support`, `resolve_case`, and `pay_seller` **enforce** with, and the diagram renders those same functions — the picture cannot drift from the guardrail, because it is the guardrail.

## Screen

The app opens on a **start state**: the same delivery photo, the same 08:00, handed to both sides at once — the human on the left, the agent on the right — so the split that follows reads as two routes out of one situation rather than two unrelated stories.

Single split screen. LEFT is the human working the same problem through a support chat, fragmented by lunch, a work call, and support hours. RIGHT is the agent, driven entirely by tool-call results. The shared virtual clock is at the top. The human ends the day unresolved; the agent resolves at 16:30.

## Stack

Vite + React + TypeScript, static SPA, in-memory state. No backend, no database, no auth. External systems (support center, seller, telephony, payment) are simulated; **tool registration, tool invocation, evidence gating, escalation gating, deadline-dependent routing, and state transitions are real.**

## License

MIT — see [LICENSE](LICENSE).
