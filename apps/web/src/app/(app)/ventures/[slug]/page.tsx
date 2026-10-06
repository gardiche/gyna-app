import { notFound, redirect } from "next/navigation";
import { BriefContent } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { addSegment, deleteSegment, saveBrief, updateVenture } from "../actions";

export const dynamic = "force-dynamic";

const FIELDS: Array<{ key: keyof BriefContent; label: string; hint: string }> = [
  { key: "persona", label: "Persona", hint: "Qui vise-t-on ? Métier, situation, territoire." },
  { key: "offre", label: "Offre", hint: "Ce qu'on propose, format, dates, prix." },
  { key: "promesse", label: "Promesse", hint: "Ce que la personne y gagne, en une phrase." },
  { key: "objections", label: "Objections", hint: "Ce qui freine, et comment y répondre." },
  { key: "ton", label: "Ton", hint: "Comment on parle : vouvoiement, registre, longueur." },
  { key: "signaux_chauds", label: "Signaux chauds", hint: "Ce qui, dans un post ou un commentaire, rend un prospect chaud." },
  { key: "interdits", label: "Interdits", hint: "Ce que Gyna ne doit jamais faire ni promettre." },
];

const fmt = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export default async function VenturePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { slug } = await params;
  const { ok } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;

  const { data: v } = await db.from("ventures").select("id, name, slug, status, enrollment_goal").eq("slug", slug).maybeSingle();
  if (!v) notFound();
  const [{ data: briefs }, { data: segments }] = await Promise.all([
    db.from("briefs").select("id, version, content, recency_days, created_at").eq("venture_id", v.id).order("version", { ascending: false }).limit(20),
    db.from("segments").select("id, name, criteria").eq("venture_id", v.id).order("name"),
  ]);
  const current = briefs?.[0];
  const content = BriefContent.parse(current?.content ?? {});

  return (
    <>
      <div>
        <h1 className="page-title">{v.name}</h1>
        <p className="page-sub">Brief GTM, version {current?.version ?? 0}. Chaque enregistrement crée une nouvelle version.</p>
      </div>
      {ok ? <p className="notice" role="status">{ok === "brief" ? "Nouvelle version du brief enregistrée." : "Venture mise à jour."}</p> : null}

      <div className="workspace">
        <form action={saveBrief} className="card card-pad card-main stack">
          <input type="hidden" name="venture_id" value={v.id} />
          <input type="hidden" name="slug" value={v.slug} />
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Brief GTM</h2>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key} className="field full">
                <span><strong style={{ color: "var(--ink)" }}>{f.label}</strong>, {f.hint.charAt(0).toLowerCase() + f.hint.slice(1)}</span>
                <textarea name={f.key} defaultValue={content[f.key]} />
              </label>
            ))}
            <label className="field">
              Fenêtre d'analyse des signaux (jours)
              <input type="number" name="recency_days" min={1} max={365} defaultValue={current?.recency_days ?? 60} />
            </label>
          </div>
          <div className="row"><button type="submit" className="btn btn-dark">Enregistrer une nouvelle version</button></div>
        </form>

        <aside>
          <form action={updateVenture} className="card-lavender">
            <input type="hidden" name="venture_id" value={v.id} />
            <input type="hidden" name="slug" value={v.slug} />
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Venture</h2>
            <label className="field" style={{ color: "var(--ink)" }}>Nom<input name="name" defaultValue={v.name} required /></label>
            <label className="field" style={{ color: "var(--ink)" }}>Objectif<input name="goal" defaultValue={v.enrollment_goal ?? ""} /></label>
            <label className="field" style={{ color: "var(--ink)" }}>
              Statut
              <select name="status" defaultValue={v.status}>
                <option value="active">Active</option>
                <option value="paused">En pause</option>
                <option value="archived">Archivée</option>
              </select>
            </label>
            <button type="submit" className="btn btn-dark">Mettre à jour</button>
          </form>

          <section className="card card-pad stack">
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Segments</h2>
            {(segments ?? []).map((s) => (
              <form key={s.id} action={deleteSegment} className="row between">
                <input type="hidden" name="segment_id" value={s.id} />
                <input type="hidden" name="slug" value={v.slug} />
                <span style={{ fontSize: 14 }}><strong>{s.name}</strong>{(s.criteria as any)?.description ? `, ${(s.criteria as any).description}` : ""}</span>
                <button type="submit" className="btn btn-ghost btn-sm">Retirer</button>
              </form>
            ))}
            <form action={addSegment} className="stack" style={{ gap: 10 }}>
              <input type="hidden" name="venture_id" value={v.id} />
              <input type="hidden" name="slug" value={v.slug} />
              <label className="field">Nom du segment<input name="name" required /></label>
              <label className="field">Critères<input name="criteria" placeholder="Par exemple : en reconversion, Chambéry et alentours" /></label>
              <button type="submit" className="btn btn-sm">Ajouter</button>
            </form>
          </section>

          <section className="card card-pad stack">
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Versions du brief</h2>
            <ol className="stack" style={{ margin: 0, paddingLeft: 18, gap: 6, fontSize: 14 }}>
              {(briefs ?? []).map((b) => <li key={b.id}>Version {b.version}, {fmt(b.created_at)}</li>)}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
