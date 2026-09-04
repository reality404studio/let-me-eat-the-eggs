# LET ME EAT THE EGGS

**Live: https://let-me-eat-the-eggs.pages.dev**

A WebMCP demo where the **site**, not the model, owns the guardrail.

> Deadline changes the route. Not the authority.
> Evidence never becomes optional.

## The problem

Grocery delivery platforms carry contradictory policies: *misdelivered items must be returned*, and *fresh food cannot be returned*. Humans paper over this with heuristics and agent discretion. An agent has no such heuristics, so it either (a) reinterprets the contradiction on its own, or (b) stalls and does nothing.

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

## Screen

Single split screen. LEFT is the human working the same problem through a support chat, fragmented by lunch, a work call, and support hours. RIGHT is the agent, driven entirely by tool-call results. The shared virtual clock is at the top. The human ends the day unresolved; the agent resolves at 16:30.

## Stack

Vite + React + TypeScript, static SPA, in-memory state. No backend, no database, no auth. External systems (support center, seller, telephony, payment) are simulated; **tool registration, tool invocation, evidence gating, escalation gating, deadline-dependent routing, and state transitions are real.**

## License

MIT — see [LICENSE](LICENSE).
