import { hhmm, type EggCase } from "./state";
import { evaluateGates, reqsFor, type Gate } from "./gates";

const T0 = 8 * 60;
const T1 = 18 * 60;
const SPAN = T1 - T0;
const pct = (m: number) => Math.max(0, Math.min(100, ((m - T0) / SPAN) * 100));

/**
 * The earliest clock time this capability could open, holding today's record fixed.
 * Found by evaluating the real requirement functions at hypothetical times -- there is
 * no second schedule to keep in sync. null means no clock opens it: it needs evidence
 * or a human, and waiting will never be enough.
 */
function earliestUnlock(s: EggCase, g: Gate): number | null {
  for (let t = T0; t <= T1; t += 5) {
    const probe: EggCase = { ...s, virtualTime: t };
    if (reqsFor(probe, g.key).every((r) => r.met)) return t;
  }
  return null;
}

function Lane({ s, g }: { s: EggCase; g: Gate }) {
  const at = earliestUnlock(s, g);
  const now = s.virtualTime;
  const nowPct = pct(now);

  // never-by-time: the whole lane stays locked
  if (at === null) {
    return (
      <div className="tl-lane">
        <div className="tl-lane-head">
          <span className="tl-icon">{g.icon}</span>
          <span className="tl-name">{g.label}</span>
          {g.level && <span className="tl-lvl">lvl {g.level}</span>}
        </div>
        <div className="tl-bar">
          <div className="tl-seg locked" style={{ left: 0, right: 0 }} />
        </div>
        <div className="tl-note none">no clock opens this — evidence only</div>
      </div>
    );
  }

  const future = at > now;
  const openPct = pct(at);

  return (
    <div className={"tl-lane" + (future ? " future" : " open")}>
      <div className="tl-lane-head">
        <span className="tl-icon">{g.icon}</span>
        <span className="tl-name">{g.label}</span>
        {g.level && <span className="tl-lvl">lvl {g.level}</span>}
      </div>
      <div className="tl-bar">
        <div className="tl-seg locked" style={{ left: 0, width: (future ? nowPct : openPct) + "%" }} />
        {future && (
          <div className="tl-seg pending" style={{ left: nowPct + "%", width: openPct - nowPct + "%" }} />
        )}
        <div className="tl-seg open" style={{ left: openPct + "%", right: 0 }} />
        <div className="tl-edge" style={{ left: openPct + "%" }} />
      </div>
      <div className={"tl-note " + (future ? "wait" : "ok")}>
        {future ? (
          <>
            <b>earliest {hhmm(at)}</b>
            <span>{reqsFor(s, g.key).filter((r) => !r.met).map((r) => r.label).join(" · ")}</span>
          </>
        ) : (
          <>
            <b>open since {hhmm(at)}</b>
            <span>{reqsFor(s, g.key).map((r) => r.detail).filter(Boolean).join(" · ")}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function Timeline({ s }: { s: EggCase }) {
  const lanes = evaluateGates(s).filter((g) => g.reqs.length > 0);
  const nowPct = pct(s.virtualTime);
  const dl = s.operationalDeadline;

  return (
    <div className="tl">
      <div className="tl-head">
        <span className="tl-title">AVAILABILITY OVER TIME</span>
        <span className="tl-now-label">now {hhmm(s.virtualTime)}</span>
      </div>

      <div className="tl-ticks">
        {[8, 10, 12, 14, 16, 18].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>

      <div className="tl-lanes">
        {lanes.map((g) => <Lane key={g.key} s={s} g={g} />)}
        <div className="tl-playhead" style={{ left: nowPct + "%" }} />
        {dl && <div className="tl-deadline" style={{ left: pct(dl) + "%" }} />}
      </div>

      <div className="tl-legend">
        <span><i className="seg locked" /> locked</span>
        <span><i className="seg pending" /> opens later</span>
        <span><i className="seg open" /> open</span>
      </div>
    </div>
  );
}
