import { hhmm, type EggCase } from "./state";
import { evaluateGates, type Gate, type Req } from "./gates";
import Timeline from "./Timeline";

const GROUPS: { key: Gate["group"]; title: string; note: string }[] = [
  { key: "read", title: "READ", note: "no authority needed" },
  { key: "reach", title: "REACH A HUMAN", note: "ordered by intrusiveness" },
  { key: "conclude", title: "CONCLUDE", note: "needs authoritative evidence" },
];

function ReqLine({ r }: { r: Req }) {
  return (
    <div className={"req " + (r.met ? "met" : "unmet")}>
      <span className="req-mark">{r.met ? "✓" : "✕"}</span>
      <span className="req-body">
        <span className="req-label">{r.label}</span>
        {r.detail && <span className="req-detail">{r.detail}</span>}
      </span>
    </div>
  );
}

function GateNode({ g, denied }: { g: Gate; denied: boolean }) {
  // An unlocked gate shows what unlocked it; a locked one shows what is still missing.
  const shown = g.reqs.length === 0 ? [] : g.unlocked ? g.reqs : g.reqs.filter((r) => !r.met);

  return (
    <div className={"gate " + (g.unlocked ? "open" : "shut") + (denied ? " denied" : "")}>
      <div className="gate-head">
        <span className="dot">
          <span className="dot-icon">{g.icon}</span>
        </span>
        <span className="gate-name">{g.label}</span>
        {g.level && <span className="lvl">lvl {g.level}</span>}
        <span className="gate-state">{g.unlocked ? "AVAILABLE" : "LOCKED"}</span>
      </div>

      {denied && (
        <div className="denied-flag">
          NOT AVAILABLE IN THIS STATE — the call was refused, not performed
        </div>
      )}

      {shown.length > 0 && (
        <div className="reqs">
          {g.unlocked && <div className="reqs-cap">unlocked by</div>}
          {shown.map((r) => <ReqLine key={r.key} r={r} />)}
        </div>
      )}
    </div>
  );
}

export default function GatePanel({ s }: { s: EggCase }) {
  const gates = evaluateGates(s);
  const open = gates.filter((g) => g.unlocked).length;
  const denied = s.lastDenied;

  return (
    <aside className="gatepanel">
      <div className="gp-head">
        <div className="gp-title">AGENT CAPABILITIES</div>
        <div className="gp-count">
          <b>{open}</b> / {gates.length} available
        </div>
      </div>

      <Timeline s={s} />

      <div className="gp-legend">
        <span><i className="sw open" /> executable now</span>
        <span><i className="sw shut" /> no authority yet</span>
      </div>

      {denied && (
        <div className="gp-denied">
          <b>{denied.key}</b> refused at {hhmm(denied.at)}
          <span>{denied.missing.join(", ")}</span>
        </div>
      )}

      <div className="gp-body">
        {GROUPS.map((grp) => (
          <div className="gp-group" key={grp.key}>
            <div className="gp-group-head">
              <span>{grp.title}</span>
              <span className="gp-group-note">{grp.note}</span>
            </div>
            {gates
              .filter((g) => g.group === grp.key)
              .map((g) => (
                <GateNode key={g.key} g={g} denied={denied?.key === g.key} />
              ))}
          </div>
        ))}
      </div>

      <div className="gp-foot">
        The site evaluates these, not the model. Every unlock is a recorded
        failure plus elapsed time — never the agent deciding it has waited long enough.
      </div>
    </aside>
  );
}
