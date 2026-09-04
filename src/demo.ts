/** RUN DEMO: a scripted clock. It calls the SAME actions the WebMCP tools call. */
import { actions } from "./actions";
import { getState, notify, pushCard, pushLeft, resetState, setVirtualTime } from "./state";

type Step = [seconds: number, vt: number, run: () => void];

const H = (h: number, m = 0) => h * 60 + m;

const steps: Step[] = [
  // The identical delivery lands on both sides at the same minute.
  [0.2, H(8), () => {
    const s = getState();
    s.phase = "running";
    pushLeft("system", "Delivery arrived");
    pushLeft("system", "PHOTO");
    pushCard({ kind: "photo", title: "DELIVERY RECEIVED", lines: ["Ordered 1 tray - Delivered 2 trays"] });
    notify();
  }],
  [1.0, H(8), () => {
    pushLeft("user", "Got an extra tray of 30 eggs I didn't order.");
    pushLeft("user", "Just deal with this one thing.");
    pushCard({
      kind: "tool",
      title: "DELEGATED BY USER",
      status: "info",
      lines: ['"Just deal with this one thing."'],
    });
    notify();
  }],
  [2.2, H(8), () => { actions.inspectCase(); }],
  [4.2, H(9), () => { actions.contactSupport({ channel: "ai_support" }); }],
  [7.2, H(9, 10), () => { actions.checkPolicy(); }],
  [10.0, H(9, 15), () => {
    // The agent tries to conclude on its own. The site refuses.
    actions.resolveCase({
      decision: "keep",
      evidenceIds: ["order-record", "delivery-photo", "policy-misdelivery-return", "policy-fresh-nonreturnable"],
    });
  }],
  [13.2, H(10), () => { actions.contactSupport({ channel: "ordinary_support" }); }],

  // 13:00 - human discretion is genuinely in motion on the LEFT while the agent waits.
  [15.8, H(13), () => { pushLeft("user", "I ordered one egg but two arrived."); }],
  [16.7, H(13, 1), () => { pushLeft("support", "Misdelivered items must be returned."); }],
  [17.6, H(13, 2), () => { pushLeft("user", "But it's fresh food - returns are blocked."); }],
  [18.5, H(13, 3), () => { pushLeft("support", "Let me check and get back to you."); }],
  [19.4, H(13, 4), () => { pushLeft("overlay", "Lunch ends in 3 min"); }],

  [21.0, H(15), () => {
    const s = getState();
    s.cards.push({
      id: "c" + s.cards.length, at: s.virtualTime, kind: "escalation", status: "info",
      title: "ROUTE RECALCULATED",
      lines: [
        "No response from support",
        "Human discretion did not arrive in time",
        "Seller also holds discretion",
        "Finding actual seller... Seller contact found",
      ],
    });
    notify();
  }],
  [22.6, H(15), () => {
    actions.contactSupport({ channel: "seller_text" });
    pushLeft("system", "New support session");
    pushLeft("support", "Could you provide your order number?");
  }],
  [23.8, H(15, 5), () => { pushLeft("overlay", "WORK CALL - Incoming"); }],

  // Escalation refused: the agent's own sense of urgency is not authorization.
  [25.2, H(15, 30), () => { actions.contactSupport({ channel: "seller_call" }); }],

  [27.6, H(16), () => { actions.contactSupport({ channel: "seller_call" }); }],
  [30.2, H(16, 30), () => {
    actions.resolveCase({
      decision: "keep",
      evidenceIds: ["order-record", "delivery-photo", "seller-call-confirmation", "seller-no-extra-charge"],
    });
  }],
  [32.6, H(18, 7), () => {
    pushLeft("system", "Support hours have ended.");
    pushLeft("bot", "Would you like a refund?");
    pushLeft("system", "UNRESOLVED");
  }],
  [34.6, H(18, 7), () => { getState().finale = true; notify(); }],
];

let timers: number[] = [];

export function stopDemo() {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
  getState().demoRunning = false;
  notify();
}

export function runDemo() {
  stopDemo();
  resetState();
  const s = getState();
  s.demoRunning = true;
  s.phase = "running";
  notify();

  for (const [sec, vt, fn] of steps) {
    timers.push(
      window.setTimeout(() => {
        setVirtualTime(vt);
        fn();
      }, sec * 1000)
    );
  }
  timers.push(window.setTimeout(() => { getState().demoRunning = false; notify(); }, 36000));
}

export function resetDemo() {
  stopDemo();
  resetState();
}

/**
 * Outside of RUN DEMO the virtual clock advances on its own, so a live agent
 * (judge in ChatGPT / Chrome) can actually reach the time-gated escalations.
 * 1 virtual hour per 4 real seconds.
 */
export function startAmbientClock() {
  window.setInterval(() => {
    const s = getState();
    if (s.demoRunning) return;
    if (s.agentState === "idle" || s.agentState === "resolved") return;
    if (s.virtualTime >= 18 * 60 + 7) return;
    setVirtualTime(s.virtualTime + 15);
  }, 1000);
}
