import type { PilotReport } from "@/lib/pilot-report";

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const int = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));
const pct = (a: number, b: number) => (b ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format((a / b) * 100)} %` : "–");
const day = (d: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`));
const time = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

const STATUS: Record<string, string> = {
  ACTIVE: "En diffusion",
  PAUSED: "En pause",
  CAMPAIGN_PAUSED: "En pause",
  ADSET_PAUSED: "En pause",
  PENDING_REVIEW: "En cours d'examen",
  IN_PROCESS: "En préparation",
  DISAPPROVED: "Refusée par Meta",
  WITH_ISSUES: "Problème à régler",
  PENDING_BILLING_INFO: "Paiement à régler",
  ARCHIVED: "Archivée",
  DELETED: "Supprimée",
};
const statusClass = (s: string) => (s === "ACTIVE" ? "pill pill-lime" : s === "DISAPPROVED" || s === "WITH_ISSUES" || s === "PENDING_BILLING_INFO" ? "pill pill-hot" : s === "PENDING_REVIEW" || s === "IN_PROCESS" ? "pill pill-warm" : "pill");

export interface DashboardAd { external_id: string | null; headline: string | null; ref: string }
export interface DashboardAction { id: string; created_at: string; result_summary: string; status: string }

/**
 * Suivi d'une campagne pilotée par l'agent : ce que Meta rapporte (dépense, diffusion, pré-inscriptions),
 * pub par pub et jour par jour, et les derniers gestes de l'agent. Les chiffres sont ceux de Meta, relus à chaque affichage.
 */
export function PilotDashboard({
  report,
  budget,
  target,
  daysLeft,
  ads,
  actions,
}: {
  report: PilotReport;
  budget: number;
  target: number | null;
  daysLeft: number;
  ads: DashboardAd[];
  actions: DashboardAction[];
}) {
  const used = budget ? Math.min(report.spend / budget, 1) : 0;
  const cost = report.leads ? report.spend / report.leads : null;
  const dailyBudget = report.campaigns.filter((c) => c.status === "ACTIVE").reduce((n, c) => n + (c.dailyBudget ?? 0), 0);
  const ours = new Map(ads.filter((a) => a.external_id).map((a) => [a.external_id!, a]));

  return (
    <section className="card card-pad stack" aria-labelledby="dash-title">
      <div className="card-head">
        <h2 id="dash-title" style={{ fontSize: 18, fontWeight: 600 }}>Suivi de la campagne</h2>
        <span className="muted" style={{ fontSize: 12 }}>Chiffres de Meta, relus à l'ouverture de la page. Ils ont souvent quelques heures de retard.</span>
      </div>

      <ul className="calendar" aria-label="Accès de l'agent au compte publicitaire">
        {([
          ["Page Facebook", report.access.pages, (v: string[]) => v.join(", ")],
          ["Pixel", report.access.pixels, (v: Array<{ name: string; lastFired: string | null }>) => v.map((p) => `${p.name}${p.lastFired ? `, dernier événement reçu le ${time(p.lastFired)}` : ", aucun événement reçu"}`).join(" ; ")],
          ["Compte Instagram", report.access.instagram, (v: string[]) => v.map((u) => `@${u}`).join(", ")],
        ] as Array<[string, any[] | null, (v: any) => string]>).map(([label, value, show]) => (
          <li key={label}>
            <span>{label}</span>
            <span className={value?.length ? "pill pill-lime" : "pill pill-hot"}>{value === null ? "Meta n'a pas répondu" : value.length ? "Accessible" : "Introuvable"}</span>
            <span style={{ flex: "1 1 280px" }} className="muted">{value?.length ? show(value) : label === "Compte Instagram" ? "Sans lui, les pubs passent au nom de la Page." : "L'agent ne peut rien lancer sans cet accès : vérifiez les éléments attribués à l'utilisateur système Gyna."}</span>
          </li>
        ))}
      </ul>

      <div className="stats">
        <div className="stat">
          <span>Dépensé sur l'enveloppe</span>
          <strong className="tabular">{eur(report.spend)}</strong>
          <span className="meter" role="img" aria-label={`${Math.round(used * 100)} % de l'enveloppe dépensés`}><span style={{ width: `${used * 100}%` }} /></span>
          <span>sur {eur(budget)}, reste {eur(Math.max(budget - report.spend, 0))}</span>
        </div>
        <div className="stat">
          <span>Pré-inscriptions (Meta)</span>
          <strong className="tabular">{int(report.leads)}</strong>
          <span>Le site fait foi : Meta ne compte pas les visiteurs qui refusent les cookies.</span>
        </div>
        <div className="stat">
          <span>Coût par pré-inscription</span>
          <strong className="tabular">{cost === null ? "–" : eur(cost)}</strong>
          <span>{target ? `visé : ${eur(target)}` : "aucun coût visé"}</span>
        </div>
        <div className="stat">
          <span>Budget par jour en place</span>
          <strong className="tabular">{dailyBudget ? eur(dailyBudget) : "–"}</strong>
          <span>{daysLeft > 0 ? `maximum ${eur(Math.max(budget - report.spend, 0) / daysLeft)} (reste ÷ ${daysLeft} jour${daysLeft > 1 ? "s" : ""})` : "période terminée"}</span>
        </div>
        <div className="stat">
          <span>Affichages et clics</span>
          <strong className="tabular">{int(report.impressions)}</strong>
          <span>{int(report.clicks)} clic{report.clicks > 1 ? "s" : ""} vers le site, taux de clic {pct(report.clicks, report.impressions)}</span>
        </div>
      </div>

      {report.campaigns.length ? (
        <div className="row" style={{ gap: 8 }}>
          {report.campaigns.map((c) => (
            <span key={c.id} className={statusClass(c.status)}>{c.name} : {STATUS[c.status] ?? c.status}{c.dailyBudget ? `, ${eur(c.dailyBudget)} par jour` : ""}</span>
          ))}
        </div>
      ) : (
        <p className="muted">Aucune campagne sur le compte publicitaire pour l'instant : l'agent n'a pas encore fait son premier passage, ou il n'a rien pu créer.</p>
      )}

      {report.ads.length ? (
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 760 }}>
            <caption className="sr-only">Résultats par pub</caption>
            <thead>
              <tr>
                <th scope="col">Pub</th><th scope="col">État chez Meta</th><th scope="col">Dépensé</th><th scope="col">Affichages</th>
                <th scope="col">Clics</th><th scope="col">Taux de clic</th><th scope="col">Pré-inscriptions</th><th scope="col">Coût</th>
              </tr>
            </thead>
            <tbody>
              {report.ads.map((a) => {
                const mine = ours.get(a.id);
                return (
                  <tr key={a.id}>
                    <td>
                      <strong>{mine?.headline ?? a.name}</strong>
                      <small>{mine ? `Pub ${mine.ref}` : "Créée hors de l'app"}</small>
                    </td>
                    <td><span className={statusClass(a.status)}>{STATUS[a.status] ?? a.status}</span></td>
                    <td className="tabular">{eur(a.spend)}</td>
                    <td className="tabular">{int(a.impressions)}</td>
                    <td className="tabular">{int(a.clicks)}</td>
                    <td className="tabular">{pct(a.clicks, a.impressions)}</td>
                    <td className="tabular">{int(a.leads)}</td>
                    <td className="tabular">{a.leads ? eur(a.spend / a.leads) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {report.days.length ? (
        <details className="comp-details">
          <summary>Jour par jour</summary>
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 520 }}>
              <thead><tr><th scope="col">Jour</th><th scope="col">Dépensé</th><th scope="col">Affichages</th><th scope="col">Clics</th><th scope="col">Pré-inscriptions</th></tr></thead>
              <tbody>
                {report.days.map((d) => (
                  <tr key={d.date}>
                    <td>{day(d.date)}</td><td className="tabular">{eur(d.spend)}</td><td className="tabular">{int(d.impressions)}</td>
                    <td className="tabular">{int(d.clicks)}</td><td className="tabular">{int(d.leads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <div className="stack" style={{ gap: 6 }}>
        <strong style={{ fontSize: 13 }}>Derniers gestes de l'agent</strong>
        {actions.length ? (
          <ul className="calendar">
            {actions.map((a) => (
              <li key={a.id}>
                <span className="tabular" style={{ minWidth: 120, fontWeight: 500 }}>{time(a.created_at)}</span>
                <span style={{ flex: "1 1 320px", color: a.status === "error" ? "var(--danger)" : undefined }}>{a.result_summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Rien pour l'instant.</p>
        )}
      </div>
    </section>
  );
}
