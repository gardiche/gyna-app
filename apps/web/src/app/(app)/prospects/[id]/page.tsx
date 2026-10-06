import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Heat, ProspectStatus } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { HeatGauge, HeatLabel, StatusPill } from "@/components/heat";
import { deleteProspect, setProspectStatus } from "../actions";

export const dynamic = "force-dynamic";

const NEXT_STEPS: Array<{ status: ProspectStatus; label: string }> = [
  { status: "contacted", label: "Marquer contacté" },
  { status: "replied", label: "A répondu" },
  { status: "enrolled", label: "Inscrit" },
  { status: "discarded", label: "Écarter" },
];

const fmt = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d));

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;

  const { data: p } = await db
    .from("prospects")
    .select("id, full_name, headline, location, linkedin_url, created_at, accounts(name)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const [{ data: links }, { data: signals }] = await Promise.all([
    db
      .from("prospect_ventures")
      .select("id, status, heat, heat_reason, qualified_at, contacted_at, ventures(name, slug), drafts(id, body, status, created_at)")
      .eq("prospect_id", id),
    db.from("signals").select("id, kind, url, excerpt, published_at").eq("prospect_id", id).order("published_at", { ascending: false }),
  ]);

  const company = (p.accounts as unknown as { name: string } | null)?.name;
  const KIND: Record<string, string> = { post: "Post", comment: "Commentaire", event: "Événement" };

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="page-title">{p.full_name}</h1>
          <p className="page-sub">{[p.headline, company, p.location].filter(Boolean).join(", ")}</p>
        </div>
        <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="btn">Profil LinkedIn</a>
      </div>

      <div className="workspace">
        <div className="card-main stack" style={{ gap: 20 }}>
          {(links ?? []).map((l: any) => (
            <section key={l.id} className="card card-pad stack">
              <div className="row between">
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>{l.ventures.name}</h2>
                <StatusPill status={l.status} />
              </div>
              <div className="row" style={{ gap: 16 }}>
                <HeatGauge heat={l.heat as Heat | null} large />
                <HeatLabel heat={l.heat as Heat | null} />
              </div>
              {l.heat_reason ? <p style={{ fontSize: 15, lineHeight: 1.55 }}>{l.heat_reason}</p> : null}
              {(l.drafts ?? []).map((d: any) => (
                <div key={d.id} className="draft-card">
                  <div className="row between">
                    <strong style={{ fontSize: 14 }}>Brouillon du {fmt(d.created_at)}</strong>
                    <span className="pill">{{ pending: "À valider", approved: "Approuvé", rejected: "Rejeté", sent: "Envoyé" }[d.status as string]}</span>
                  </div>
                  <p className="draft-body">{d.body}</p>
                </div>
              ))}
              <div className="row">
                {NEXT_STEPS.filter((s) => s.status !== l.status).map((s) => (
                  <form key={s.status} action={setProspectStatus}>
                    <input type="hidden" name="pv_id" value={l.id} />
                    <input type="hidden" name="prospect_id" value={p.id} />
                    <input type="hidden" name="status" value={s.status} />
                    <button type="submit" className={s.status === "contacted" ? "btn btn-dark btn-sm" : "btn btn-sm"}>{s.label}</button>
                  </form>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside>
          <section className="card-lavender">
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Signaux récents</h2>
            {(signals ?? []).length === 0 ? <p style={{ fontSize: 14 }}>Aucun signal enregistré.</p> : null}
            {(signals ?? []).map((s) => (
              <div key={s.id} className="inset" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="row between">
                  <span className="pill">{KIND[s.kind] ?? s.kind}</span>
                  <span style={{ fontSize: 12 }}>{fmt(s.published_at)}</span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.5 }}>« {s.excerpt} »</p>
                <a href={s.url} target="_blank" rel="noreferrer" className="card-link">Voir la source</a>
              </div>
            ))}
          </section>
          <section className="card card-pad stack">
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Données personnelles</h2>
            <p className="muted">Ajouté le {fmt(p.created_at)}. Supprimé automatiquement après 12 mois sans interaction.</p>
            <form action={deleteProspect}>
              <input type="hidden" name="prospect_id" value={p.id} />
              <button type="submit" className="btn btn-sm" style={{ color: "var(--danger)" }}>Supprimer ce prospect</button>
            </form>
          </section>
          <Link href="/prospects" className="on-shell-muted" style={{ fontSize: 14 }}>Retour aux prospects</Link>
        </aside>
      </div>
    </>
  );
}
