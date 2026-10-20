import Link from "next/link";
import { redirect } from "next/navigation";
import { FIT, FIT_LABEL, HEAT, HEAT_LABEL, PROSPECT_STATUS, STATUS_LABEL, type Heat, type ProspectStatus } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import { dayRange, prospectsQuery, PROSPECTS_PAGE_LIMIT, sortProspects, type ProspectFilters } from "@/lib/prospects-query";
import { HeatLabel, StatusPill } from "@/components/heat";

export const dynamic = "force-dynamic";

const foundOn = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(d));

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<ProspectFilters> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);

  const { data: rows, error } = await prospectsQuery(db, sp, PROSPECTS_PAGE_LIMIT);
  const { from, to } = dayRange(sp);
  const list = sortProspects((rows ?? []) as any[]);
  // L'export reprend exactement les filtres affichés.
  const exportParams = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string" && v) as [string, string][]);
  const exportHref = `/api/prospects/export${exportParams.size ? `?${exportParams}` : ""}`;

  return (
    <>
      <div>
        <h1 className="page-title">Prospects</h1>
        <p className="page-sub">Tous les prospects trouvés par Gyna, les mieux placés d'abord : adéquation au persona (posée au tri), puis chaleur (posée à la qualification fine).</p>
      </div>
      <section className="card card-pad stack">
        <form className="filters" method="get">
          <label className="field">
            Venture
            <select name="venture" defaultValue={sp.venture ?? ""}>
              <option value="">Toutes</option>
              {ventures.map((v) => <option key={v.id} value={v.slug}>{v.name}</option>)}
            </select>
          </label>
          <label className="field">
            Adéquation
            <select name="fit" defaultValue={sp.fit ?? ""}>
              <option value="">Toutes</option>
              {FIT.map((f) => <option key={f} value={f}>{FIT_LABEL[f]}</option>)}
              <option value="none">Pas encore trié</option>
            </select>
          </label>
          <label className="field">
            Chaleur
            <select name="heat" defaultValue={sp.heat ?? ""}>
              <option value="">Toutes</option>
              {HEAT.map((h) => <option key={h} value={h}>{HEAT_LABEL[h]}</option>)}
            </select>
          </label>
          <label className="field">
            Statut
            <select name="status" defaultValue={sp.status ?? ""}>
              <option value="">Tous sauf écartés</option>
              <option value="all">Tous, écartés compris</option>
              {PROSPECT_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="field">
            Nom
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Rechercher" />
          </label>
          <label className="field">
            Trouvé du
            <input type="date" name="from" defaultValue={from} />
          </label>
          <label className="field">
            au
            <input type="date" name="to" defaultValue={to} />
          </label>
          <button type="submit" className="btn btn-dark">Filtrer</button>
          <a href={exportHref} className="btn btn-ghost" download>Exporter en CSV</a>
        </form>
        {list.length >= PROSPECTS_PAGE_LIMIT ? (
          <p className="muted" style={{ fontSize: 13 }}>Seuls les {PROSPECTS_PAGE_LIMIT} premiers s'affichent ; l'export contient tous les prospects de ces filtres.</p>
        ) : null}

        {error ? <p className="notice notice-error">{error.message}</p> : null}
        {list.length === 0 ? (
          <p className="empty">Aucun prospect pour ces filtres. Demandez à Gyna d'en trouver depuis le chat.</p>
        ) : (
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 900 }}>
              <thead>
                <tr><th scope="col">Nom</th><th scope="col">Venture</th><th scope="col">Adéquation</th><th scope="col">Pourquoi</th><th scope="col">Chaleur</th><th scope="col">Statut</th><th scope="col">Trouvé le</th></tr>
              </thead>
              <tbody>
                {list.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/prospects/${r.prospects.id}`}><strong>{r.prospects.full_name}</strong></Link>
                      <small>{[r.prospects.headline, r.prospects.location].filter(Boolean).join(", ")}</small>
                    </td>
                    <td>{r.ventures.name}</td>
                    <td>{r.fit ? <span className={r.fit === "A" ? "pill pill-lime" : r.fit === "B" ? "pill pill-lavender" : "pill"} title={r.fit_reason ?? undefined}>{r.fit}</span> : <span className="muted">Non trié</span>}</td>
                    <td style={{ maxWidth: 320, color: "#3a4152" }}>{r.heat_reason ?? r.fit_reason ?? r.discarded_reason ?? <span className="muted">À trier</span>}</td>
                    <td><HeatLabel heat={r.heat as Heat | null} /></td>
                    <td><StatusPill status={r.status as ProspectStatus} /></td>
                    <td style={{ whiteSpace: "nowrap" }}>{foundOn(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
