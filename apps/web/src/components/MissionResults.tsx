"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Heat, ProspectStatus } from "@gyna/schemas";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { HeatLabel, StatusPill } from "./heat";
import { ApproveButton } from "./ApproveButton";

interface Results {
  counts: { total: number; qualified: number; to_review: number; discarded: number };
  prospects: Array<{ id: string; full_name: string; headline: string | null; location: string | null; status: ProspectStatus; heat: Heat | null; heat_reason: string | null }>;
  drafts: Array<{ id: string; body: string; status: string; prospect: { id: string; full_name: string } | null; approval_id: string | null }>;
}

/** Cartes produites par une mission, mises à jour en direct pendant que les agents travaillent. */
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
      .channel(`mission-${missionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "prospect_ventures", filter: `mission_id=eq.${missionId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "drafts", filter: `mission_id=eq.${missionId}` }, bump)
      .subscribe();
    return () => {
      clearTimeout(t);
      void supabase.removeChannel(channel);
    };
  }, [missionId, load]);

  if (!data || (data.counts.total === 0 && data.drafts.length === 0)) return null;

  return (
    <>
      {data.prospects.length > 0 ? (
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 560 }}>
            <caption className="sr-only">Prospects qualifiés par cette mission</caption>
            <thead>
              <tr><th scope="col">Nom</th><th scope="col">Pourquoi</th><th scope="col">Chaleur</th><th scope="col">Statut</th></tr>
            </thead>
            <tbody>
              {data.prospects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/prospects/${p.id}`}><strong>{p.full_name}</strong></Link>
                    <small>{[p.headline, p.location].filter(Boolean).join(", ")}</small>
                  </td>
                  <td style={{ color: "#3a4152", maxWidth: 280 }}>{p.heat_reason}</td>
                  <td><HeatLabel heat={p.heat} /></td>
                  <td><StatusPill status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
            {data.counts.total} prospect(s) ajouté(s) : {data.counts.qualified} qualifié(s), {data.counts.to_review} à examiner, {data.counts.discarded} écarté(s).{" "}
            <Link href="/prospects" style={{ fontWeight: 600 }}>Voir tous les prospects</Link>
          </p>
        </div>
      ) : null}

      {data.drafts.map((d) => (
        <section key={d.id} className="draft-card" aria-label={`Brouillon pour ${d.prospect?.full_name ?? "un prospect"}`}>
          <div className="row between">
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Brouillon pour {d.prospect?.full_name ?? "un prospect"}</h3>
            <span className={d.status === "approved" ? "pill pill-lime" : d.status === "rejected" ? "pill" : "pill pill-warm"}>
              {d.status === "approved" ? "Brouillon approuvé" : d.status === "rejected" ? "Rejeté" : d.status === "sent" ? "Envoyé" : "À valider"}
            </span>
          </div>
          <p className="draft-body">{d.body}</p>
          {d.status === "pending" && d.approval_id ? (
            <div className="row"><ApproveButton approvalId={d.approval_id} withReject onDone={() => void load()} /></div>
          ) : d.status === "approved" ? (
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
