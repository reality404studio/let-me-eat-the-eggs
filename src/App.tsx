import { useEffect, useRef, useSyncExternalStore } from "react";
import { getState, getVersion, subscribe, hhmm, type Card, type LeftMsg } from "./state";
import { actions, remainingMinutes } from "./actions";
import { registerWebMCPTools } from "./webmcp";
import { runDemo, resetDemo, startAmbientClock } from "./demo";
import GatePanel from "./GatePanel";

function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [dep]);
  return ref;
}

function useStore() {
  useSyncExternalStore(subscribe, getVersion);
  return getState();
}

const BADGE: Record<string, { label: string; cls: string }> = {
  idle: { label: "IDLE", cls: "b-idle" },
  inspecting: { label: "INSPECTING", cls: "b-idle" },
  routing: { label: "ROUTING", cls: "b-routing" },
  waiting_for_discretion: { label: "WAITING FOR HUMAN DISCRETION", cls: "b-wait" },
  blocked: { label: "BLOCKED", cls: "b-blocked" },
  resolved: { label: "RESOLVED", cls: "b-resolved" },
};

function CardView({ c }: { c: Card }) {
  if (c.kind === "twopath") {
    return (
      <div className="card twopath">
        {c.lines!.map((l, i) => {
          const [label, verdict, note] = l.split("|");
          return (
            <div className={"route " + (verdict === "REFUSED" ? "refused" : "selected")} key={i}>
              <div className="route-head">
                <span className="route-label">{label}</span>
                <span className="route-verdict">
                  {verdict === "REFUSED" ? "✕ REFUSED" : "✓ SELECTED"}
                </span>
              </div>
              <div className="route-note">{note}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (c.kind === "photo") {
    return (
      <div className="card photo-card">
        <div className="card-head">
          <span className="card-title">{c.title}</span>
          <span className="card-time">{hhmm(c.at)}</span>
        </div>
        <img className="shot" src="/delivery.jpg" alt="Two egg trays delivered" />
        <div className="shot-meta">{c.lines?.[0]}</div>
      </div>
    );
  }

  if (c.kind === "conflict") {
    return (
      <div className="card conflict">
        <div className="conflict-rows">
          <div>Misdelivered items <b>RETURN</b></div>
          <div>Fresh food <b>NON-RETURNABLE</b></div>
        </div>
        <div className="conflict-title">POLICY CONFLICT</div>
        <div className="conflict-meta">
          resolvableBy: human_discretion<br />
          agentMayReinterpret: <b>false</b>
        </div>
      </div>
    );
  }

  const cls =
    "card " +
    (c.status === "blocked" ? "blocked" : "") +
    (c.kind === "resolved" ? " resolved" : "") +
    (c.kind === "call" ? " call" : "");

  return (
    <div className={cls}>
      <div className="card-head">
        <span className="card-title">{c.title}</span>
        <span className="card-time">{hhmm(c.at)}</span>
      </div>
      {c.rows && (
        <div className="rows">
          {c.rows.map(([k, v], i) => (
            <div className="row" key={i}>
              <span>{k}</span>
              <span className="row-v">{v}</span>
            </div>
          ))}
        </div>
      )}
      {c.lines && (
        <div className="lines">
          {c.lines.map((l, i) => (
            <div key={i} className={c.kind === "resolved" ? "check" : ""}>
              {c.kind === "resolved" ? "✓ " + l : l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeftMsgView({ m }: { m: LeftMsg }) {
  if (m.text === "PHOTO") {
    return (
      <div className="photo">
        <img className="shot" src="/delivery.jpg" alt="Two egg trays delivered" />
        <div className="photo-meta">Ordered: 1 tray &nbsp;·&nbsp; Delivered: 2 trays</div>
      </div>
    );
  }
  if (m.who === "overlay") return <div className="overlay-pill">{m.text}</div>;
  if (m.who === "system") return <div className="sys">{m.text}</div>;
  return (
    <div className={"bubble " + m.who}>
      <span className="who">{m.who === "user" ? "You" : m.who === "bot" ? "Chatbot" : "Support"}</span>
      <span className="txt">{m.text}</span>
    </div>
  );
}

export default function App() {
  const s = useStore();

  useEffect(() => {
    registerWebMCPTools();
    startAmbientClock();
  }, []);

  const leftRef = useAutoScroll(s.left.length);
  const rightRef = useAutoScroll(s.cards.length);
  const badge = BADGE[s.agentState] ?? BADGE.idle;
  const remH = s.operationalDeadline ? (remainingMinutes() / 60).toFixed(0) : "-";
  const mcpOn = typeof document !== "undefined" && !!(document as any).modelContext;

  return (
    <div className="stage">
      <header className="top">
        <div className="brand">LET ME EAT THE EGGS</div>
        <div className="clock">{hhmm(s.virtualTime)}</div>
        <div className="controls">
          <span className={"mcp " + (mcpOn ? "on" : "off")}>
            {mcpOn ? "WebMCP connected" : "WebMCP not detected"}
          </span>
          <button onClick={runDemo} disabled={s.demoRunning}>RUN DEMO</button>
          <button className="ghost" onClick={resetDemo}>RESET</button>
        </div>
      </header>

      <main className="split">
        <section className="side left">
          <div className="side-label">HUMAN</div>
          <div className="phone">
            <div className="phone-bar">
              <span>Grocery Support</span>
              <span>{hhmm(s.virtualTime)}</span>
            </div>
            <div className="phone-body" ref={leftRef}>
              {s.left.map((m) => <LeftMsgView key={m.id} m={m} />)}
              {s.left.length === 0 && <div className="empty">Waiting for the delivery...</div>}
            </div>
          </div>
        </section>

        <section className="side right">
          <div className="side-label">AGENT</div>
          <div className="right-row">
          <div className="phone">
            <div className={"agent-badge " + badge.cls}>
              <span>{badge.label}</span>
              <span className="rem">
                {s.operationalDeadline
                  ? remH + "h until operational deadline"
                  : "deadline not yet set"}
              </span>
            </div>
            <div className="phone-body" ref={rightRef}>
              {s.cards.map((c) => <CardView key={c.id} c={c} />)}
              {s.cards.length === 0 && <div className="empty">No tool calls yet.</div>}
            </div>
          </div>
          <GatePanel s={s} />
          </div>
        </section>
      </main>

      <footer className="dev">
        <span className="dev-label">SHARED ACTION LAYER</span>
        <button onClick={() => actions.inspectCase()}>inspect_case</button>
        <button onClick={() => actions.checkPolicy()}>check_policy</button>
        <button onClick={() => actions.contactSupport({ channel: "ai_support" })}>ai_support</button>
        <button onClick={() => actions.contactSupport({ channel: "ordinary_support" })}>ordinary_support</button>
        <button onClick={() => actions.contactSupport({ channel: "seller_text" })}>seller_text</button>
        <button onClick={() => actions.contactSupport({ channel: "seller_call" })}>seller_call</button>
        <button
          onClick={() =>
            actions.resolveCase({
              decision: "keep",
              evidenceIds: getState().evidence.map((e) => e.id),
            })
          }
        >
          resolve_case(keep)
        </button>
      </footer>

      {s.phase === "start" && (
        <div className="startstate">
          <div className="ss-head">
            <div className="ss-kicker">08:00 — THE SAME DELIVERY, THE SAME MINUTE</div>
            <img className="ss-shot" src="/delivery.jpg" alt="Two egg trays delivered" />
            <div className="ss-facts">
              <div><span>Ordered</span><b>1 tray · 30 eggs</b></div>
              <div><span>Delivered</span><b>2 trays · 60 eggs</b></div>
              <div><span>Item</span><b>Fresh · non-returnable</b></div>
            </div>
          </div>

          <div className="ss-split">
            <div className="ss-col human">
              <div className="ss-role">HUMAN</div>
              <div className="ss-move">Opens the support chat between other things.</div>
              <ul className="ss-list">
                <li>has 24 hours, but not 24 continuous hours</li>
                <li>lunch ends, a work call comes in, support closes at 18:00</li>
                <li>every restart begins from "your order number, please?"</li>
              </ul>
              <div className="ss-out bad">ends the day UNRESOLVED</div>
            </div>

            <div className="ss-col agent">
              <div className="ss-role">AGENT</div>
              <div className="ss-move">"Just deal with this one thing."</div>
              <ul className="ss-list">
                <li>narrows its own deadline to 18:00</li>
                <li>hits a policy contradiction it has no authority to interpret</li>
                <li>waits, then shortens the distance to whoever does</li>
              </ul>
              <div className="ss-out good">RESOLVED by 16:30</div>
            </div>
          </div>

          <div className="ss-foot">
            <button className="ss-go" onClick={runDemo}>RUN DEMO</button>
            <span className="ss-hint">
              or call a tool from an agent — the same state machine, entered from the same frame
            </span>
          </div>
        </div>
      )}

      {s.finale && (
        <div className="finale">
          <div className="finale-title">LET ME EAT THE EGGS</div>
          <div className="finale-rows">
            <div><span>Human</span><b className="bad">unresolved</b></div>
            <div><span>Agent</span><b className="good">resolved by 16:30</b></div>
          </div>
          <div className="finale-slogan">
            Deadline changes the route. Not the authority.<br />
            Evidence never becomes optional.
          </div>
          <div className="finale-again">
            <button onClick={resetDemo}>BACK TO START</button>
            <button className="ghost" onClick={runDemo}>REPLAY</button>
          </div>
        </div>
      )}
    </div>
  );
}
