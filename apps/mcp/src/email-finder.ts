import { lookup } from "node:dns";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

/**
 * Lecture des e-mails PUBLIÉS sur le site d'une entreprise : page d'accueil, puis page de contact ou de mentions
 * légales. Rien n'est deviné ni fabriqué : une adresse n'est gardée que si elle figure telle quelle dans une page
 * du site (lien mailto: ou texte) et porte le nom de domaine du site. Aucun service payant, aucun cookie.
 */
export const USER_AGENT = "GynaBot/1.0 (+Alpact; lecture des adresses de contact publiées ; contact via alpact.co)";
const ROBOTS_AGENT = "gynabot";
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
/** Pages lues au plus par entreprise : accueil + 3 pages de contact. */
const MAX_PAGES = 4;

export interface FetchedPage { url: string; body: string }
/** Récupère une page (null si refusée, illisible ou hors règles). Remplaçable dans les tests. */
export type PageFetcher = (url: string) => Promise<FetchedPage | null>;

/* ---------- Sûreté du fetch ---------- */

/** Adresse locale, privée, réservée ou de liaison : jamais jointe (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]!);
  return /^(fc|fd|fe[89ab])/.test(v6) || v6.startsWith("ff");
}

/** Adresse http(s) publique acceptable pour un site d'entreprise ; null sinon. Ajoute https:// si le schéma manque. */
export function safeSiteUrl(raw: string): URL | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (isIP(host) && isPrivateAddress(host)) return null;
  if (!isIP(host) && !host.includes(".")) return null;
  u.hash = "";
  return u;
}

/** Résolution DNS qui refuse les adresses privées au moment même de la connexion (pas de rebinding possible). */
const safeLookup: typeof lookup = ((hostname: string, options: any, cb: any) => {
  const done = typeof options === "function" ? options : cb;
  const opts = typeof options === "function" ? {} : options;
  lookup(hostname, { ...opts, all: true }, (err, addrs: any) => {
    if (err) return done(err);
    const list = (addrs as Array<{ address: string; family: number }>).filter((a) => !isPrivateAddress(a.address));
    if (!list.length) return done(Object.assign(new Error("adresse non publique"), { code: "EPRIVATE" }));
    if (opts?.all) return done(null, list);
    done(null, list[0]!.address, list[0]!.family);
  });
}) as typeof lookup;

function getOnce(url: URL): Promise<{ status: number; location: string | null; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "GET",
      lookup: safeLookup as never,
      timeout: TIMEOUT_MS,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,text/plain;q=0.8", "accept-language": "fr", "accept-encoding": "identity" },
    }, (res) => {
      const type = String(res.headers["content-type"] ?? "").toLowerCase();
      const status = res.statusCode ?? 0;
      const location = typeof res.headers.location === "string" ? res.headers.location : null;
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, location, type, body: "" }); }
      if (type && !/text\/(html|plain)|application\/xhtml/.test(type)) { res.resume(); return resolve({ status, location, type, body: "" }); }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) { chunks.push(c.subarray(0, c.length - (size - MAX_BYTES))); res.destroy(); return; }
        chunks.push(c);
      });
      res.on("close", () => resolve({ status, location, type, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("délai dépassé")));
    req.on("error", reject);
    req.end();
  });
}

/** Lecture réelle d'une page : redirections suivies à la main et revérifiées, taille et délai plafonnés. */
export const fetchPage: PageFetcher = async (raw) => {
  let url = safeSiteUrl(raw);
  for (let hop = 0; url && hop <= MAX_REDIRECTS; hop++) {
    let r;
    try { r = await getOnce(url); } catch { return null; }
    if (r.status >= 300 && r.status < 400 && r.location) {
      try { url = safeSiteUrl(new URL(r.location, url).toString()); } catch { return null; }
      continue;
    }
    return r.status === 200 && r.body ? { url: url.toString(), body: r.body } : null;
  }
  return null;
};

/* ---------- robots.txt ---------- */

/** Règles Disallow qui s'appliquent à nous (groupe gynabot, sinon *). Simple, sans jokers : préfixes. */
export function parseRobots(txt: string): string[] {
  const groups: Array<{ agents: string[]; disallow: string[] }> = [];
  let cur: { agents: string[]; disallow: string[]; open: boolean } | null = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase(), val = m[2]!.trim();
    if (key === "user-agent") {
      if (!cur || !cur.open) { cur = { agents: [], disallow: [], open: true }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur) {
      cur.open = false;
      if (key === "disallow" && val) cur.disallow.push(val);
      if (key === "allow" && val) cur.disallow = cur.disallow.filter((d) => d !== val);
    }
  }
  const own = groups.filter((g) => g.agents.includes(ROBOTS_AGENT));
  const pick = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  return pick.flatMap((g) => g.disallow);
}

export function allowedByRobots(disallow: string[], url: URL): boolean {
  const path = url.pathname + url.search;
  return !disallow.some((d) => {
    if (d === "/") return true;
    const prefix = d.replace(/\*.*$/, "").replace(/\$$/, "");
    return prefix !== "" && path.startsWith(prefix);
  });
}

/* ---------- Extraction ---------- */

const ENTITIES: Record<string, string> = { "&amp;": "&", "&commat;": "@", "&#64;": "@", "&#x40;": "@", "&period;": ".", "&#46;": ".", "&#x2e;": "." };
const decode = (s: string) => s.replace(/&(amp|commat|period|#64|#x40|#46|#x2e);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);

const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@(?:[a-z0-9-]+\.)+[a-z]{2,24}/gi;
const BAD_LOCAL = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|abuse|webmaster|root|hostmaster|sentry|privacy|dpo|rgpd|unsubscribe)$/i;
const FILE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|ico|css|js|woff2?|ttf|pdf)$/i;
/** Adresses génériques de contact, préférées aux adresses nominatives. */
const GENERIC = /^(contact|info|infos|accueil|bonjour|hello|reception|reservation|reservations|commercial|direction|secretariat|administration|admin|boutique|magasin|pressing|hotel|restaurant|garage|mairie|devis|vente|ventes|achats|compta|comptabilite)$/i;

/** Nom de domaine d'un site sans « www. ». */
export const siteHost = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");

/** L'adresse appartient-elle au site ? Même domaine, ou sous-domaine l'un de l'autre. Autre domaine : non. */
export function sameDomain(emailDomain: string, host: string): boolean {
  const d = emailDomain.toLowerCase();
  return d === host || host.endsWith(`.${d}`) || d.endsWith(`.${host}`);
}

/** Adresses lues dans une page (mailto: puis texte), sans doublon, sur le domaine du site, filtrées. Rien n'est composé. */
export function extractEmails(html: string, host: string): string[] {
  const text = decode(html);
  const found: string[] = [];
  for (const m of text.matchAll(/mailto:([^"'<>\s?]+)/gi)) {
    let v = m[1]!;
    try { v = decodeURIComponent(v); } catch { /* garde la forme brute */ }
    for (const part of v.split(/[,;]/)) found.push(part.trim());
  }
  for (const m of text.matchAll(EMAIL_RE)) found.push(m[0]);
  const out: string[] = [];
  for (const raw of found) {
    const e = raw.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
    const at = e.lastIndexOf("@");
    if (at < 1 || !/^[a-z0-9][a-z0-9._%+-]*@(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(e)) continue;
    const local = e.slice(0, at), domain = e.slice(at + 1);
    if (FILE_EXT.test(e) || /@\d+x\./.test(e)) continue;
    if (BAD_LOCAL.test(local) || /\.\./.test(e)) continue;
    if (!sameDomain(domain, host)) continue;
    if (!out.includes(e)) out.push(e);
  }
  // Génériques d'abord (contact@, info@…), puis l'ordre de la page.
  return out.sort((a, b) => Number(GENERIC.test(b.split("@")[0]!)) - Number(GENERIC.test(a.split("@")[0]!)));
}

const CONTACT_HINT = /contact|mention|legal|légal|a-propos|apropos|about|nous-joindre|informations|infos-pratiques|coordonn/i;

/** Liens de la page qui mènent à une page de contact ou de mentions légales du même site (8 au plus). */
export function contactLinks(html: string, base: URL): URL[] {
  const urls: URL[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const label = m[2]!.replace(/<[^>]+>/g, " ");
    if (!CONTACT_HINT.test(m[1]!) && !CONTACT_HINT.test(label)) continue;
    let u: URL | null = null;
    try { u = safeSiteUrl(new URL(decode(m[1]!), base).toString()); } catch { /* lien illisible */ }
    if (!u || siteHost(u) !== siteHost(base) || /\.(pdf|jpe?g|png|zip)$/i.test(u.pathname)) continue;
    if (!urls.some((x) => x.toString() === u!.toString())) urls.push(u);
    if (urls.length >= 8) break;
  }
  return urls;
}

export type EmailLookup =
  | { status: "found"; email: string; source: string; others: string[]; pages: number }
  | { status: "none" | "unreachable" | "robots" | "no_website"; pages: number };

/**
 * Lit le site d'une entreprise : accueil, puis pages de contact / mentions légales (liens trouvés, sinon /contact et
 * /mentions-legales) jusqu'à la première adresse du domaine du site. Respecte robots.txt s'il est lisible.
 */
export async function findEmailOnSite(website: string | null, fetcher: PageFetcher = fetchPage): Promise<EmailLookup> {
  const start = website ? safeSiteUrl(website) : null;
  if (!start) return { status: "no_website", pages: 0 };
  const robotsPage = await fetcher(new URL("/robots.txt", start).toString());
  const rules = robotsPage ? parseRobots(robotsPage.body) : [];
  const ok = (u: URL) => allowedByRobots(rules, u);
  if (!ok(start)) return { status: "robots", pages: 0 };

  let pages = 0;
  const seen = new Set<string>();
  const read = async (u: URL) => {
    if (pages >= MAX_PAGES || seen.has(u.toString()) || !ok(u)) return null;
    seen.add(u.toString());
    pages++;
    return fetcher(u.toString());
  };
  const home = await read(start);
  if (!home) return { status: "unreachable", pages };
  // Le site peut avoir redirigé vers un autre domaine (www, nouveau nom) : on se réfère à l'adresse finale.
  const base = safeSiteUrl(home.url) ?? start;
  const host = siteHost(base);
  const hostsOk = new Set([host, siteHost(start)]);
  const scan = (page: FetchedPage) => {
    const list = [...hostsOk].flatMap((h) => extractEmails(page.body, h));
    return [...new Set(list)];
  };

  let emails = scan(home);
  let source = home.url;
  if (!emails.length) {
    const links = contactLinks(home.body, base);
    const guesses = ["/contact", "/mentions-legales"].map((p) => new URL(p, base));
    for (const u of [...links, ...guesses]) {
      const page = await read(u);
      if (!page) continue;
      emails = scan(page);
      if (emails.length) { source = page.url; break; }
    }
  }
  if (!emails.length) return { status: "none", pages };
  return { status: "found", email: emails[0]!, source, others: emails.slice(1, 4), pages };
}
