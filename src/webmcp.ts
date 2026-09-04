/**
 * §6 - four tools registered via document.modelContext.registerTool().
 * Every execute() does nothing but call the shared action layer in actions.ts.
 */
import { actions } from "./actions";
import { getState, notify, pushCard } from "./state";

declare global {
  interface Document {
    modelContext?: {
      registerTool: (t: unknown) => unknown;
      provideContext?: (t: unknown) => unknown;
    };
  }
}

function announce(name: string, input: unknown) {
  const s = getState();
  pushCard({
    kind: "tool",
    title: "AGENT CALL: " + name,
    status: "info",
    lines: [JSON.stringify(input ?? {})],
  });
  s.agentState = s.agentState === "idle" ? "inspecting" : s.agentState;
  notify();
}

const wrap = (name: string, fn: (input: any) => unknown) => async (input: any) => {
  announce(name, input);
  const result = fn(input ?? {});
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
};

export const TOOLS = [
  {
    name: "inspect_case",
    description:
      "Inspect the delivery discrepancy case: what was ordered, what arrived, the user's resolution policy, and the operational deadline the agent may work within.",
    inputSchema: { type: "object", properties: {}, required: [] as string[] },
    execute: wrap("inspect_case", () => actions.inspectCase()),
  },
  {
    name: "check_policy",
    description:
      "Return the store policies bearing on this case. Contradictions are returned as-is and are NOT resolved for you; the response names who holds the authority to interpret them.",
    inputSchema: { type: "object", properties: {}, required: [] as string[] },
    execute: wrap("check_policy", () => actions.checkPolicy()),
  },
  {
    name: "contact_support",
    description:
      "Contact a human on one of the available channels. More intrusive channels are refused unless this site already holds a record of a less intrusive one having failed.",
    inputSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: ["ai_support", "ordinary_support", "seller_text", "seller_call"],
          description: "Channel to use, least intrusive first.",
        },
      },
      required: ["channel"],
    },
    execute: wrap("contact_support", (i) => actions.contactSupport(i)),
  },
  {
    name: "resolve_case",
    description:
      "Conclude the case. Refused unless the conclusion is backed by authoritative evidence. evidenceIds are lookup keys only: the stored record's authoritative/supports fields are what get checked.",
    inputSchema: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["keep", "return", "discard"] },
        evidenceIds: { type: "array", items: { type: "string" } },
      },
      required: ["decision", "evidenceIds"],
    },
    execute: wrap("resolve_case", (i) => actions.resolveCase(i)),
  },
  {
    name: "pay_seller",
    description:
      "Offer to pay the seller for the extra item. The `approved` field in your input is ignored; the site only accepts a confirmation that a human clicked in the page UI.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        approved: { type: "boolean" },
      },
      required: [] as string[],
    },
    execute: wrap("pay_seller", (i) => actions.paySeller(i)),
  },
];

export function registerWebMCPTools() {
  const mc = document.modelContext;
  if (!mc || typeof mc.registerTool !== "function") {
    console.warn("[webmcp] document.modelContext unavailable - enable chrome://flags/#enable-webmcp-testing");
    return false;
  }
  for (const t of TOOLS) {
    try {
      mc.registerTool(t);
    } catch (e) {
      console.error("[webmcp] registerTool failed for " + t.name, e);
    }
  }
  console.log("[webmcp] registered " + TOOLS.length + " tools");
  return true;
}
