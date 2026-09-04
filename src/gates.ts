/**
 * One source of truth for "what may the agent do right now, and why".
 *
 * contact_support / resolve_case / pay_seller ENFORCE with these functions, and the
 * capability diagram RENDERS these same functions. The picture cannot drift from
 * the guardrail, because it is the guardrail.
 */
import { hhmm, START, MAX_HOURS, type Channel, type EggCase, type Supports } from "./state";

/** A single requirement. `key` is what appears in a tool response's `missing[]`. */
export type Req = { key: string; label: string; met: boolean; detail?: string };

export type Gate = {
  key: string;
  icon: string;
  label: string;
  group: "read" | "reach" | "conclude";
  /** escalation ladder position, shown as lvl 1-3 */
  level?: 1 | 2 | 3;
  unlocked: boolean;
  reqs: Req[];
};

/**
 * A text unanswered for >= 1h counts as no_response. Time alone flips it, so the
 * diagram and the enforcement path must agree on the rule -- both call this.
 */
export function textUnanswered(s: EggCase): { sent: boolean; silentFor: number; unanswered: boolean } {
  const text = s.attemptedChannels.find((a) => a.channel === "seller_text" && a.startedAt <= s.virtualTime);
  if (!text) return { sent: false, silentFor: 0, unanswered: false };
  const silentFor = s.virtualTime - text.startedAt;
  return {
    sent: true,
    silentFor,
    unanswered: text.result === "no_response" || (text.result === "pending" && silentFor >= 60),
  };
}

function remaining(s: EggCase): number {
  return (s.operationalDeadline ?? START + MAX_HOURS * 60) - s.virtualTime;
}

const hrs = (m: number) => (m / 60).toFixed(1) + "h";

/** Evidence timestamp as minutes-of-day. */
function evAt(e: { timestamp: string }): number {
  const [h, m] = e.timestamp.split(":").map(Number);
  return h * 60 + m;
}

/*
 * Everything below reads ONLY records that already exist at s.virtualTime. That makes
 * these functions safe to evaluate at a hypothetical clock time, which is how the
 * timeline answers "when could this open?" without a second, hardcoded schedule.
 */
const attemptsSoFar = (s: EggCase) => s.attemptedChannels.filter((a) => a.startedAt <= s.virtualTime);
const evidenceSoFar = (s: EggCase) => s.evidence.filter((e) => evAt(e) <= s.virtualTime);

/** Requirements for a contact channel. Empty = unconditionally available. */
export function channelReqs(s: EggCase, channel: Channel): Req[] {
  if (channel === "ai_support" || channel === "ordinary_support") return [];

  if (channel === "seller_text") {
    const prior = attemptsSoFar(s).find(
      (a) => a.intrusiveness < 2 && (a.result === "low_utility" || a.result === "no_response")
    );
    const disclosed =
      s.authorityHoldersDisclosed.includes("seller") &&
      s.authorityDisclosedAt !== null &&
      s.authorityDisclosedAt <= s.virtualTime;
    return [
      {
        key: "seller_confirmed_as_authority_holder",
        label: "site named the seller an authority holder",
        met: disclosed,
        detail: disclosed
          ? "check_policy at " + hhmm(s.authorityDisclosedAt!) + " returned authorityHolders: [support_agent, seller]"
          : "run check_policy first",
      },
      {
        key: "prior_attempt_on_less_intrusive_channel",
        label: "a less intrusive channel is on record as failed",
        met: Boolean(prior),
        detail: prior
          ? prior.channel + " returned " + prior.result + " at " + hhmm(prior.startedAt)
          : "no recorded failure yet",
      },
    ];
  }

  // seller_call
  const text = attemptsSoFar(s).find((a) => a.channel === "seller_text");
  const { silentFor: silent, unanswered } = textUnanswered(s);
  const rem = remaining(s);
  return [
    {
      key: "prior_seller_text_attempt",
      label: "the seller was texted first",
      met: Boolean(text),
      detail: text ? "text sent at " + hhmm(text.startedAt) : "no text on record",
    },
    {
      key: "seller_text_result_no_response",
      label: "that text is recorded as unanswered",
      met: unanswered,
      detail: text
        ? unanswered
          ? "silent for " + silent + "m"
          : "still pending after " + silent + "m"
        : "no text on record",
    },
    {
      key: "one_hour_since_text",
      label: "1h has passed since the text",
      met: Boolean(text) && silent >= 60,
      detail: text ? silent + "m elapsed of 60m required" : "no text on record",
    },
    {
      key: "remaining_time_within_2h",
      label: "deadline pressure: 2h or less remains",
      met: rem <= 120,
      detail: hrs(rem) + " until " + (s.operationalDeadline ? hhmm(s.operationalDeadline) : "deadline") + ", unlocks at 2.0h",
    },
  ];
}

/** Requirements to conclude. Evaluated against the whole evidence store. */
export function resolveReqs(s: EggCase, decision: "keep" | "return" | "discard" = "keep"): Req[] {
  const need: Supports = decision === "return" ? "return_required" : "keep_allowed";
  const seen = evidenceSoFar(s);
  const ordered = seen.find((e) => e.supports === "ordered_quantity");
  const delivered = seen.find((e) => e.supports === "delivered_quantity");
  const auth = seen.find((e) => e.supports === need && e.authoritative === true);
  return [
    {
      key: "ordered_quantity_evidence",
      label: "evidence of what was ordered",
      met: Boolean(ordered),
      detail: ordered ? ordered.id + " (" + ordered.source + ")" : "run inspect_case",
    },
    {
      key: "delivered_quantity_evidence",
      label: "evidence of what arrived",
      met: Boolean(delivered),
      detail: delivered ? delivered.id + " (" + delivered.source + ")" : "run inspect_case",
    },
    {
      key: decision === "return" ? "authoritative_return_permission" : "authoritative_keep_permission",
      label: "an authority holder permitted it",
      met: Boolean(auth),
      detail: auth
        ? auth.id + " - " + auth.source + ", authoritative: true"
        : "no authoritative " + need + " evidence exists yet",
    },
  ];
}

export function payReqs(s: EggCase): Req[] {
  return [
    {
      key: "human_confirmation",
      label: "a human clicked confirm in this page",
      met: s.payment.humanConfirmedAt !== null && s.payment.humanConfirmedAt <= s.virtualTime,
      detail:
        s.payment.humanConfirmedAt !== null
          ? "humanConfirmedAt = " + hhmm(s.payment.humanConfirmedAt)
          : "humanConfirmedAt is null - the agent's approved:true is ignored",
    },
  ];
}

/** Unmet requirement keys, in the shape tool responses report them. */
export const unmet = (reqs: Req[]) => reqs.filter((r) => !r.met).map((r) => r.key);

/** Requirements for any capability, by key. */
export function reqsFor(s: EggCase, key: string): Req[] {
  switch (key) {
    case "ai_support":
    case "ordinary_support":
    case "seller_text":
    case "seller_call":
      return channelReqs(s, key as Channel);
    case "resolve_case":
      return resolveReqs(s);
    case "pay_seller":
      return payReqs(s);
    default:
      return [];
  }
}

/** The full capability ladder, for the diagram. */
export function evaluateGates(s: EggCase): Gate[] {
  const g = (
    key: string,
    icon: string,
    label: string,
    group: Gate["group"],
    reqs: Req[],
    level?: 1 | 2 | 3
  ): Gate => ({ key, icon, label, group, level, reqs, unlocked: reqs.every((r) => r.met) });

  return [
    g("inspect_case", "\u{1F50D}", "inspect_case", "read", []),
    g("check_policy", "\u{1F4CB}", "check_policy", "read", []),
    g("ai_support", "\u{1F916}", "ai_support", "reach", channelReqs(s, "ai_support"), 1),
    g("ordinary_support", "\u{1F4AC}", "ordinary_support", "reach", channelReqs(s, "ordinary_support"), 1),
    g("seller_text", "\u{2709}\u{FE0F}", "seller_text", "reach", channelReqs(s, "seller_text"), 2),
    g("seller_call", "\u{1F4DE}", "seller_call", "reach", channelReqs(s, "seller_call"), 3),
    g("resolve_case", "\u{2696}\u{FE0F}", "resolve_case", "conclude", resolveReqs(s)),
    g("pay_seller", "\u{1F4B3}", "pay_seller", "conclude", payReqs(s)),
  ];
}
