import Link from "next/link";
import { redirect } from "next/navigation";
import { FIT, FIT_LABEL, HEAT, HEAT_LABEL, PROSPECT_STATUS, STATUS_LABEL, type Heat, type ProspectStatus } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import { HeatLabel, StatusPill } from "@/components/heat";

export const dynamic = "force-dynamic";

type SP = { venture?: string; heat?: string; status?: string; fit?: string; q?: string; from?: string; to?: string };

const DAY = /^d{4}-d{2}-d{2}$/;
const foundOn = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(d));

/** Minuit à Paris du jour donné (AAAA-MM-JJ), pour filtrer sur des journées telles que les associés les vivent. */
function parisMidnight(day: string): Date {
  const utc = new Date(`${day}T00:00:00Z`);
  const shift = new Date(utc.toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime() - new Date(utc.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(utc.getTime() - shift);
}

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);

  let q = db
    .from("prospect_ventures")
    .select("id, status, heat, heat_reason, fit, fit_reason, discarded_reason, created_at, updated_at, ventures!inner(slug, name), prospects!inner(id, full_name, headline, location)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (sp.venture) q = q.eq("ventures.slug", sp.venture);
  if (sp.heat && (HEAT as readonly string[]).includes(sp.heat)) q = q.eq("heat", sp.heat);
  if (sp.fit === "none") q = q.is("fit", null);
  else if (sp.fit && (FIT as readonly string[]).includes(sp.fit)) q = q.eq("fit", sp.fit);
  if (sp.status && (PROSPECT_STATUS as readonly string[]).includes(sp.status)) q = q.eq("status", sp.status);
  else q = q.neq("status", "discarded");
  if (sp.q) q = q.ilike("prospects.full_name", `%${sp.q.replace(/[%_]/g, "")}%`);
  const from = sp.from && DAY.test(sp.from) ? sp.from : "";
  const to = sp.to && DAY.test(sp.to) ? sp.to : "";
  if (from) q = q.gte("created_at", parisMidnight(from).toISOString());
  if (to) q = q.lt("created_at", new Date(parisMidnight(to).getTime() + 86_400_000).toISOString());
  const { data: rows, error } = await q;

  const heatOrder: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
  // Les mieux placés d'abord : adéquation (A, B, C, non trié), puis chaleur.
  const fitOrder: Record<string, number> = { A: 0, B: 1, C: 2 };
  const list = (rows ?? []).slice().sort((a: any, b: any) => (fitOrder[a.fit] ?? 3) - (fitOrder[b.fit] ?? 3) || (heatOrder[a.heat] ?? 3) - (heatOrder[b.heat] ?? 3));

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
        </form>

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
