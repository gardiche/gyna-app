import Link from "next/link";
import { redirect } from "next/navigation";
import { FIT, FIT_LABEL, HEAT, HEAT_LABEL, STATUS_LABEL, type Fit, type Heat, type ProspectStatus } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import {
  COMPANY_STAGES, companiesQuery, countStages, dayRange, LINEN_LABEL, listMemberIds, PERSON_STAGES, prospectsQuery, PROSPECTS_PAGE_LIMIT,
  sortCompanies, sortProspects, type ProspectFilters,
} from "@/lib/prospects-query";
import { HeatLabel, StatusPill } from "@/components/heat";
import { BrevoSync } from "@/components/BrevoSync";
import { SelectAll } from "@/components/SelectAll";
import { bulkCompanies, bulkProspects, setContactEmail, setProspectStatus } from "./actions";

export const dynamic = "force-dynamic";

type Params = ProspectFilters & { p?: string; c?: string };

/** E-mail modifiable sur place ; la pastille dit si la ligne est déjà dans la liste Brevo. */
function EmailCell({ kind, id, email, synced, source }: { kind: "prospect" | "company"; id: string; email: string | null; synced: string | null; source?: string | null }) {
  return (
    <form action={setContactEmail} className="row" style={{ gap: 6 }}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input name="email" type="email" defaultValue={email ?? ""} placeholder="E-mail" aria-label="E-mail" title={source ? `Lu sur : ${source}` : undefined} style={{ minWidth: 170 }} />
      <button type="submit" className="btn btn-ghost">OK</button>
      {synced ? <span className="pill pill-lime" title="Déjà dans la liste Brevo">Brevo</span> : null}
    </form>
  );
}

const TZ = "Europe/Paris";
const shortDay = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(d));
const longDay = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(d));

/** Nom court d'une mission : le début de la demande de l'associé, et sa date. */
function missionLabel(m: { objective: string | null; created_at: string }): string {
  const first = (m.objective ?? "Mission").split("\n").find((l) => l.trim()) ?? "Mission";
  const t = first.replace(/\s+/g, " ").trim();
  return `${t.length > 48 ? `${t.slice(0, 48).trimEnd()}…` : t} · ${shortDay(m.created_at)}`;
}

const FIT_PILL: Record<string, string> = { A: "pill pill-lime", B: "pill pill-lavender", C: "pill" };
const LINEN_PILL: Record<string, string> = { fort: "pill pill-lime", possible: "pill pill-lavender", faible: "pill", ecarte: "pill" };

/** Étapes qu'un associé peut poser à la main depuis la fiche, selon où en est le prospect. */
const MANUAL_STEPS: Array<{ status: ProspectStatus; label: string }> = [
  { status: "contacted", label: "Marquer contacté" },
  { status: "replied", label: "A répondu" },
  { status: "enrolled", label: "Pré-inscrit" },
  { status: "to_review", label: "Remettre à examiner" },
  { status: "discarded", label: "Écarter" },
];

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const ventures = await listVentures(db);

  if (!ventures.length) {
    return (
      <>
        <h1 className="page-title">Prospects</h1>
        <p className="empty">Aucune venture pour l'instant.</p>
      </>
    );
  }

  // Un espace par venture : on ne mélange jamais deux ventures.
  const venture = ventures.find((v) => v.slug === sp.venture) ?? ventures[0]!;
  const [{ count: peopleCount }, { count: companyCount }] = await Promise.all([
    db.from("prospect_ventures").select("id", { count: "exact", head: true }).eq("venture_id", venture.id),
    db.from("companies").select("id", { count: "exact", head: true }).eq("venture_id", venture.id),
  ]);
  const kind: "personnes" | "entreprises" =
    sp.kind === "personnes" || sp.kind === "entreprises" ? sp.kind : (peopleCount ?? 0) > 0 || !(companyCount ?? 0) ? "personnes" : "entreprises";
  const stages = kind === "personnes" ? PERSON_STAGES : COMPANY_STAGES;
  const stage = stages.some((s) => s.key === sp.stage) ? sp.stage ?? "" : "";
  const filters: ProspectFilters = {
    venture: venture.slug, kind, stage: stage || undefined, source: sp.source || undefined, list: kind === "personnes" ? sp.list || undefined : undefined, q: sp.q || undefined,
    fit: kind === "personnes" ? sp.fit || undefined : undefined, heat: kind === "personnes" ? sp.heat || undefined : undefined,
    from: sp.from || undefined, to: sp.to || undefined,
  };

  // Adresse de la page avec ces filtres, en en changeant certains.
  const href = (o: Partial<Params>) => {
    const all: Record<string, string | undefined> = { ...filters, p: sp.p, c: sp.c, ...o };
    const qs = new URLSearchParams(Object.entries(all).filter(([, v]) => v) as [string, string][]);
    return `/prospects${qs.size ? `?${qs}` : ""}`;
  };

  // Missions qui ont trouvé les lignes de cette venture : ce sont les « sources ».
  const table = kind === "personnes" ? "prospect_ventures" : "companies";
  // Les listes de la venture (classements propres à une demande) et les membres de celle qui est choisie.
  const { data: listRows } = await db.from("prospect_lists").select("id, seq, name, purpose, scale").eq("venture_id", venture.id).order("seq");
  const lists = (listRows ?? []) as Array<{ id: string; seq: number; name: string; purpose: string | null; scale: Array<{ label: string; meaning: string }> }>;
  const listCounts = new Map<string, number>();
  if (lists.length) {
    const { data: ms } = await db.from("prospect_list_members").select("list_id").in("list_id", lists.map((l) => l.id)).limit(20000);
    for (const m of (ms ?? []) as Array<{ list_id: string }>) listCounts.set(m.list_id, (listCounts.get(m.list_id) ?? 0) + 1);
  }
  const chosenList = kind === "personnes" ? lists.find((l) => l.id === filters.list) ?? null : null;
  const onlyIds = chosenList ? await listMemberIds(db, chosenList.id) : null;
  const memberOf = new Map<string, { grade: string | null; reason: string | null; attributes: Record<string, unknown> }>();
  if (chosenList) {
    const { data: ms } = await db.from("prospect_list_members").select("prospect_venture_id, grade, reason, attributes").eq("list_id", chosenList.id).limit(5000);
    for (const m of (ms ?? []) as any[]) memberOf.set(m.prospect_venture_id, m);
  }

  const [counts, { data: found }, rowsRes] = await Promise.all([
    countStages(db, kind, venture.id, filters.source, onlyIds),
    db.from(table).select("mission_id").eq("venture_id", venture.id).not("mission_id", "is", null).limit(10000),
    kind === "personnes" ? prospectsQuery(db, filters, PROSPECTS_PAGE_LIMIT, onlyIds) : companiesQuery(db, filters, PROSPECTS_PAGE_LIMIT),
  ]);
  const perMission = new Map<string, number>();
  for (const r of (found ?? []) as Array<{ mission_id: string }>) perMission.set(r.mission_id, (perMission.get(r.mission_id) ?? 0) + 1);
  const { data: missionRows } = perMission.size
    ? await db.from("missions").select("id, objective, created_at").in("id", [...perMission.keys()]).order("created_at", { ascending: false })
    : { data: [] };
  const missions = new Map((missionRows ?? []).map((m: any) => [m.id as string, m as { id: string; objective: string | null; created_at: string }]));

  const people = kind === "personnes" ? sortProspects((rowsRes.data ?? []) as any[]) : [];
  const companies = kind === "entreprises" ? sortCompanies((rowsRes.data ?? []) as any[]) : [];
  const shown = people.length + companies.length;
  const { from, to } = dayRange(filters);
  const back = href({});
  const exportParams = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);

  const source = (missionId: string | null) => {
    const m = missionId ? missions.get(missionId) : null;
    return m ? <Link href={href({ source: m.id, p: undefined, c: undefined })} className="muted" title="Voir tout ce que cette mission a trouvé">{missionLabel(m)}</Link> : <span className="muted">Inconnue</span>;
  };

  return (
    <>
      <div>
        <h1 className="page-title">Prospects</h1>
        <p className="page-sub">Une venture à la fois, rangée par étape : d'où vient chaque prospect, où il en est, et ce qu'il reste à faire.</p>
      </div>

      <section className="card card-pad stack">
        <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
          <nav className="seg" aria-label="Venture">
            {ventures.map((v) => (
              <Link key={v.id} href={`/prospects?venture=${v.slug}`} aria-current={v.id === venture.id ? "page" : undefined}>{v.name}</Link>
            ))}
          </nav>
          <nav className="seg" aria-label="Personnes ou entreprises">
            <Link href={href({ kind: "personnes", stage: undefined, p: undefined, c: undefined, fit: undefined, heat: undefined, source: undefined })} aria-current={kind === "personnes" ? "page" : undefined}>
              Personnes <span className="seg-count">{peopleCount ?? 0}</span>
            </Link>
            <Link href={href({ kind: "entreprises", stage: undefined, p: undefined, c: undefined, fit: undefined, heat: undefined, source: undefined })} aria-current={kind === "entreprises" ? "page" : undefined}>
              Entreprises <span className="seg-count">{companyCount ?? 0}</span>
            </Link>
          </nav>
        </div>

        <nav className="stage-tabs" aria-label="Étapes">
          {stages.map((s) => (
            <Link key={s.key || "tous"} href={href({ stage: s.key || undefined, p: undefined, c: undefined })}
              aria-current={s.key === stage ? "page" : undefined} className={s.key === "ecartes" || s.key === "ecartees" ? "stage-tab stage-tab-muted" : "stage-tab"}>
              {s.label} <span className="seg-count">{counts[s.key] ?? 0}</span>
            </Link>
          ))}
        </nav>

        <form className="filters" method="get">
          <input type="hidden" name="venture" value={venture.slug} />
          <input type="hidden" name="kind" value={kind} />
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          <label className="field">
            Source
            <select name="source" defaultValue={filters.source ?? ""}>
              <option value="">Toutes les missions</option>
              {[...missions.values()].map((m) => <option key={m.id} value={m.id}>{missionLabel(m)} ({perMission.get(m.id) ?? 0})</option>)}
            </select>
          </label>
          {kind === "personnes" && lists.length ? (
            <label className="field">
              Liste
              <select name="list" defaultValue={filters.list ?? ""}>
                <option value="">Aucune</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({listCounts.get(l.id) ?? 0})</option>)}
              </select>
            </label>
          ) : null}
          {kind === "personnes" ? (
            <>
              <label className="field">
                Adéquation
                <select name="fit" defaultValue={filters.fit ?? ""}>
                  <option value="">Toutes</option>
                  {FIT.map((f) => <option key={f} value={f}>{FIT_LABEL[f]}</option>)}
                </select>
              </label>
              <label className="field">
                Chaleur
                <select name="heat" defaultValue={filters.heat ?? ""}>
                  <option value="">Toutes</option>
                  {HEAT.map((h) => <option key={h} value={h}>{HEAT_LABEL[h]}</option>)}
                </select>
              </label>
            </>
          ) : null}
          <label className="field">
            Nom
            <input name="q" defaultValue={filters.q ?? ""} placeholder="Rechercher" />
          </label>
          <label className="field">
            Ajouté du
            <input type="date" name="from" defaultValue={from} />
          </label>
          <label className="field">
            au
            <input type="date" name="to" defaultValue={to} />
          </label>
          <button type="submit" className="btn btn-dark">Filtrer</button>
          <a href={`/api/prospects/export?${exportParams}`} className="btn btn-ghost" download>Exporter en CSV</a>
          <BrevoSyncIfList db={db} slug={venture.slug} filters={Object.fromEntries(exportParams) as Record<string, string>} />
        </form>

        {/* Actions groupées : les cases du tableau appartiennent à ce formulaire. */}
        <form id="bulk" action={kind === "personnes" ? bulkProspects : bulkCompanies} className="bulk-bar">
          <input type="hidden" name="back" value={back} />
          <span className="muted">Pour les lignes cochées :</span>
          {kind === "personnes" ? (
            <>
              <button type="submit" name="op" value="qualify" className="btn btn-sm">Qualifier avec Gyna</button>
              <button type="submit" name="op" value="discard" className="btn btn-sm">Écarter</button>
            </>
          ) : (
            <>
              <button type="submit" name="op" value="rate" className="btn btn-sm">Juger le potentiel avec Gyna</button>
              <button type="submit" name="op" value="emails" className="btn btn-sm">Chercher les e-mails avec Gyna</button>
              <button type="submit" name="op" value="discard" className="btn btn-sm">Écarter</button>
            </>
          )}
          <span className="muted" style={{ fontSize: 12 }}>Gyna ne lance rien seule : le message s'ouvre dans le chat, vous l'envoyez.</span>
        </form>

        {chosenList ? (
          <div className="list-legend">
            <strong>{chosenList.name}</strong>
            {chosenList.purpose ? <span className="muted"> · {chosenList.purpose}</span> : null}
            <ul>
              {chosenList.scale.map((x) => <li key={x.label}><span className={FIT_PILL[x.label] ?? "pill"}>{x.label}</span> {x.meaning}</li>)}
            </ul>
            <span className="muted" style={{ fontSize: 12 }}>Ce classement est celui de la liste. La colonne « Note du brief » garde la note posée par la grille de la venture : les deux ne se mélangent pas.</span>
          </div>
        ) : null}
        {shown >= PROSPECTS_PAGE_LIMIT ? <p className="muted" style={{ fontSize: 13 }}>Seuls les {PROSPECTS_PAGE_LIMIT} premiers s'affichent ; l'export contient toutes les lignes de ces filtres.</p> : null}
        {rowsRes.error ? <p className="notice notice-error">{rowsRes.error.message}</p> : null}

        <div className={sp.p || sp.c ? "prospects-layout with-panel" : "prospects-layout"}>
          {shown === 0 ? (
            <p className="empty">Aucune ligne à cette étape. Demandez à Gyna d'en trouver depuis le chat.</p>
          ) : kind === "personnes" ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 32 }}><SelectAll form="bulk" label="Tout cocher" /></th>
                    <th scope="col">Nom</th>
                    <th scope="col">{chosenList ? "Note du brief" : "Note"}</th>
                    {chosenList ? <th scope="col">Dans la liste</th> : null}
                    <th scope="col">Chaleur</th>
                    <th scope="col">Source</th>
                    <th scope="col">Ajouté</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((r: any) => (
                    <tr key={r.id} aria-selected={r.id === sp.p ? true : undefined} className={r.id === sp.p ? "row-selected" : undefined}>
                      <td><input type="checkbox" name="ids" value={r.id} form="bulk" aria-label={`Cocher ${r.prospects.full_name}`} /></td>
                      <td>
                        <Link href={href({ p: r.id, c: undefined })} scroll={false}><strong>{r.prospects.full_name}</strong></Link>
                        <small>{[r.prospects.headline, r.prospects.location].filter(Boolean).join(" · ")}</small>
                        {r.status === "discarded" && r.discarded_reason ? <small>Écarté : {r.discarded_reason}</small> : null}
                      </td>
                      <td>{r.fit ? <span className={FIT_PILL[r.fit]} title={r.fit_reason ?? undefined}>{r.fit}</span> : <span className="muted">À trier</span>}</td>
                      {chosenList ? (
                        <td style={{ maxWidth: 280 }}>
                          {memberOf.get(r.id)?.grade ? <span className={FIT_PILL[memberOf.get(r.id)!.grade!] ?? "pill"}>{memberOf.get(r.id)!.grade}</span> : <span className="muted">—</span>}
                          {memberOf.get(r.id)?.reason ? <small>{memberOf.get(r.id)!.reason}</small> : null}
                        </td>
                      ) : null}
                      <td>{r.heat ? <HeatLabel heat={r.heat as Heat} /> : <span className="muted">—</span>}</td>
                      <td style={{ maxWidth: 240 }}>{source(r.mission_id)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{shortDay(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 32 }}><SelectAll form="bulk" label="Tout cocher" /></th>
                    <th scope="col">Entreprise</th>
                    <th scope="col">Potentiel</th>
                    <th scope="col">E-mail</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c: any) => (
                    <tr key={c.id} className={c.id === sp.c ? "row-selected" : undefined}>
                      <td><input type="checkbox" name="ids" value={c.id} form="bulk" aria-label={`Cocher ${c.name}`} /></td>
                      <td>
                        <Link href={href({ c: c.id, p: undefined })} scroll={false}><strong>{c.name}</strong></Link>
                        <small>{[c.category, c.city].filter(Boolean).join(" · ")}</small>
                      </td>
                      <td>{c.linen_potential ? <span className={LINEN_PILL[c.linen_potential]} title={c.linen_reason ?? undefined}>{LINEN_LABEL[c.linen_potential] ?? c.linen_potential}</span> : <span className="muted">À juger</span>}</td>
                      <td><EmailCell kind="company" id={c.id} email={c.email} synced={c.brevo_synced_at} source={c.email_source} /></td>
                      <td style={{ maxWidth: 220 }}>{source(c.mission_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sp.p && kind === "personnes" ? <PersonPanel db={db} pvId={sp.p} closeHref={href({ p: undefined })} missionLabelOf={(id) => (id && missions.get(id) ? missionLabel(missions.get(id)!) : null)} /> : null}
          {sp.c && kind === "entreprises" ? <CompanyPanel db={db} id={sp.c} closeHref={href({ c: undefined })} missionLabelOf={(id) => (id && missions.get(id) ? missionLabel(missions.get(id)!) : null)} /> : null}
        </div>
      </section>
    </>
  );
}

/** Bouton Brevo, seulement quand la venture a une liste réglée. */
async function BrevoSyncIfList({ db, slug, filters }: { db: any; slug: string; filters: Record<string, string> }) {
  const { data } = await db.from("ventures").select("name, brevo_list_id").eq("slug", slug).maybeSingle();
  return data?.brevo_list_id ? <BrevoSync filters={filters} ventureName={data.name} /> : null;
}

/** Fiche d'une personne, ouverte à droite du tableau : pourquoi sa note, sa chaleur, ses messages, son historique. */
async function PersonPanel({ db, pvId, closeHref, missionLabelOf }: { db: any; pvId: string; closeHref: string; missionLabelOf: (id: string | null) => string | null }) {
  const { data: l } = await db
    .from("prospect_ventures")
    .select("id, status, heat, heat_reason, fit, fit_reason, discarded_reason, mission_id, created_at, triaged_at, qualified_at, contacted_at, replied_at, enrolled_at, brevo_synced_at, prospects(id, full_name, headline, location, linkedin_url, email, facts), drafts(id, body, status, created_at)")
    .eq("id", pvId)
    .maybeSingle();
  if (!l) return <aside className="prospect-panel"><p className="muted">Ce prospect n'existe plus.</p><Link href={closeHref}>Fermer</Link></aside>;
  const p = l.prospects;
  const { data: memberships } = await db
    .from("prospect_list_members")
    .select("grade, reason, attributes, sources, prospect_lists(name, scale)")
    .eq("prospect_venture_id", pvId);
  const { data: signals } = await db.from("signals").select("id, kind, url, excerpt, published_at").eq("prospect_id", p.id).order("published_at", { ascending: false }).limit(5);

  const facts = p.facts as { founder_months: number | null; founder_title: string | null; founder_company: string | null; current_jobs: string[]; career_years: number | null; open_to_work: boolean } | null;
  const factLines = facts
    ? [
        facts.founder_months !== null ? `${facts.founder_title ?? "Fondateur"}${facts.founder_company ? ` de ${facts.founder_company}` : ""} depuis ${facts.founder_months} mois` : "Aucun poste de fondateur en cours daté",
        facts.current_jobs?.length ? `Poste salarié en cours : ${facts.current_jobs.join(" ; ")}` : null,
        facts.career_years !== null ? `${facts.career_years} ans de parcours` : null,
        facts.open_to_work ? "Badge « Open to work »" : null,
      ].filter(Boolean) as string[]
    : [];

  const DRAFT: Record<string, string> = { pending: "À valider", approved: "Approuvé", rejected: "Refusé", sent: "Envoyé" };
  const history = [
    { at: l.created_at, text: `Trouvé${missionLabelOf(l.mission_id) ? ` par « ${missionLabelOf(l.mission_id)} »` : ""}` },
    l.triaged_at ? { at: l.triaged_at, text: l.fit ? `Trié ${l.fit} par la Qualification` : "Écarté au tri" } : null,
    l.qualified_at ? { at: l.qualified_at, text: `Qualifié ${l.heat ? HEAT_LABEL[l.heat as Heat].toLowerCase() : ""}`.trim() } : null,
    ...((l.drafts ?? []) as any[]).map((d) => ({ at: d.created_at, text: `Brouillon de message (${(DRAFT[d.status] ?? d.status).toLowerCase()})` })),
    l.contacted_at ? { at: l.contacted_at, text: "Contacté" } : null,
    l.replied_at ? { at: l.replied_at, text: "A répondu" } : null,
    l.enrolled_at ? { at: l.enrolled_at, text: "Pré-inscrit" } : null,
  ].filter(Boolean).sort((a: any, b: any) => a.at.localeCompare(b.at)) as Array<{ at: string; text: string }>;

  return (
    <aside className="prospect-panel" aria-label={`Fiche de ${p.full_name}`}>
      <div className="row between">
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{p.full_name}</h2>
        <Link href={closeHref} scroll={false} aria-label="Fermer la fiche" className="btn btn-ghost btn-sm">Fermer</Link>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>{[p.headline, p.location].filter(Boolean).join(" · ")}</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <StatusPill status={l.status as ProspectStatus} />
        <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="btn btn-sm">Profil LinkedIn</a>
        <Link href={`/prospects/${p.id}`} className="btn btn-ghost btn-sm">Fiche complète</Link>
      </div>

      <div className="panel-block">
        <h3>{l.fit ? FIT_LABEL[l.fit as Fit] : l.status === "discarded" ? "Écarté" : "Pas encore trié"}</h3>
        {l.fit_reason || l.discarded_reason ? <p>{l.fit ? l.fit_reason : l.discarded_reason}</p> : null}
        {factLines.length ? <ul className="muted">{factLines.map((x) => <li key={x}>{x}</li>)}</ul> : null}
      </div>

      {((memberships ?? []) as any[]).map((m, i) => (
        <div key={i} className="panel-block">
          <h3>Liste « {m.prospect_lists?.name} » : {m.grade ? `niveau ${m.grade}` : "sans niveau"}</h3>
          {m.grade ? <p className="muted" style={{ fontSize: 13 }}>{(m.prospect_lists?.scale ?? []).find((x: any) => x.label === m.grade)?.meaning}</p> : null}
          {m.reason ? <p>{m.reason}</p> : null}
          {Object.keys(m.attributes ?? {}).length ? (
            <ul className="muted">{Object.entries(m.attributes as Record<string, unknown>).map(([k, v]) => <li key={k}><strong>{k}</strong> : {String(v)}</li>)}</ul>
          ) : null}
          {((m.sources ?? []) as Array<{ url: string; date?: string; note?: string }>).map((x) => (
            <p key={x.url} style={{ fontSize: 13 }}><a href={x.url} target="_blank" rel="noreferrer" className="muted">{x.note ?? x.url}</a>{x.date ? ` · ${shortDay(x.date)}` : ""}</p>
          ))}
        </div>
      ))}

      <div className="panel-block">
        <h3>Chaleur : {l.heat ? HEAT_LABEL[l.heat as Heat] : "pas encore qualifiée"}</h3>
        {l.heat_reason ? <p>{l.heat_reason}</p> : <p className="muted">La qualification fine lit ses publications récentes ; cochez-le et choisissez « Qualifier avec Gyna ».</p>}
        {((signals ?? []) as any[]).map((s) => (
          <p key={s.id} style={{ fontSize: 13 }}>« {s.excerpt} » <a href={s.url} target="_blank" rel="noreferrer" className="muted">{shortDay(s.published_at)}</a></p>
        ))}
      </div>

      {((l.drafts ?? []) as any[]).map((d) => (
        <div key={d.id} className="panel-block">
          <h3>Brouillon · {DRAFT[d.status] ?? d.status}</h3>
          <p className="draft-body">{d.body}</p>
        </div>
      ))}

      <div className="panel-block">
        <h3>E-mail</h3>
        <EmailCell kind="prospect" id={p.id} email={p.email} synced={l.brevo_synced_at} />
      </div>

      <div className="panel-block">
        <h3>Historique</h3>
        <ol className="timeline">
          {history.map((h, i) => <li key={i}><span className="muted">{longDay(h.at)}</span> {h.text}</li>)}
          {l.status === "discarded" ? <li><span className="muted">—</span> Écarté{l.discarded_reason ? ` : ${l.discarded_reason}` : ""}</li> : null}
        </ol>
      </div>

      <div className="panel-block">
        <h3>Changer d'étape</h3>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {MANUAL_STEPS.filter((s) => s.status !== l.status && (s.status !== "to_review" || l.status === "discarded")).map((s) => (
            <form key={s.status} action={setProspectStatus}>
              <input type="hidden" name="pv_id" value={l.id} />
              <input type="hidden" name="prospect_id" value={p.id} />
              <input type="hidden" name="status" value={s.status} />
              <button type="submit" className={s.status === "contacted" ? "btn btn-dark btn-sm" : "btn btn-sm"}>{s.label}</button>
            </form>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Étape actuelle : {STATUS_LABEL[l.status as ProspectStatus]}. Les étapes « Contacté », « A répondu » et « Pré-inscrit » se posent à la main : c'est ce qui permet de savoir d'où viennent les pré-inscriptions.</p>
      </div>
    </aside>
  );
}

/** Fiche d'une entreprise : coordonnées, potentiel et sa raison, e-mail et sa source, historique. */
async function CompanyPanel({ db, id, closeHref, missionLabelOf }: { db: any; id: string; closeHref: string; missionLabelOf: (id: string | null) => string | null }) {
  const { data: c } = await db
    .from("companies")
    .select("id, name, category, address, city, postal_code, phone, website, rating, reviews_count, maps_url, linen_potential, linen_reason, rated_at, email, email_source, email_found_at, brevo_synced_at, mission_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!c) return <aside className="prospect-panel"><p className="muted">Cette entreprise n'existe plus.</p><Link href={closeHref}>Fermer</Link></aside>;
  const place = [c.address, [c.postal_code, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const history = [
    { at: c.created_at, text: `Trouvée${missionLabelOf(c.mission_id) ? ` par « ${missionLabelOf(c.mission_id)} »` : ""}` },
    c.rated_at ? { at: c.rated_at, text: `Potentiel jugé : ${(LINEN_LABEL[c.linen_potential] ?? c.linen_potential ?? "").toLowerCase()}` } : null,
    c.email_found_at ? { at: c.email_found_at, text: "E-mail trouvé sur son site" } : null,
    c.brevo_synced_at ? { at: c.brevo_synced_at, text: "Envoyée dans Brevo" } : null,
  ].filter(Boolean).sort((a: any, b: any) => a.at.localeCompare(b.at)) as Array<{ at: string; text: string }>;

  return (
    <aside className="prospect-panel" aria-label={`Fiche de ${c.name}`}>
      <div className="row between">
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{c.name}</h2>
        <Link href={closeHref} scroll={false} aria-label="Fermer la fiche" className="btn btn-ghost btn-sm">Fermer</Link>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>{[c.category, place].filter(Boolean).join(" · ")}</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {c.maps_url ? <a href={c.maps_url} target="_blank" rel="noreferrer" className="btn btn-sm">Google Maps</a> : null}
        {c.website ? <a href={c.website} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Site</a> : null}
      </div>
      <div className="panel-block">
        <h3>{c.linen_potential ? LINEN_LABEL[c.linen_potential] ?? c.linen_potential : "Potentiel pas encore jugé"}</h3>
        {c.linen_reason ? <p>{c.linen_reason}</p> : null}
        <p className="muted" style={{ fontSize: 13 }}>{[c.phone, c.rating != null ? `${c.rating}/5${c.reviews_count ? ` (${c.reviews_count} avis)` : ""}` : null].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="panel-block">
        <h3>E-mail</h3>
        <EmailCell kind="company" id={c.id} email={c.email} synced={c.brevo_synced_at} source={c.email_source} />
        {c.email_source ? <p className="muted" style={{ fontSize: 12 }}>Lu sur : {c.email_source}</p> : null}
      </div>
      <div className="panel-block">
        <h3>Historique</h3>
        <ol className="timeline">{history.map((h, i) => <li key={i}><span className="muted">{longDay(h.at)}</span> {h.text}</li>)}</ol>
      </div>
    </aside>
  );
}
