import { notFound, redirect } from "next/navigation";
import { BrandKitContent, BriefContent, LOGO_CORNERS, LOGO_CORNER_LABEL } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { formatsText, mentionsText, paletteText } from "@/lib/brand-kit";
import { addSegment, deleteSegment, saveBrandKit, saveBrief, updateVenture } from "../actions";

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

  const { data: v } = await db.from("ventures").select("id, name, slug, status, enrollment_goal, brevo_list_id").eq("slug", slug).maybeSingle();
  if (!v) notFound();
  const [{ data: briefs }, { data: segments }, { data: kits }, { data: logos }] = await Promise.all([
    db.from("briefs").select("id, version, content, recency_days, created_at").eq("venture_id", v.id).order("version", { ascending: false }).limit(20),
    db.from("segments").select("id, name, criteria").eq("venture_id", v.id).order("name"),
    session.fullMember ? db.from("brand_kits").select("id, version, logo_asset_id, content, created_at").eq("venture_id", v.id).order("version", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    session.fullMember ? db.from("venture_assets").select("id, url, note").eq("venture_id", v.id).eq("kind", "logo").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const current = briefs?.[0];
  const content = BriefContent.parse(current?.content ?? {});
  const kit = kits?.[0];
  const brand = BrandKitContent.parse(kit?.content ?? {});

  return (
    <>
      <div>
        <h1 className="page-title">{v.name}</h1>
        <p className="page-sub">Brief GTM, version {current?.version ?? 0}. Chaque enregistrement crée une nouvelle version.</p>
      </div>
      {ok ? <p className="notice" role="status">{ok === "brief" ? "Nouvelle version du brief enregistrée." : ok === "charte" ? "Nouvelle version de la charte de marque enregistrée." : "Venture mise à jour."}</p> : null}

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
            <label className="field" style={{ color: "var(--ink)" }}>
              Liste Brevo (numéro)
              <input name="brevo_list_id" inputMode="numeric" defaultValue={v.brevo_list_id ?? ""} placeholder="Vide : pas de connexion Brevo" />
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

      {session.fullMember ? (
        <form action={saveBrandKit} className="card card-pad stack">
          <input type="hidden" name="venture_id" value={v.id} />
          <input type="hidden" name="slug" value={v.slug} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Charte de marque</h2>
            <p className="page-sub">
              Version {kit?.version ?? 0}. Les agents la lisent avant de créer pubs et posts et la traitent comme obligatoire. Un champ vide veut dire « pas tranché ». Chaque enregistrement crée une nouvelle version
              {kits && kits.length > 1 ? ` (${kits.length} déjà : ${kits.map((k) => `v${k.version}, ${fmt(k.created_at)}`).slice(0, 5).join(" ; ")})` : ""}.
            </p>
          </div>
          <div className="form-grid">
            <label className="field full">
              Logo (parmi les logos de la bibliothèque d'images de la page Pubs)
              <select name="logo_asset_id" defaultValue={kit?.logo_asset_id ?? ""}>
                <option value="">Aucun logo choisi</option>
                {(logos ?? []).map((l, i) => <option key={l.id} value={l.id}>Logo {i + 1}{l.note ? `, ${l.note}` : ""}</option>)}
              </select>
            </label>
            {(logos ?? []).length ? (
              <div className="full row" style={{ gap: 12, flexWrap: "wrap" }}>
                {(logos ?? []).map((l, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={l.id} src={l.url} alt={`Logo ${i + 1}${l.note ? `, ${l.note}` : ""}`} style={{ height: 56, maxWidth: 160, objectFit: "contain", background: "#fff", border: "1px solid var(--line-2)", borderRadius: 12, padding: 6 }} />
                ))}
              </div>
            ) : null}
            <label className="field">
              Emplacement du logo
              <select name="logo_coin" defaultValue={brand.logo.coin ?? ""}>
                <option value="">Pas tranché</option>
                {LOGO_CORNERS.map((c) => <option key={c} value={c}>{LOGO_CORNER_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="field full">
              Plaque unie sous le logo
              <select name="logo_plaque" defaultValue={brand.logo.plaque}>
                <option value="auto">Seulement si le générateur a dessiné dans le coin</option>
                <option value="jamais">Jamais</option>
                <option value="toujours">Toujours</option>
              </select>
            </label>
            <div className="form-grid">
              <label className="field">Taille (% de la largeur)<input type="number" name="logo_taille" min={3} max={60} step="0.5" defaultValue={brand.logo.taille_pct ?? ""} /></label>
              <label className="field">Marge (% de la largeur)<input type="number" name="logo_marge" min={0} max={25} step="0.5" defaultValue={brand.logo.marge_pct ?? ""} /></label>
            </div>
            <label className="field full">
              <span><strong style={{ color: "var(--ink)" }}>Palette</strong>, une couleur par ligne : nom | #RRGGBB | usage (facultatif)</span>
              <textarea name="palette" defaultValue={paletteText(brand)} placeholder="Flamme | #FF5A1F | accents et boutons" />
            </label>
            <label className="field">Police des titres<input name="police_titres" defaultValue={brand.polices.titres} /></label>
            <label className="field">Police du texte<input name="police_texte" defaultValue={brand.polices.texte} /></label>
            <label className="field">
              Adresse
              <select name="adresse" defaultValue={brand.ton.adresse ?? ""}>
                <option value="">Pas tranché</option>
                <option value="vouvoiement">Vouvoiement</option>
                <option value="tutoiement">Tutoiement</option>
              </select>
            </label>
            <label className="field full">
              <span><strong style={{ color: "var(--ink)" }}>Registre</strong>, comment on parle : longueur, vocabulaire, ponctuation</span>
              <textarea name="registre" defaultValue={brand.ton.registre} />
            </label>
            <label className="field">
              <span><strong style={{ color: "var(--ink)" }}>Mots interdits</strong>, un par ligne</span>
              <textarea name="interdits_mots" defaultValue={brand.interdits.mots.join("\n")} />
            </label>
            <label className="field">
              <span><strong style={{ color: "var(--ink)" }}>Formules interdites</strong>, une par ligne</span>
              <textarea name="interdits_formules" defaultValue={brand.interdits.formules.join("\n")} />
            </label>
            <label className="field full">
              <span><strong style={{ color: "var(--ink)" }}>Autres règles à ne jamais enfreindre</strong>, une par ligne (par exemple : pas de prix, pas d'émoji)</span>
              <textarea name="interdits_regles" defaultValue={brand.interdits.regles.join("\n")} />
            </label>
            <fieldset className="full" style={{ border: "1px solid var(--line-2)", borderRadius: 14, padding: "10px 14px" }}>
              <legend style={{ fontSize: 13, color: "var(--ink-2)" }}><strong style={{ color: "var(--ink)" }}>Contrôles automatiques</strong> : une pub ou un post qui enfreint une case cochée est refusé</legend>
              <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" name="sans_exclamation" defaultChecked={brand.interdits.sans_exclamation} />Pas de point d'exclamation</label>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" name="sans_emoji" defaultChecked={brand.interdits.sans_emoji} />Pas d'émoji</label>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" name="sans_tiret_cadratin" defaultChecked={brand.interdits.sans_tiret_cadratin} />Pas de tiret cadratin</label>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" name="sans_prix" defaultChecked={brand.interdits.sans_prix} />Pas de prix</label>
              </div>
            </fieldset>
            <label className="field full">
              <span><strong style={{ color: "var(--ink)" }}>Formats par canal</strong>, un par ligne : canal | format | note (facultative)</span>
              <textarea name="formats" defaultValue={formatsText(brand)} placeholder="Instagram, image | 4:5" />
            </label>
            <label className="field full">
              <span><strong style={{ color: "var(--ink)" }}>Cible</strong></span>
              <textarea name="cible" defaultValue={brand.cible} />
            </label>
            <label className="field full">
              <span><strong style={{ color: "var(--ink)" }}>Positionnement</strong></span>
              <textarea name="positionnement" defaultValue={brand.positionnement} />
            </label>
            <label className="field full">
              <span><strong style={{ color: "var(--ink)" }}>Mentions obligatoires</strong>, une par ligne : texte | où (facultatif)</span>
              <textarea name="mentions" defaultValue={mentionsText(brand)} placeholder="16 semaines | pastille sur chaque visuel" />
            </label>
          </div>
          <div className="row"><button type="submit" className="btn btn-dark">Enregistrer une nouvelle version</button></div>
        </form>
      ) : null}
    </>
  );
}
