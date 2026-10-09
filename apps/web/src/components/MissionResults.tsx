"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HEAT_LABEL, type Heat, type ProspectStatus } from "@gyna/schemas";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { DraftDecision } from "./DraftDecision";

interface Results {
  mission: { status: string };
  watch: { competitors: number; ads: number };
  counts: { total: number; qualified: number; to_review: number; discarded: number; hot: number; warm: number; cold: number };
  prospects: Array<{ id: string; full_name: string; headline: string | null; location: string | null; status: ProspectStatus; heat: Heat | null; heat_reason: string | null }>;
  drafts: Array<{ id: string; body: string; status: string; prospect: { id: string; full_name: string } | null; approval_id: string | null }>;
}

type StepState = "idle" | "run" | "done";
const HEAT_PILL: Record<Heat, string> = { hot: "pill pill-hot", warm: "pill pill-warm", cold: "pill pill-cold" };
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Les trois étapes de la mission, déduites de ce que les agents ont écrit en base. */
function stepsOf(d: Results): Array<{ label: string; state: StepState; detail: string; ratio?: number }> {
  const running = d.mission.status === "running";
  const total = d.counts.total;
  const judged = d.counts.qualified + d.counts.discarded;
  const drafts = d.drafts.length;
  const sourcing: StepState = total === 0 ? (running ? "run" : "idle") : judged > 0 || drafts > 0 || !running ? "done" : "run";
  const qualification: StepState = total === 0 ? "idle" : judged >= total ? "done" : judged > 0 || sourcing === "done" ? (running ? "run" : "done") : "idle";
  const redaction: StepState = drafts > 0 ? (running ? "run" : "done") : "idle";
  return [
    { label: "Sourcing", state: sourcing, detail: total ? plural(total, "profil trouvé", "profils trouvés") : sourcing === "run" ? "Recherche en cours" : "Aucun profil" },
    {
      label: "Qualification",
      state: qualification,
      detail: total ? `${judged} sur ${total}` : "En attente",
      ratio: qualification === "run" && total ? judged / total : undefined,
    },
    { label: "Rédaction", state: redaction, detail: drafts ? plural(drafts, "brouillon", "brouillons") : running ? "En attente" : "Aucun brouillon" },
  ];
}

/** Ce qu'une mission produit, mis à jour en direct : avancement, prospects qualifiés, brouillons à valider. */
export function MissionResults({ missionId }: { missionId: string }) {
  const [data, setData] = useState<Results | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/missions/${missionId}/results`, { cache: "no-store" });
    if (r.ok) setData(await r.json());
  }, [missionId]);

  useEffect(() => {
    void load();
    const supabase = supabaseBrowser();
    let t: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(t);
      t = setTimeout(() => void load(), 500);
    };
    const channel = supabase
      .channel(`mission-${missionId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "prospect_ventures", filter: `mission_id=eq.${missionId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "drafts", filter: `mission_id=eq.${missionId}` }, bump)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "missions", filter: `id=eq.${missionId}` }, bump)
      .subscribe();
    return () => {
      clearTimeout(t);
      void supabase.removeChannel(channel);
    };
  }, [missionId, load]);

  if (!data) return null;
  const { competitors, ads } = data.watch;
  const watch = competitors + ads > 0 ? (
    <p className="result-watch">
      <span>
        Veille : {plural(competitors, "concurrent mis à jour", "concurrents mis à jour")}, {plural(ads, "pub enregistrée", "pubs enregistrées")}
      </span>
      <Link href="/veille">Voir la veille</Link>
    </p>
  ) : null;
  if (data.counts.total === 0 && data.drafts.length === 0) return watch;
  const { hot, warm, cold } = data.counts;

  return (
    <>
      {watch}
      <div className="steps" aria-label="Avancement de la mission">
        {stepsOf(data).map((s) => (
          <div key={s.label} className={`step step-${s.state}`}>
            <strong>{s.state === "run" ? <span className="spinner" aria-hidden="true" /> : null}{s.label}</strong>
            <span>{s.detail}</span>
            {s.ratio !== undefined ? <span className="meter"><span style={{ width: `${Math.round(s.ratio * 100)}%` }} /></span> : null}
          </div>
        ))}
      </div>

      {data.prospects.length > 0 ? (
        <div className="result-list">
          <ul>
            {data.prospects.map((p) => (
              <li key={p.id}>
                <div className="who">
                  <Link href={`/prospects/${p.id}`}>{p.full_name}</Link>
                  <small>{[p.headline, p.location].filter(Boolean).join(", ")}</small>
                </div>
                <span className="why">{p.heat_reason}</span>
                {p.heat ? <span className={HEAT_PILL[p.heat]}>{HEAT_LABEL[p.heat]}</span> : null}
              </li>
            ))}
          </ul>
          <p className="result-foot">
            <span>
              {data.counts.qualified} qualifié{data.counts.qualified > 1 ? "s" : ""} sur {data.counts.total}
              {data.counts.qualified ? ` : ${hot} chaud${hot > 1 ? "s" : ""}, ${warm} tiède${warm > 1 ? "s" : ""}, ${cold} froid${cold > 1 ? "s" : ""}` : ""}
              {data.counts.discarded ? `, ${data.counts.discarded} écarté${data.counts.discarded > 1 ? "s" : ""}` : ""}
            </span>
            <Link href="/prospects">Tout voir</Link>
          </p>
        </div>
      ) : null}

      {data.drafts.map((d) => (
        <section key={d.id} className="draft-card" aria-label={`Brouillon pour ${d.prospect?.full_name ?? "un prospect"}`}>
          <div className="row between">
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Brouillon pour {d.prospect?.full_name ?? "un prospect"}</h3>
            <span className={d.status === "approved" ? "pill pill-lime" : d.status === "rejected" ? "pill" : d.status === "sent" ? "pill pill-cold" : "pill pill-warm"}>
              {d.status === "approved" ? "Approuvé" : d.status === "rejected" ? "Rejeté" : d.status === "sent" ? "Envoyé" : "À valider"}
            </span>
          </div>
          {d.status === "pending" && d.approval_id ? (
            <DraftDecision approvalId={d.approval_id} body={d.body} />
          ) : (
            <p className="draft-body">{d.body}</p>
          )}
          {d.status === "approved" ? (
            <div className="row">
              <button type="button" className="btn btn-lime btn-sm" onClick={() => void navigator.clipboard.writeText(d.body)}>Copier le message</button>
              <span className="muted">Envoyez-le depuis LinkedIn, puis marquez le prospect comme contacté.</span>
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}
