/** §5 data model + a tiny store. Both RUN DEMO and WebMCP tools mutate this. */

export type Supports =
  | "ordered_quantity"
  | "delivered_quantity"
  | "return_required"
  | "return_impossible"
  | "keep_allowed"
  | "no_extra_charge";

export type Evidence = {
  id: string;
  type: "order" | "photo" | "policy" | "support_response" | "seller_confirmation";
  title: string;
  content: string;
  source: string;
  timestamp: string;
  /** Set by tools only. Never accepted from agent input. */
  authoritative: boolean;
  supports: Supports;
};

export type Channel = "ai_support" | "ordinary_support" | "seller_text" | "seller_call";

export type ContactAttempt = {
  channel: Channel;
  startedAt: number;
  intrusiveness: 1 | 2 | 3;
  result: "pending" | "low_utility" | "no_response" | "conflicting" | "resolved";
  evidenceId?: string;
};

export type AgentState =
  | "idle"
  | "inspecting"
  | "routing"
  | "waiting_for_discretion"
  | "blocked"
  | "resolved";

export type Card = {
  id: string;
  at: number;
  kind:
    | "case"
    | "deadline"
    | "tool"
    | "conflict"
    | "twopath"
    | "blocked"
    | "escalation"
    | "call"
    | "photo"
    | "resolved";
  title: string;
  status?: "ok" | "blocked" | "info";
  lines?: string[];
  rows?: [string, string][];
};

export type LeftMsg = {
  id: string;
  at: number;
  who: "user" | "support" | "bot" | "system" | "overlay";
  text: string;
};

export type EggCase = {
  id: string;
  order: { item: "egg"; orderedQty: 1; deliveredQty: 2 };
  userPolicy: {
    maxResolutionHours: 24;
    evidenceRequired: true;
    allowUnsupportedConsumptionDecision: false;
  };
  createdAt: number;
  /** minutes-of-day; may only be moved EARLIER than the user policy bound. */
  operationalDeadline: number | null;
  operationalDeadlineRationale: string[];
  virtualTime: number;
  agentState: AgentState;
  evidence: Evidence[];
  attemptedChannels: ContactAttempt[];
  policyConflict: boolean;
  /** true once check_policy has disclosed seller as an authority holder */
  authorityHoldersDisclosed: string[];
  /** when check_policy disclosed them -- lets the timeline probe past times honestly */
  authorityDisclosedAt: number | null;
  resolution: null | "keep" | "return" | "discard";
  inferenceRefusedAt: number | null;
  /** The capability most recently refused, so the diagram can flag it. */
  lastDenied: { key: string; at: number; missing: string[]; seq: number } | null;
  payment: { amount: number | null; approved: boolean; sent: boolean; humanConfirmedAt: number | null };
  cards: Card[];
  left: LeftMsg[];
  finale: boolean;
  demoRunning: boolean;
  /** "start" = the shared opening frame, before either side has moved. */
  phase: "start" | "running";
};

export const START = 8 * 60; // 08:00
export const MAX_HOURS = 24;

export function hhmm(m: number): string {
  const t = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function initialCase(): EggCase {
  return {
    id: "case-18492",
    order: { item: "egg", orderedQty: 1, deliveredQty: 2 },
    userPolicy: {
      maxResolutionHours: 24,
      evidenceRequired: true,
      allowUnsupportedConsumptionDecision: false,
    },
    createdAt: START,
    operationalDeadline: null,
    operationalDeadlineRationale: [],
    virtualTime: START,
    agentState: "idle",
    evidence: [],
    attemptedChannels: [],
    policyConflict: false,
    authorityHoldersDisclosed: [],
    authorityDisclosedAt: null,
    resolution: null,
    inferenceRefusedAt: null,
    lastDenied: null,
    payment: { amount: null, approved: false, sent: false, humanConfirmedAt: null },
    cards: [],
    left: [],
    finale: false,
    demoRunning: false,
    phase: "start",
  };
}

let state = initialCase();
let version = 0;
const listeners = new Set<() => void>();

export const getState = () => state;
export const getVersion = () => version;

export function notify() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function resetState() {
  state = initialCase();
  notify();
}

export function pushCard(c: Omit<Card, "id" | "at">) {
  state.cards.push({ ...c, id: `c${state.cards.length}`, at: state.virtualTime });
}

export function pushLeft(who: LeftMsg["who"], text: string) {
  state.left.push({ id: `l${state.left.length}`, at: state.virtualTime, who, text });
}

export function setVirtualTime(m: number) {
  state.virtualTime = m;
  notify();
}
