import { HEAT_LABEL, STATUS_LABEL, type Heat, type ProspectStatus } from "@gyna/schemas";
import { Flame } from "./icons";

const HEAT_COLOR: Record<Heat, string> = { hot: "var(--hot)", warm: "var(--warm)", cold: "var(--cold)" };
const HEAT_LEVEL: Record<Heat, number> = { cold: 1, warm: 2, hot: 3 };

export function HeatLabel({ heat }: { heat: Heat | null }) {
  if (!heat) return <span className="muted">Non qualifié</span>;
  return (
    <span className="heat">
      {heat === "hot" ? <Flame /> : <span className="dot" style={{ background: HEAT_COLOR[heat] }} aria-hidden="true" />}
      {HEAT_LABEL[heat]}
    </span>
  );
}

export function HeatGauge({ heat, large }: { heat: Heat | null; large?: boolean }) {
  const level = heat ? HEAT_LEVEL[heat] : 0;
  return (
    <div className={`gauge${large ? " lg" : ""}`} role="img" aria-label={`Chaleur : ${level} sur 3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} style={i <= level && heat ? { background: HEAT_COLOR[heat] } : undefined} />
      ))}
    </div>
  );
}

const STATUS_PILL: Record<ProspectStatus, string> = {
  to_review: "pill",
  qualified: "pill pill-lavender",
  contacted: "pill pill-cold",
  replied: "pill pill-warm",
  enrolled: "pill pill-lime",
  discarded: "pill",
};

export function StatusPill({ status }: { status: ProspectStatus }) {
  return <span className={STATUS_PILL[status]}>{STATUS_LABEL[status]}</span>;
}
