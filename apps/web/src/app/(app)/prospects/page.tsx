import Link from "next/link";
import { redirect } from "next/navigation";
import { FIT, FIT_LABEL, HEAT, HEAT_LABEL, STATUS_LABEL, type Fit, type Heat, type ProspectStatus } from "@gyna/schemas";
import { getSession } from "@/lib/supabase/server";
import { listVentures } from "@/lib/data";
import {
  COMPANY_STAGES, companiesQuery, countStages, dayRange, LINEN_LABEL, listMemberIds, PERSON_STAGES, prospectsQuery, PROSPECTS_PAGE_LIMIT,
  siteLogoUrl, sortCompanies, sortProspects, type ProspectFilters,
} from "@/lib/prospects-query";
import { StatusPill } from "@/components/heat";
import { Avatar, PersonAvatar } from "@/components/ProspectAvatar";
import { ProspectDrawer } from "@/components/ProspectDrawer";
import { BrevoSync } from "@/components/BrevoSync";
import { SelectAll } from "@/components/SelectAll";
import { BulkActions, MenuButton, MoreFilters } from "@/components/BulkActions";
import { IconClose, IconDownload, IconSearch } from "@/components/icons";
import { bulkCompanies, bulkProspects, setContactEmail, setProspectStatus } from "./actions";

export const dynamic = "force-dynamic";

type Params = ProspectFilters & { p?: string; c?: string; notice?: string };

/** Messages courts que les actions groupées peuvent afficher en revenant sur la page. */
const NOTICES: Record<string, string> = {
  liste_nom: "Choisissez une liste, ou donnez un nom à la nouvelle liste.",
  liste_coche: "Cochez d'abord des lignes.",
  liste_vide: "Cette ligne n'est dans aucune liste choisie : rien à retirer.",
};

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

/** Depuis quand, en jours : « aujourd'hui », « il y a 6 j », puis la date au-delà d'un mois. */
function ago(d: string): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days < 31) return `il y a ${days} j`;
  return shortDay(d);
}

/** Où un e-mail a été lu, en court : le domaine et la page (« pressing.fr/contact »). */
function sourcePlace(src: string): string {
  try {
    const u = new URL(src);
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path.length > 1 ? (path.length > 28 ? `${path.slice(0, 28)}…` : path) : ""}`;
  } catch {
    return src.length > 40 ? `${src.slice(0, 40)}…` : src;
  }
}

/** Adéquation au brief, en tuile : la note qu'on lit en premier. */
function FitTile({ fit, title }: { fit: string | null; title?: string | null }) {
  if (!fit) return <span className="fit-tile fit-none">À trier</span>;
  return <span className={`fit-tile fit-${fit}`} title={title ?? FIT_LABEL[fit as Fit]} aria-label={FIT_LABEL[fit as Fit]}>{fit}</span>;
}

/** Chaleur en pastille colorée. */
function HeatChip({ heat }: { heat: Heat }) {
  return <span className={`heat-chip heat-${heat}`}><i aria-hidden="true" />{HEAT_LABEL[heat]}</span>;
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
    venture: venture.slug, kind, stage: stage || undefined, source: sp.source || undefined, list: sp.list || undefined, q: sp.q || undefined,
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
  const chosenList = lists.find((l) => l.id === filters.list) ?? null;
  const onlyIds = chosenList ? await listMemberIds(db, chosenList.id, kind) : null;
  const memberOf = new Map<string, { grade: string | null; reason: string | null; attributes: Record<string, unknown> }>();
  if (chosenList && kind === "personnes") {
    const { data: ms } = await db.from("prospect_list_members").select("prospect_venture_id, grade, reason, attributes").eq("list_id", chosenList.id).limit(5000);
    for (const m of (ms ?? []) as any[]) memberOf.set(m.prospect_venture_id, m);
  }

  const [counts, { data: found }, rowsRes] = await Promise.all([
    countStages(db, kind, venture.id, filters.source, onlyIds),
    db.from(table).select("mission_id").eq("venture_id", venture.id).not("mission_id", "is", null).limit(10000),
    kind === "personnes" ? prospectsQuery(db, filters, PROSPECTS_PAGE_LIMIT, onlyIds) : companiesQuery(db, filters, PROSPECTS_PAGE_LIMIT, onlyIds),
  ]);
  const perMission = new Map<string, number>();
  for (const r of (found ?? []) as Array<{ mission_id: string }>) perMission.set(r.mission_id, (perMission.get(r.mission_id) ?? 0) + 1);
  // Lues par une fonction qui ne rend que la demande et la date : une personne en prospection n'a pas le droit de lire les missions des associés.
  const { data: sourceRows } = perMission.size ? await db.rpc("prospect_sources", { p_venture: venture.id }) : { data: [] };
  const missionRows = ((sourceRows ?? []) as Array<{ id: string; objective: string | null; created_at: string }>)
    .filter((m) => perMission.has(m.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const missions = new Map((missionRows ?? []).map((m: any) => [m.id as string, m as { id: string; objective: string | null; created_at: string }]));

  const people = kind === "personnes" ? sortProspects((rowsRes.data ?? []) as any[]) : [];
  const companies = kind === "entreprises" ? sortCompanies((rowsRes.data ?? []) as any[]) : [];
  const shown = people.length + companies.length;
  const { from, to } = dayRange(filters);
  const back = href({});

  // Filtres actifs, en pastilles qu'on retire d'un clic ; les filtres secondaires sont repliés sous « Plus de filtres ».
  const dayLabel = (d: string) => shortDay(`${d}T12:00:00Z`);
  const chips: Array<{ label: string; href: string }> = [];
  if (filters.q) chips.push({ label: `Nom : « ${filters.q} »`, href: href({ q: undefined, p: undefined, c: undefined }) });
  if (chosenList) chips.push({ label: `Liste : ${chosenList.name}`, href: href({ list: undefined, p: undefined, c: undefined }) });
  if (filters.source && missions.get(filters.source)) chips.push({ label: `Source : ${missionLabel(missions.get(filters.source)!)}`, href: href({ source: undefined, p: undefined, c: undefined }) });
  if (filters.fit) chips.push({ label: `Adéquation : ${filters.fit === "none" ? "non triés" : (FIT_LABEL as Record<string, string>)[filters.fit] ?? filters.fit}`, href: href({ fit: undefined, p: undefined, c: undefined }) });
  if (filters.heat) chips.push({ label: `Chaleur : ${(HEAT_LABEL as Record<string, string>)[filters.heat] ?? filters.heat}`, href: href({ heat: undefined, p: undefined, c: undefined }) });
  if (from || to) chips.push({ label: from && to ? `Ajoutés du ${dayLabel(from)} au ${dayLabel(to)}` : from ? `Ajoutés depuis le ${dayLabel(from)}` : `Ajoutés jusqu'au ${dayLabel(to)}`, href: href({ from: undefined, to: undefined, p: undefined, c: undefined }) });
  const secondaryActive = [filters.source, filters.fit, filters.heat, from || to].filter(Boolean).length;
  const resetHref = href({ q: undefined, list: undefined, source: undefined, fit: undefined, heat: undefined, from: undefined, to: undefined, p: undefined, c: undefined });
  const exportParams = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);

  // Source d'une ligne, en texte : toute la ligne ouvre la fiche, et la fiche a le lien vers ce que la mission a trouvé.
  const missionName = (missionId: string | null) => {
    const m = missionId ? missions.get(missionId) : null;
    return <span className="lead-source" title={m ? `Trouvé par : ${m.objective ?? "mission"}` : undefined}>{m ? missionLabel(m) : "Source inconnue"}</span>;
  };

  // Dernier signal sourcé de chaque personne qualifiée : le « pourquoi maintenant » de la ligne.
  const qualifiedIds = people.filter((r: any) => r.heat).map((r: any) => r.prospects.id as string).slice(0, 150);
  const lastSignal = new Map<string, { excerpt: string; published_at: string }>();
  if (qualifiedIds.length) {
    const { data: sigs } = await db.from("signals").select("prospect_id, excerpt, published_at").in("prospect_id", qualifiedIds).order("published_at", { ascending: false }).limit(600);
    for (const s of (sigs ?? []) as Array<{ prospect_id: string; excerpt: string; published_at: string }>) if (!lastSignal.has(s.prospect_id)) lastSignal.set(s.prospect_id, s);
  }

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
            <Link href={href({ kind: "personnes", stage: undefined, p: undefined, c: undefined, fit: undefined, heat: undefined, source: undefined, list: undefined })} aria-current={kind === "personnes" ? "page" : undefined}>
              Personnes <span className="seg-count">{peopleCount ?? 0}</span>
            </Link>
            <Link href={href({ kind: "entreprises", stage: undefined, p: undefined, c: undefined, fit: undefined, heat: undefined, source: undefined, list: undefined })} aria-current={kind === "entreprises" ? "page" : undefined}>
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

        <form className="pf" method="get" role="search" aria-label="Filtrer les prospects">
          <input type="hidden" name="venture" value={venture.slug} />
          <input type="hidden" name="kind" value={kind} />
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          <div className="pf-row">
            <label className="pf-search">
              <IconSearch />
              <input name="q" defaultValue={filters.q ?? ""} placeholder={kind === "personnes" ? "Rechercher un nom" : "Rechercher une entreprise"} aria-label="Rechercher par nom" />
            </label>
            {lists.length ? (
              <label className="pf-select">
                <span>Liste</span>
                <select name="list" defaultValue={filters.list ?? ""}>
                  <option value="">Toutes</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({listCounts.get(l.id) ?? 0})</option>)}
                </select>
              </label>
            ) : null}
            <MoreFilters controls="pf-more-panel" active={secondaryActive} />
            <button type="submit" className="btn btn-dark btn-sm">Filtrer</button>
            <a href={`/api/prospects/export?${exportParams}`} className="pf-export" download>
              <IconDownload />
              Exporter en CSV
            </a>
          </div>
          <div id="pf-more-panel" className="pf-panel" hidden>
            <label className="field">
              Source
              <select name="source" defaultValue={filters.source ?? ""}>
                <option value="">Toutes les missions</option>
                {[...missions.values()].map((m) => <option key={m.id} value={m.id}>{missionLabel(m)} ({perMission.get(m.id) ?? 0})</option>)}
              </select>
            </label>
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
            <div className="field" role="group" aria-labelledby="pf-dates-label">
              <span id="pf-dates-label">Ajoutés entre le</span>
              <span className="pf-dates">
                <input type="date" name="from" defaultValue={from} aria-label="Ajoutés à partir du" />
                <span>et le</span>
                <input type="date" name="to" defaultValue={to} aria-label="Ajoutés jusqu'au" />
              </span>
            </div>
          </div>
          {chips.length ? (
            <ul className="pf-chips" aria-label="Filtres actifs">
              {chips.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} className="pf-chip" aria-label={`Retirer le filtre ${c.label}`}>
                    {c.label}
                    <IconClose />
                  </Link>
                </li>
              ))}
              {chips.length > 1 ? <li><Link href={resetHref} className="pf-reset">Tout effacer</Link></li> : null}
            </ul>
          ) : null}
        </form>

        {/* Actions groupées : les cases du tableau appartiennent à ce formulaire. */}
        <form id="bulk" action={kind === "personnes" ? bulkProspects : bulkCompanies} className="bulk-form">
          <input type="hidden" name="back" value={back} />
          <BulkActions hint={kind === "personnes"
            ? "Cochez des prospects pour les qualifier avec Gyna, les ranger dans une liste, les envoyer dans Brevo ou les écarter."
            : "Cochez des entreprises pour les confier à Gyna, les ranger dans une liste, les envoyer dans Brevo ou les écarter."}>
            <div className="bulk-group" role="group" aria-label="Avec Gyna">
              <span className="bulk-label">Gyna</span>
              {kind === "personnes" ? (
                <button type="submit" name="op" value="qualify" className="btn btn-sm" title="Prépare la mission dans le chat : vous l'envoyez vous-même.">Qualifier</button>
              ) : (
                <>
                  <button type="submit" name="op" value="rate" className="btn btn-sm" title="Prépare la mission dans le chat : vous l'envoyez vous-même.">Juger le potentiel</button>
                  <button type="submit" name="op" value="emails" className="btn btn-sm" title="Prépare la mission dans le chat : vous l'envoyez vous-même.">Chercher les e-mails</button>
                </>
              )}
            </div>
            <MenuButton label="Ranger dans une liste" panelLabel="Ranger dans une liste">
              <div className="panel-stack">
                {lists.length ? (
                  <label className="field">
                    Liste existante
                    <select name="list_id" defaultValue={chosenList?.id ?? ""}>
                      <option value="">Choisir une liste</option>
                      {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="field">
                  {lists.length ? "Ou une nouvelle liste" : "Nom de la nouvelle liste"}
                  <input name="list_name" maxLength={80} placeholder="Par exemple : Gîtes de Savoie" />
                </label>
                <button type="submit" name="op" value="list_add" className="btn btn-dark btn-sm">Ajouter</button>
                {chosenList ? (
                  <>
                    <input type="hidden" name="remove_list_id" value={chosenList.id} />
                    <button type="submit" name="op" value="list_remove" className="btn btn-sm">Retirer de « {chosenList.name} »</button>
                  </>
                ) : null}
              </div>
            </MenuButton>
            <MenuButton label="Envoyer dans Brevo" panelLabel="Envoyer dans Brevo">
              <BrevoSyncIfList db={db} slug={venture.slug} kind={kind} filters={Object.fromEntries(exportParams) as Record<string, string>} />
            </MenuButton>
            <button type="submit" name="op" value="discard" className="btn btn-sm bulk-discard">Écarter</button>
          </BulkActions>
        </form>

        {sp.notice && NOTICES[sp.notice] ? <p className="notice">{NOTICES[sp.notice]}</p> : null}
        {chosenList && (chosenList.scale.length || chosenList.purpose) ? (
          <div className="list-legend">
            <strong>{chosenList.name}</strong>
            {chosenList.purpose ? <span className="muted"> · {chosenList.purpose}</span> : null}
            <ul>
              {chosenList.scale.map((x) => <li key={x.label}><span className={FIT_PILL[x.label] ?? "pill"}>{x.label}</span> {x.meaning}</li>)}
            </ul>
            {chosenList.scale.length ? <span className="muted" style={{ fontSize: 12 }}>Ce classement est celui de la liste. La tuile A, B ou C garde la note posée par la grille de la venture : les deux ne se mélangent pas.</span> : null}
          </div>
        ) : null}
        {shown >= PROSPECTS_PAGE_LIMIT ? <p className="muted" style={{ fontSize: 13 }}>Seuls les {PROSPECTS_PAGE_LIMIT} premiers s'affichent ; l'export contient toutes les lignes de ces filtres.</p> : null}
        {rowsRes.error ? <p className="notice notice-error">{rowsRes.error.message}</p> : null}

        {shown === 0 ? (
          <p className="empty">Aucune ligne à cette étape. Demandez à Gyna d'en trouver depuis le chat.</p>
        ) : (
          <div className="lead-list">
            <div className="lead-head">
              <SelectAll form="bulk" label="Tout cocher" />
              <span className="muted">{shown} {kind === "personnes" ? (shown > 1 ? "personnes" : "personne") : shown > 1 ? "entreprises" : "entreprise"}, les plus prometteuses d'abord</span>
            </div>
            {kind === "personnes"
              ? people.map((r: any) => {
                  const p = r.prospects;
                  const acc = p.accounts as { name: string; domain: string | null; logo_url: string | null } | null;
                  const logo = acc ? acc.logo_url ?? siteLogoUrl(acc.domain) : null;
                  const sig = lastSignal.get(p.id);
                  const member = chosenList?.scale.length ? memberOf.get(r.id) : undefined;
                  return (
                    <div key={r.id} className={r.id === sp.p ? "lead is-open" : "lead"}>
                      <input type="checkbox" name="ids" value={r.id} form="bulk" aria-label={`Cocher ${p.full_name}`} />
                      <Link href={href({ p: r.id, c: undefined })} scroll={false} className="lead-link" aria-label={`Ouvrir la fiche de ${p.full_name}`}>
                        <span className="lead-who">
                          <PersonAvatar photo={p.photo_url} name={p.full_name} company={acc?.name} logo={logo} logoIsFavicon={!acc?.logo_url} />
                          <span className="lead-text">
                            <span className="lead-name">{p.full_name}</span>
                            <span className="lead-sub">{p.headline ?? "Poste inconnu"}</span>
                            <span className="lead-sub lead-inline">{[acc?.name, p.location].filter(Boolean).join(" · ")}</span>
                            {r.status === "discarded" && r.discarded_reason ? <span className="lead-sub">Écarté : {r.discarded_reason}</span> : null}
                          </span>
                        </span>
                        <span className="lead-company">
                          {acc ? <Avatar src={logo} name={acc.name} size={24} shape="square" favicon={!acc.logo_url} /> : null}
                          <span className="lead-text">
                            <span className={acc ? "lead-co-name" : "lead-sub"}>{acc?.name ?? "Entreprise inconnue"}</span>
                            {p.location ? <span className="lead-sub">{p.location}</span> : null}
                          </span>
                        </span>
                        <span className="lead-badges">
                          <span className="row" style={{ gap: 6 }}>
                            <FitTile fit={r.fit} title={r.fit_reason} />
                            {r.heat ? <HeatChip heat={r.heat as Heat} /> : null}
                            {member?.grade ? <span className={FIT_PILL[member.grade] ?? "pill"} title={member.reason ?? `Niveau dans « ${chosenList!.name} »`}>Liste : {member.grade}</span> : null}
                          </span>
                          {sig ? <span className="lead-signal" title={sig.excerpt}>« {sig.excerpt} » · {ago(sig.published_at)}</span> : null}
                        </span>
                        <span className="lead-meta">
                          {missionName(r.mission_id)}
                          <span>ajouté le {shortDay(r.created_at)}</span>
                        </span>
                      </Link>
                    </div>
                  );
                })
              : companies.map((c: any) => (
                  <div key={c.id} className={c.id === sp.c ? "lead lead-co is-open" : "lead lead-co"}>
                    <input type="checkbox" name="ids" value={c.id} form="bulk" aria-label={`Cocher ${c.name}`} />
                    <Link href={href({ c: c.id, p: undefined })} scroll={false} className="lead-link" aria-label={`Ouvrir la fiche de ${c.name}`}>
                      <span className="lead-who">
                        <Avatar src={siteLogoUrl(c.website)} name={c.name} size={44} shape="square" favicon />
                        <span className="lead-text">
                          <span className="lead-name">{c.name}</span>
                          <span className="lead-sub">{[c.category, c.city].filter(Boolean).join(" · ") || "Catégorie inconnue"}</span>
                        </span>
                      </span>
                      <span className="lead-rating">
                        {c.rating != null ? <><strong><span className="star" aria-hidden="true">★</span> {String(c.rating).replace(".", ",")}</strong>{c.reviews_count ? <span className="muted"> {c.reviews_count} avis</span> : null}</> : <span className="muted">Pas de note</span>}
                      </span>
                      <span className="lead-mail">
                        {c.email ? <span className="lead-co-name">{c.email}</span> : <span className="muted">{c.website ? "Pas d'e-mail publié trouvé" : "Pas de site connu"}</span>}
                        {c.email_source ? <span className="lead-sub">Lu sur : {sourcePlace(c.email_source)}</span> : null}
                        {c.brevo_synced_at ? <span className="lead-sub">Dans Brevo</span> : null}
                      </span>
                      <span className="lead-badges lead-badges-end">
                        {c.linen_potential ? <span className={LINEN_PILL[c.linen_potential]} title={c.linen_reason ?? undefined}>{LINEN_LABEL[c.linen_potential] ?? c.linen_potential}</span> : <span className="pill">À juger</span>}
                        <span className="lead-meta">{missionName(c.mission_id)}</span>
                      </span>
                    </Link>
                  </div>
                ))}
          </div>
        )}

        {sp.p && kind === "personnes" ? <PersonPanel db={db} pvId={sp.p} closeHref={href({ p: undefined })} missionLabelOf={(id) => (id && missions.get(id) ? missionLabel(missions.get(id)!) : null)} sourceHref={(id) => href({ source: id, p: undefined, c: undefined })} /> : null}
        {sp.c && kind === "entreprises" ? <CompanyPanel db={db} id={sp.c} closeHref={href({ c: undefined })} missionLabelOf={(id) => (id && missions.get(id) ? missionLabel(missions.get(id)!) : null)} /> : null}
      </section>
    </>
  );
}

/** Choix de la liste Brevo et bouton d'envoi ; la liste réglée sur la venture est proposée par défaut. */
async function BrevoSyncIfList({ db, slug, kind, filters }: { db: any; slug: string; kind: "personnes" | "entreprises"; filters: Record<string, string> }) {
  const { data } = await db.from("ventures").select("name, brevo_list_id").eq("slug", slug).maybeSingle();
  return data ? <BrevoSync filters={filters} ventureName={data.name} kind={kind} defaultListId={data.brevo_list_id ? Number(data.brevo_list_id) : null} /> : null;
}

/** Fiche d'une personne, dans le panneau latéral : pourquoi sa note, sa chaleur, ses messages, son historique. */
async function PersonPanel({ db, pvId, closeHref, missionLabelOf, sourceHref }: { db: any; pvId: string; closeHref: string; missionLabelOf: (id: string | null) => string | null; sourceHref: (id: string) => string }) {
  const { data: l } = await db
    .from("prospect_ventures")
    .select("id, status, heat, heat_reason, fit, fit_reason, discarded_reason, mission_id, created_at, triaged_at, qualified_at, contacted_at, replied_at, enrolled_at, brevo_synced_at, prospects(id, full_name, headline, location, linkedin_url, email, facts, photo_url, accounts(name, domain, logo_url)), drafts(id, body, status, created_at)")
    .eq("id", pvId)
    .maybeSingle();
  if (!l) {
    return (
      <ProspectDrawer label="Fiche introuvable" closeHref={closeHref} head={null}>
        <div className="drawer-body"><p className="muted">Ce prospect n'existe plus.</p></div>
      </ProspectDrawer>
    );
  }
  const p = l.prospects;
  const acc = p.accounts as { name: string; domain: string | null; logo_url: string | null } | null;
  const logo = acc ? acc.logo_url ?? siteLogoUrl(acc.domain) : null;
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
  const sourceName = missionLabelOf(l.mission_id);

  return (
    <ProspectDrawer
      label={`Fiche de ${p.full_name}`}
      closeHref={closeHref}
      head={<><StatusPill status={l.status as ProspectStatus} /><FitTile fit={l.fit} title={l.fit_reason} />{l.heat ? <HeatChip heat={l.heat as Heat} /> : null}</>}
    >
      <div className="drawer-body">
        <div className="lead-hero">
          <PersonAvatar photo={p.photo_url} name={p.full_name} company={acc?.name} logo={logo} logoIsFavicon={!acc?.logo_url} size={64} />
          <div className="lead-text">
            <h2>{p.full_name}</h2>
            <p className="muted">{p.headline ?? "Poste inconnu"}</p>
            <p className="lead-hero-co">
              {acc ? <Avatar src={logo} name={acc.name} size={20} shape="square" favicon={!acc.logo_url} /> : null}
              {[acc?.name, p.location].filter(Boolean).join(" · ") || "Entreprise et lieu inconnus"}
            </p>
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="btn btn-sm">Profil LinkedIn ↗</a>
          <Link href={`/prospects/${p.id}`} className="btn btn-ghost btn-sm">Fiche complète</Link>
          {l.mission_id && sourceName ? <Link href={sourceHref(l.mission_id)} className="btn btn-ghost btn-sm" title={sourceName}>Tout ce que cette mission a trouvé</Link> : null}
        </div>

        <section className="panel-block">
          <h3>{l.fit ? `Pourquoi ${l.fit} · ${FIT_LABEL[l.fit as Fit]}` : l.status === "discarded" ? "Écarté" : "Pas encore trié"}</h3>
          {l.fit_reason || l.discarded_reason ? <p>{l.fit ? l.fit_reason : l.discarded_reason}</p> : null}
          {factLines.length ? <ul className="muted">{factLines.map((x) => <li key={x}>{x}</li>)}</ul> : null}
        </section>

        <section className="panel-block">
          <h3>Chaleur · {l.heat ? HEAT_LABEL[l.heat as Heat].toLowerCase() : "pas encore qualifiée"}</h3>
          {l.heat_reason ? <p>{l.heat_reason}</p> : <p className="muted">La qualification fine lit ses publications récentes ; cochez-le et choisissez « Qualifier avec Gyna ».</p>}
          {((signals ?? []) as any[]).length ? (
            <ol className="signal-list">
              {((signals ?? []) as any[]).map((s) => (
                <li key={s.id}>
                  <time dateTime={s.published_at}>{shortDay(s.published_at)}</time>
                  <span>« {s.excerpt} » <a href={s.url} target="_blank" rel="noreferrer" className="muted">source ↗</a></span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        {((l.drafts ?? []) as any[]).map((d) => (
          <section key={d.id} className="panel-block">
            <h3>Brouillon · {(DRAFT[d.status] ?? d.status).toLowerCase()}</h3>
            <p className="draft-body lead-draft">{d.body}</p>
          </section>
        ))}

        <section className="panel-block">
          <h3>E-mail</h3>
          <EmailCell kind="prospect" id={p.id} email={p.email} synced={l.brevo_synced_at} />
        </section>

        {((memberships ?? []) as any[]).map((m, i) => (
          <section key={i} className="panel-block">
            <h3>Liste « {m.prospect_lists?.name} » · {m.grade ? `niveau ${m.grade}` : "sans niveau"}</h3>
            {m.grade ? <p className="muted" style={{ fontSize: 13 }}>{(m.prospect_lists?.scale ?? []).find((x: any) => x.label === m.grade)?.meaning}</p> : null}
            {m.reason ? <p>{m.reason}</p> : null}
            {Object.keys(m.attributes ?? {}).length ? (
              <ul className="muted">{Object.entries(m.attributes as Record<string, unknown>).map(([k, v]) => <li key={k}><strong>{k}</strong> : {String(v)}</li>)}</ul>
            ) : null}
            {((m.sources ?? []) as Array<{ url: string; date?: string; note?: string }>).map((x) => (
              <p key={x.url} style={{ fontSize: 13 }}><a href={x.url} target="_blank" rel="noreferrer" className="muted">{x.note ?? x.url}</a>{x.date ? ` · ${shortDay(x.date)}` : ""}</p>
            ))}
          </section>
        ))}

        <section className="panel-block">
          <h3>Historique</h3>
          <ol className="timeline">
            {history.map((h, i) => <li key={i}><span className="muted">{longDay(h.at)}</span> {h.text}</li>)}
            {l.status === "discarded" ? <li><span className="muted">—</span> Écarté{l.discarded_reason ? ` : ${l.discarded_reason}` : ""}</li> : null}
          </ol>
        </section>
      </div>

      <div className="drawer-foot">
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
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Étape actuelle : {STATUS_LABEL[l.status as ProspectStatus]}. « Contacté », « A répondu » et « Pré-inscrit » se posent à la main : c'est ce qui dit d'où viennent les pré-inscriptions.</p>
      </div>
    </ProspectDrawer>
  );
}

/** Fiche d'une entreprise : coordonnées, potentiel et sa raison, e-mail et sa source, historique. */
async function CompanyPanel({ db, id, closeHref, missionLabelOf }: { db: any; id: string; closeHref: string; missionLabelOf: (id: string | null) => string | null }) {
  const { data: c } = await db
    .from("companies")
    .select("id, name, category, address, city, postal_code, phone, website, rating, reviews_count, maps_url, linen_potential, linen_reason, rated_at, email, email_source, email_found_at, brevo_synced_at, mission_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!c) {
    return (
      <ProspectDrawer label="Fiche introuvable" closeHref={closeHref} head={null}>
        <div className="drawer-body"><p className="muted">Cette entreprise n'existe plus.</p></div>
      </ProspectDrawer>
    );
  }
  const place = [c.address, [c.postal_code, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const history = [
    { at: c.created_at, text: `Trouvée${missionLabelOf(c.mission_id) ? ` par « ${missionLabelOf(c.mission_id)} »` : ""}` },
    c.rated_at ? { at: c.rated_at, text: `Potentiel jugé : ${(LINEN_LABEL[c.linen_potential] ?? c.linen_potential ?? "").toLowerCase()}` } : null,
    c.email_found_at ? { at: c.email_found_at, text: "E-mail trouvé sur son site" } : null,
    c.brevo_synced_at ? { at: c.brevo_synced_at, text: "Envoyée dans Brevo" } : null,
  ].filter(Boolean).sort((a: any, b: any) => a.at.localeCompare(b.at)) as Array<{ at: string; text: string }>;

  return (
    <ProspectDrawer
      label={`Fiche de ${c.name}`}
      closeHref={closeHref}
      head={c.linen_potential ? <span className={LINEN_PILL[c.linen_potential]}>{LINEN_LABEL[c.linen_potential] ?? c.linen_potential}</span> : <span className="pill">Potentiel à juger</span>}
    >
      <div className="drawer-body">
        <div className="lead-hero">
          <Avatar src={siteLogoUrl(c.website)} name={c.name} size={64} shape="square" favicon />
          <div className="lead-text">
            <h2>{c.name}</h2>
            <p className="muted">{[c.category, place].filter(Boolean).join(" · ")}</p>
            {c.rating != null ? <p className="lead-hero-co"><strong><span className="star" aria-hidden="true">★</span> {String(c.rating).replace(".", ",")}</strong>{c.reviews_count ? <span className="muted">{c.reviews_count} avis Google</span> : null}</p> : null}
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {c.maps_url ? <a href={c.maps_url} target="_blank" rel="noreferrer" className="btn btn-sm">Google Maps ↗</a> : null}
          {c.website ? <a href={c.website} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Site ↗</a> : null}
          {c.phone ? <span className="pill">{c.phone}</span> : null}
        </div>
        <section className="panel-block">
          <h3>{c.linen_potential ? LINEN_LABEL[c.linen_potential] ?? c.linen_potential : "Potentiel pas encore jugé"}</h3>
          {c.linen_reason ? <p>{c.linen_reason}</p> : <p className="muted">Cochez-la et choisissez « Juger le potentiel avec Gyna ».</p>}
        </section>
        <section className="panel-block">
          <h3>E-mail</h3>
          <EmailCell kind="company" id={c.id} email={c.email} synced={c.brevo_synced_at} source={c.email_source} />
          {c.email_source ? <p className="muted" style={{ fontSize: 12 }}>Lu sur : {/^https?:\/\//.test(c.email_source) ? <a href={c.email_source} target="_blank" rel="noreferrer" className="muted">{sourcePlace(c.email_source)}</a> : c.email_source}</p> : null}
        </section>
        <section className="panel-block">
          <h3>Historique</h3>
          <ol className="timeline">{history.map((h, i) => <li key={i}><span className="muted">{longDay(h.at)}</span> {h.text}</li>)}</ol>
        </section>
      </div>
    </ProspectDrawer>
  );
}
