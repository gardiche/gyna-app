"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface PilotState {
  status: "active" | "paused";
  total_budget_eur: number;
  target_cost_eur: number | null;
  starts_on: string;
  ends_on: string;
  last_run_on: string | null;
  conversation_id: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const day = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date(`${d}T12:00:00`));

/**
 * Enveloppe du pilotage autonome des pubs Meta : budget total, dates, coût visé.
 * Activer laisse l'agent lancer et piloter ; mettre en pause coupe les campagnes tout de suite.
 */
export function PilotCard({
  ventureId,
  ventureName,
  pilot,
  ready,
  launched,
  guard,
}: {
  ventureId: string;
  ventureName: string;
  pilot: PilotState | null;
  /** Pubs Meta approuvées avec un visuel : celles que l'agent peut lancer. */
  ready: number;
  /** Pubs que l'agent déclare en diffusion. */
  launched: number;
  /** L'app sait lire la dépense et couper les campagnes elle-même. */
  guard: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [budget, setBudget] = useState(pilot ? String(pilot.total_budget_eur) : "");
  const [target, setTarget] = useState(pilot?.target_cost_eur ? String(pilot.target_cost_eur) : "");
  const [from, setFrom] = useState(pilot?.starts_on ?? today());
  const [to, setTo] = useState(pilot?.ends_on ?? "");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const active = pilot?.status === "active";
  const amount = Number(budget.replace(",", "."));
  const cost = target.trim() ? Number(target.replace(",", ".")) : null;
  const valid = amount > 0 && Boolean(from) && Boolean(to) && to >= from && (cost === null || cost > 0);

  const save = (status: "active" | "paused") =>
    start(async () => {
      setMessage(null);
      const r = await fetch("/api/pilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ venture_id: ventureId, status, total_budget_eur: amount, target_cost_eur: cost, starts_on: from, ends_on: to }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string; warning?: string; paused?: number };
      setConfirming(false);
      if (!r.ok) setMessage({ text: body.error ?? "Échec de l'enregistrement.", error: true });
      else if (body.warning) setMessage({ text: `Pilotage en pause, mais les campagnes n'ont pas pu être coupées : ${body.warning}`, error: true });
      else if (body.paused !== undefined) setMessage({ text: `Pilotage en pause. ${body.paused} campagne${body.paused > 1 ? "s" : ""} coupée${body.paused > 1 ? "s" : ""} chez Meta.`, error: false });
      else setMessage({ text: status === "active" ? "Pilotage activé : l'agent fera son premier passage dans les dix minutes, à partir de 8 h." : "Enveloppe enregistrée.", error: false });
      router.refresh();
    });

  return (
    <section className="card card-pad stack" aria-labelledby="pilot-title">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <h2 id="pilot-title" style={{ fontSize: 18, fontWeight: 600 }}>Pilotage automatique sur Meta</h2>
          <span className={active ? "pill pill-hot" : "pill pill-cold"}>{active ? "Actif" : "En pause"}</span>
        </div>
        {pilot?.conversation_id ? <a href={`/c/${pilot.conversation_id}`} className="card-link">Voir les comptes rendus</a> : null}
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        Une fois activé, l'agent Campagnes lance sur Meta les pubs approuvées de {ventureName} et les pilote seul, un passage par jour, sans dépasser cette enveloppe.
        Il ne diffuse que des pubs que vous avez approuvées. {ready} pub{ready > 1 ? "s" : ""} prête{ready > 1 ? "s" : ""} (approuvée{ready > 1 ? "s" : ""}, avec visuel), {launched} en diffusion.
        {pilot?.last_run_on ? ` Dernier passage : ${day(pilot.last_run_on)}.` : ""}
      </p>
      <div className="filters">
        <label className="field">
          Budget total (€)
          <input inputMode="decimal" value={budget} disabled={pending} onChange={(e) => setBudget(e.target.value)} placeholder="600" />
        </label>
        <label className="field">
          Coût visé par pré-inscription (€)
          <input inputMode="decimal" value={target} disabled={pending} onChange={(e) => setTarget(e.target.value)} placeholder="30" />
        </label>
        <label className="field">
          Du
          <input type="date" value={from} disabled={pending} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          au
          <input type="date" value={to} disabled={pending} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {guard ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Toutes les dix minutes, l'app relit la dépense du compte publicitaire : si l'enveloppe est atteinte ou la période finie, elle met tout en pause elle-même.
        </p>
      ) : (
        <p className="notice">
          Le compte publicitaire n'est pas encore relié à l'app (variable META_AD_ACCOUNT_ID) : elle ne peut ni relire la dépense ni couper les campagnes elle-même.
          Fixez d'abord le plafond de dépenses du compte dans Meta, c'est la seule limite sûre.
        </p>
      )}
      {confirming ? (
        <div className="row">
          <span style={{ fontSize: 13 }}>
            Activer : l'agent pourra dépenser jusqu'à {amount.toFixed(2)} € sur Meta, du {day(from)} au {day(to)}, sans autre validation. Confirmer ?
          </span>
          <button type="button" className="btn btn-dark btn-sm" disabled={pending} onClick={() => save("active")}>{pending ? "Activation…" : "Confirmer"}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setConfirming(false)}>Annuler</button>
        </div>
      ) : (
        <div className="row">
          {active ? (
            <>
              <button type="button" className="btn btn-dark btn-sm" disabled={pending} onClick={() => save("paused")}>{pending ? "Mise en pause…" : "Tout mettre en pause"}</button>
              <button type="button" className="btn btn-sm" disabled={pending || !valid} onClick={() => save("active")}>Enregistrer les changements</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-dark btn-sm" disabled={pending || !valid} onClick={() => setConfirming(true)}>Activer le pilotage</button>
              <button type="button" className="btn btn-sm" disabled={pending || !valid} onClick={() => save("paused")}>Enregistrer sans activer</button>
            </>
          )}
        </div>
      )}
      {message ? <span className={message.error ? "pub-count is-over" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</span> : null}
    </section>
  );
}
