/**
 * §7 shared action layer.
 * RUN DEMO, the dev panel, and every WebMCP tool call go through here.
 *
 * §1-1 invariants enforced in this file:
 *  1. Evidence.authoritative is written by tools only, never read from agent input.
 *  2. Approval comes from payment.humanConfirmedAt (a UI click), never from input.approved.
 *  3. Escalation is authorized by recorded prior attempts, never by the agent's own judgement.
 */
import {
  getState, notify, pushCard, hhmm, START, MAX_HOURS,
  type Channel, type Evidence, type Supports,
} from "./state";

const INTRUSIVENESS: Record<Channel, 1 | 2 | 3> = {
  ai_support: 1,
  ordinary_support: 1,
  seller_text: 2,
  seller_call: 3,
};

/** Evidence is minted here and nowhere else. */
function mint(e: Omit<Evidence, "timestamp">): Evidence {
  const s = getState();
  const rec: Evidence = { ...e, timestamp: hhmm(s.virtualTime) };
  if (!s.evidence.some((x) => x.id === rec.id)) s.evidence.push(rec);
  return rec;
}

/** Any action -- demo, dev panel, or a live agent tool call -- leaves the start frame. */
function settleAttempts() {
  const s = getState();
  s.phase = "running";
  for (const a of s.attemptedChannels) {
    if (a.channel === "seller_text" && a.result === "pending" && s.virtualTime - a.startedAt >= 60) {
      a.result = "no_response";
    }
  }
}

export function remainingMinutes(): number {
  const s = getState();
  const dl = s.operationalDeadline ?? START + MAX_HOURS * 60;
  return dl - s.virtualTime;
}

function toolCard(name: string, status: "ok" | "blocked", lines: string[]) {
  pushCard({ kind: "tool", title: name, status, lines });
}

// inspect_case

export function inspectCase() {
  const s = getState();
  settleAttempts();
  s.agentState = "inspecting";

  mint({
    id: "order-record",
    type: "order",
    title: "Order #18492",
    content: "1 tray of 30 eggs ordered",
    source: "store order system",
    authoritative: true,
    supports: "ordered_quantity",
  });
  mint({
    id: "delivery-photo",
    type: "photo",
    title: "Delivery photo",
    content: '{"detected":"egg_tray","count":2}',
    source: "delivery photo scan",
    authoritative: true,
    supports: "delivered_quantity",
  });

  // The user policy bound (24h) is fixed. The agent may only NARROW it.
  const policyBound = START + MAX_HOURS * 60;
  const proposed = 18 * 60;
  s.operationalDeadline = Math.min(proposed, policyBound);
  s.operationalDeadlineRationale = ["working_hours", "seller_availability", "freshness"];

  pushCard({
    kind: "case",
    title: "CASE #18492",
    rows: [["Ordered", "1 tray (30 eggs)"], ["Delivered", "2 trays (60 eggs)"], ["Unexpected", "1 tray"]],
  });
  pushCard({
    kind: "deadline",
    title: "DEADLINE NARROWED BY AGENT",
    rows: [
      ["Maximum SLA", "24h"],
      ["Working hours", "09:00-18:00"],
      ["Seller contact window", "Daytime"],
      ["Fresh item", "Time-sensitive"],
      ["Operational deadline", "TODAY " + hhmm(s.operationalDeadline)],
    ],
  });
  notify();

  return {
    ordered: 1,
    delivered: 2,
    unexpected: 1,
    maxResolutionHours: 24,
    evidenceRequired: true,
    operationalDeadline: hhmm(s.operationalDeadline),
    operationalDeadlineRationale: s.operationalDeadlineRationale,
  };
}

// check_policy

export function checkPolicy() {
  const s = getState();
  settleAttempts();

  mint({
    id: "policy-misdelivery-return",
    type: "policy",
    title: "misdelivery-return",
    content: "Misdelivered items must be returned.",
    source: "store policy",
    authoritative: true,
    supports: "return_required",
  });
  mint({
    id: "policy-fresh-nonreturnable",
    type: "policy",
    title: "fresh-nonreturnable",
    content: "Fresh food cannot be returned.",
    source: "store policy",
    authoritative: true,
    supports: "return_impossible",
  });

  s.policyConflict = true;
  s.authorityHoldersDisclosed = ["support_agent", "seller"];
  s.agentState = "routing";

  pushCard({
    kind: "conflict",
    title: "POLICY CONFLICT",
    lines: [
      "Misdelivered items   =>   RETURN",
      "Fresh food   =>   NON-RETURNABLE",
      "resolvableBy: human_discretion",
      "agentMayReinterpret: false",
    ],
  });
  notify();

  return {
    policies: [
      { id: "misdelivery-return", rule: "Misdelivered items must be returned." },
      { id: "fresh-nonreturnable", rule: "Fresh food cannot be returned." },
    ],
    conflict: true,
    resolvableBy: "human_discretion",
    authorityHolders: ["support_agent", "seller"],
    agentMayReinterpret: false,
  };
}

// contact_support

export function contactSupport(input: { channel: Channel }) {
  const s = getState();
  settleAttempts();
  const channel = input?.channel;

  if (!INTRUSIVENESS[channel]) {
    return { status: "blocked", reason: "unknown_channel", missing: ["valid_channel"], message: "Unknown channel." };
  }

  const missing: string[] = [];

  // §6-3 a more intrusive channel is authorized only by RECORDED failures.
  if (channel === "seller_text") {
    if (!s.authorityHoldersDisclosed.includes("seller")) missing.push("seller_confirmed_as_authority_holder");
    const priorFailed = s.attemptedChannels.some(
      (a) => a.intrusiveness < 2 && (a.result === "low_utility" || a.result === "no_response")
    );
    if (!priorFailed) missing.push("prior_attempt_on_less_intrusive_channel");
  }

  if (channel === "seller_call") {
    const text = s.attemptedChannels.find((a) => a.channel === "seller_text");
    if (!text) missing.push("prior_seller_text_attempt");
    else {
      if (text.result !== "no_response") missing.push("seller_text_result_no_response");
      if (s.virtualTime - text.startedAt < 60) missing.push("one_hour_since_text");
    }
    if (remainingMinutes() > 120) missing.push("remaining_time_within_2h");
  }

  if (missing.length) {
    const text = s.attemptedChannels.find((a) => a.channel === "seller_text");
    const detail: string[] = [];
    if (text) detail.push("text sent " + (s.virtualTime - text.startedAt) + "m ago - 1h minimum not met");
    detail.push((remainingMinutes() / 60).toFixed(1) + "h until operational deadline");
    pushCard({
      kind: "escalation",
      title: channel === "seller_call" ? "CALL SELLER" : "TEXT SELLER",
      status: "blocked",
      lines: ["BLOCKED - escalation_unjustified", ...detail, "missing: " + missing.join(", ")],
    });
    notify();
    return {
      status: "blocked",
      reason: "escalation_unjustified",
      missing,
      message: "A more intrusive channel requires a recorded failure of a less intrusive one.",
    };
  }

  const attempt = {
    channel,
    startedAt: s.virtualTime,
    intrusiveness: INTRUSIVENESS[channel],
    result: "pending" as ("pending" | "low_utility" | "no_response" | "conflicting" | "resolved"),
    evidenceId: undefined as string | undefined,
  };
  s.attemptedChannels.push(attempt);

  if (channel === "ai_support") {
    attempt.result = "low_utility";
    s.agentState = "routing";
    toolCard("contact_support: ai_support", "ok", [
      'AI support: "Would you like a refund?"',
      'AI support: "Would you like to return it?"',
      'AI support: "Please select refund or return."',
      "LOW EXPECTED UTILITY - SESSION CLOSED",
    ]);
    notify();
    return { status: "low_utility", response: "Please choose refund or return." };
  }

  if (channel === "ordinary_support") {
    attempt.result = "no_response";
    s.agentState = "waiting_for_discretion";
    toolCard("contact_support: ordinary_support", "ok", [
      "Human support agent engaged - discretion path is active",
      "WAITING FOR HUMAN DISCRETION",
    ]);
    notify();
    return { status: "no_response" };
  }

  if (channel === "seller_text") {
    attempt.result = "pending";
    s.agentState = "routing";
    pushCard({
      kind: "tool",
      title: "TEXT SELLER",
      status: "ok",
      lines: [
        "Order #18492 - 1 tray ordered, 2 trays delivered.",
        "May I keep or consume the extra tray?",
        "Text sent",
      ],
    });
    notify();
    return { status: "sent", response: null };
  }

  // seller_call: the authority holder answers. Evidence is minted HERE, by the site.
  attempt.result = "resolved";
  const ev = mint({
    id: "seller-call-confirmation",
    type: "seller_confirmation",
    title: "Seller phone confirmation",
    content: "The extra tray was delivered by mistake. You may keep or consume it.",
    source: "seller (authority holder)",
    authoritative: true,
    supports: "keep_allowed",
  });
  mint({
    id: "seller-no-extra-charge",
    type: "seller_confirmation",
    title: "Seller: no additional charge",
    content: "No additional charge.",
    source: "seller (authority holder)",
    authoritative: true,
    supports: "no_extra_charge",
  });
  attempt.evidenceId = ev.id;
  pushCard({
    kind: "call",
    title: "CALL SELLER - CONNECTED",
    status: "ok",
    lines: [
      'Seller: "Oh, you texted? Sorry, it was too busy today to check.',
      '        Yeah, we packed an extra one. Our mistake -',
      '        just go ahead and eat it."',
      'Agent: "To confirm - I may keep and consume it at no additional charge?"',
      'Seller: "That is right."',
      "EVIDENCE VERIFIED - authoritative: true",
    ],
  });
  notify();
  return {
    status: "resolved",
    response: "The extra tray was delivered by mistake. You may keep or consume it. No additional charge.",
    evidenceId: "seller-call-confirmation",
    authoritative: true,
  };
}

// resolve_case

const NEEDED_FOR: Record<string, Supports> = {
  keep: "keep_allowed",
  discard: "keep_allowed",
  return: "return_required",
};

export function resolveCase(input: { decision: "keep" | "return" | "discard"; evidenceIds: string[] }) {
  const s = getState();
  settleAttempts();
  const decision = input?.decision;
  const ids: string[] = Array.isArray(input?.evidenceIds) ? input.evidenceIds : [];

  // The array is a set of LOOKUP KEYS. Nothing the agent sent alongside is trusted.
  // authoritative/supports are read off the STORED record only.
  const records = ids
    .map((id) => s.evidence.find((e) => e.id === id))
    .filter((e): e is Evidence => Boolean(e));

  const has = (sup: Supports) => records.some((r) => r.supports === sup);
  const hasAuthoritative = (sup: Supports) =>
    records.some((r) => r.supports === sup && r.authoritative === true);

  const missing: string[] = [];
  if (!has("ordered_quantity")) missing.push("ordered_quantity_evidence");
  if (!has("delivered_quantity")) missing.push("delivered_quantity_evidence");

  const need = NEEDED_FOR[decision];
  if (!need) missing.push("valid_decision");
  else if (!hasAuthoritative(need)) {
    missing.push(decision === "return" ? "authoritative_return_permission" : "authoritative_keep_permission");
  }

  if (missing.length) {
    s.agentState = "blocked";
    if (s.policyConflict && s.inferenceRefusedAt === null) s.inferenceRefusedAt = s.virtualTime;
    pushCard({
      kind: "blocked",
      title: 'resolve_case("' + decision + '") - BLOCKED',
      status: "blocked",
      lines: [
        "reason: policy_conflict_requires_discretion",
        "missing: " + missing.join(", "),
        "Policy conflict cannot be resolved by inference.",
        "Authority holder confirmation required.",
        "evidence supplied: " + (records.length ? records.map((r) => r.supports).join(", ") : "none valid"),
      ],
    });
    pushCard({
      kind: "twopath",
      title: "TWO ROUTES",
      lines: [
        "RESOLVE BY OWN INFERENCE|REFUSED|no authority to reinterpret policy",
        "ROUTE TO HUMAN DISCRETION|SELECTED|authority holders: support agent, seller",
      ],
    });
    notify();
    return {
      status: "blocked",
      reason: "policy_conflict_requires_discretion",
      missing,
      message: "Policy conflict cannot be resolved by inference. Authority holder confirmation required.",
    };
  }

  s.resolution = decision;
  s.agentState = "resolved";
  pushCard({
    kind: "resolved",
    title: "RESOLVED / " + decision.toUpperCase() + " PERMITTED",
    status: "ok",
    lines: [
      "Ordered 1 tray (30 eggs)",
      "Delivered 2 trays (60 eggs)",
      "Fresh item non-returnable",
      "Seller confirmed misdelivery",
      "Seller authorized keep/consume",
      "No additional charge",
    ],
  });
  notify();
  return { status: "resolved", decision };
}

// pay_seller (P2)

export function paySeller(input: { amount?: number; approved?: boolean }) {
  const s = getState();
  s.phase = "running";
  // input.approved is deliberately ignored. Only a human UI click writes humanConfirmedAt.
  if (s.payment.humanConfirmedAt === null) {
    s.payment.amount = input?.amount ?? 30000;
    pushCard({
      kind: "blocked",
      title: "pay_seller - CONFIRMATION REQUIRED",
      status: "blocked",
      lines: [
        "agent input approved=" + String(input?.approved) + " - ignored",
        "humanConfirmedAt: null",
        "Send 30,000 KRW to the seller?",
      ],
    });
    notify();
    return { status: "confirmation_required", message: "Send 30,000 KRW to the seller?" };
  }
  s.payment.sent = true;
  s.payment.approved = true;
  pushCard({ kind: "resolved", title: "PAYMENT SENT", status: "ok", lines: ["30,000 KRW (~$20) sent to seller"] });
  notify();
  return { status: "sent", amount: s.payment.amount ?? 30000 };
}

export function humanConfirmPayment() {
  const s = getState();
  s.payment.humanConfirmedAt = s.virtualTime;
  notify();
}

export const actions = {
  inspectCase, checkPolicy, contactSupport, resolveCase, paySeller, humanConfirmPayment,
};
