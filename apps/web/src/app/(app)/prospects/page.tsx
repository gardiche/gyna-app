import Link from "next/link";
import { redirect } from "next/navigation";
import { HEAT, HEAT_LABEL, PROSPECT_STATUS, STATUS_LABEL, type Heat, type ProspectStatus } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import { HeatLabel, StatusPill } from "@/components/heat";

export const dynamic = "force-dynamic";

type SP = { venture?: string; heat?: string; status?: string; q?: string };

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);

  let q = db
    .from("prospect_ventures")
    .select("id, status, heat, heat_reason, updated_at, ventures!inner(slug, name), prospects!inner(id, full_name, headline, location)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (sp.venture) q = q.eq("ventures.slug", sp.venture);
  if (sp.heat && (HEAT as readonly string[]).includes(sp.heat)) q = q.eq("heat", sp.heat);
  if (sp.status && (PROSPECT_STATUS as readonly string[]).includes(sp.status)) q = q.eq("status", sp.status);
  else q = q.neq("status", "discarded");
  if (sp.q) q = q.ilike("prospects.full_name", `%${sp.q.replace(/[%_]/g, "")}%`);
  const { data: rows, error } = await q;

  const heatOrder: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
  const list = (rows ?? []).slice().sort((a: any, b: any) => (heatOrder[a.heat] ?? 3) - (heatOrder[b.heat] ?? 3));

  return (
    <>
      <div>
        <h1 className="page-title">Prospects</h1>
        <p className="page-sub">Tous les prospects trouvés par Gyna, les plus chauds d'abord.</p>
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
              {PROSPECT_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="field">
            Nom
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Rechercher" />
          </label>
          <button type="submit" className="btn btn-dark">Filtrer</button>
        </form>

        {error ? <p className="notice notice-error">{error.message}</p> : null}
        {list.length === 0 ? (
          <p className="empty">Aucun prospect pour ces filtres. Demandez à Gyna d'en trouver depuis le chat.</p>
        ) : (
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 720 }}>
              <thead>
                <tr><th scope="col">Nom</th><th scope="col">Venture</th><th scope="col">Pourquoi</th><th scope="col">Chaleur</th><th scope="col">Statut</th></tr>
              </thead>
              <tbody>
                {list.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/prospects/${r.prospects.id}`}><strong>{r.prospects.full_name}</strong></Link>
                      <small>{[r.prospects.headline, r.prospects.location].filter(Boolean).join(", ")}</small>
                    </td>
                    <td>{r.ventures.name}</td>
                    <td style={{ maxWidth: 320, color: "#3a4152" }}>{r.heat_reason ?? <span className="muted">À qualifier</span>}</td>
                    <td><HeatLabel heat={r.heat as Heat | null} /></td>
                    <td><StatusPill status={r.status as ProspectStatus} /></td>
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
