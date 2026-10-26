"use client";
import { useState } from "react";
import type { ReportAd } from "@/lib/pilot-report";
import { Drawer } from "./Drawer";
import { AdDetail, type AdRow } from "./AdDetail";
import type { Asset } from "./AssetLibrary";

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const int = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));
const pct = (a: number, b: number) => (b ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format((a / b) * 100)} %` : "–");
const day = (d: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`));

export const META_STATUS: Record<string, string> = {
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

/** Une pub du compte publicitaire, avec sa fiche dans l'app quand c'est l'agent qui l'a créée. */
export interface PilotAdRow { report: ReportAd; mine: { ref: string; headline: string | null; ad: AdRow } | null }

/** Vidéo de la pub chez Meta : lue ici si Meta donne le fichier, sinon l'image et un lien vers Facebook. */
function Video({ video }: { video: NonNullable<ReportAd["video"]> }) {
  return (
    <div className="video-box">
      {video.source ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video className="pub-video" controls playsInline preload="metadata" poster={video.thumbnail ?? undefined} src={video.source} />
      ) : video.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pub-image" src={video.thumbnail} alt="Aperçu de la vidéo" />
      ) : null}
      <div className="row between" style={{ fontSize: 12 }}>
        <span className="muted">Vidéo diffusée chez Meta{video.seconds ? `, ${video.seconds} s` : ""}{video.source ? "" : ", lecture indisponible ici"}</span>
        {video.link ? <a href={video.link} target="_blank" rel="noreferrer" className="card-link">Ouvrir sur Facebook</a> : null}
      </div>
    </div>
  );
}

/** Chiffres d'une pub : ceux de Meta sur la période de l'enveloppe, puis jour par jour. */
function Figures({ report }: { report: ReportAd }) {
  return (
    <section className="detail-sec" aria-label="Résultats de la pub">
      <div className="row between">
        <h3>Résultats chez Meta</h3>
        <span className={statusClass(report.status)}>{META_STATUS[report.status] ?? report.status}</span>
      </div>
      {report.video ? <Video video={report.video} /> : null}
      <div className="figure-grid">
        <div><span>Dépensé</span><strong className="tabular">{eur(report.spend)}</strong></div>
        <div><span>Affichages</span><strong className="tabular">{int(report.impressions)}</strong></div>
        <div><span>Clics</span><strong className="tabular">{int(report.clicks)}</strong><small>{pct(report.clicks, report.impressions)} de taux de clic</small></div>
        <div><span>Pré-inscriptions</span><strong className="tabular">{int(report.leads)}</strong></div>
        <div><span>Coût par pré-inscription</span><strong className="tabular">{report.leads ? eur(report.spend / report.leads) : "–"}</strong></div>
      </div>
      {report.days.length ? (
        <details className="comp-details">
          <summary>Jour par jour</summary>
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 460 }}>
              <thead><tr><th scope="col">Jour</th><th scope="col">Dépensé</th><th scope="col">Affichages</th><th scope="col">Clics</th><th scope="col">Pré-inscr.</th></tr></thead>
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
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>Pas de résultat jour par jour pour l'instant.</p>
      )}
    </section>
  );
}

/**
 * Résultats par pub du suivi de campagne. Un clic sur une pub ouvre sa fiche (le même détail que la page Pubs),
 * avec ses chiffres ; `readOnly` retire toute action (invité en lecture seule).
 */
export function PilotAds({ rows, assets, readOnly }: { rows: PilotAdRow[]; assets: Asset[]; readOnly: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const current = rows.find((r) => r.report.id === open) ?? null;

  return (
    <>
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
            {rows.map(({ report: a, mine }) => (
              <tr key={a.id}>
                <td>
                  <button type="button" className="row-open" aria-haspopup="dialog" onClick={() => setOpen(a.id)}>
                    <strong>{mine?.headline ?? a.name}</strong>
                    <small>{mine ? `Pub ${mine.ref}` : "Créée hors de l'app"}{a.video ? " · Vidéo" : ""}</small>
                  </button>
                </td>
                <td><span className={statusClass(a.status)}>{META_STATUS[a.status] ?? a.status}</span></td>
                <td className="tabular">{eur(a.spend)}</td>
                <td className="tabular">{int(a.impressions)}</td>
                <td className="tabular">{int(a.clicks)}</td>
                <td className="tabular">{pct(a.clicks, a.impressions)}</td>
                <td className="tabular">{int(a.leads)}</td>
                <td className="tabular">{a.leads ? eur(a.spend / a.leads) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current ? (
        <Drawer
          label={current.mine?.headline ?? current.report.name}
          onClose={() => setOpen(null)}
          head={
            <>
              <span className={statusClass(current.report.status)}>{META_STATUS[current.report.status] ?? current.report.status}</span>
              {current.mine ? <span className="pill pill-lavender">{current.mine.ad.angle}</span> : <span className="pill">Créée hors de l'app</span>}
            </>
          }
        >
          {current.mine ? (
            <AdDetail ad={current.mine.ad} platform="meta" assets={assets} readOnly={readOnly} extra={<Figures report={current.report} />} />
          ) : (
            <div className="drawer-body">
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>{current.report.name}</h3>
              <Figures report={current.report} />
            </div>
          )}
        </Drawer>
      ) : null}
    </>
  );
}
