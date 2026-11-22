import "server-only";
import { env } from "./env";

/** Un contact Brevo : par son e-mail ou, à défaut, par un identifiant interne (`extId`) que Brevo accepte à la place. */
export type BrevoContact = { email?: string; extId?: string; firstName?: string; lastName?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => EMAIL.test(v);

/** Prénom et nom d'un nom complet : le premier mot, puis le reste. */
export function splitName(full: string): { firstName?: string; lastName?: string } {
  const [first, ...rest] = full.trim().split(/\s+/);
  return rest.length ? { firstName: first, lastName: rest.join(" ") } : { lastName: first || undefined };
}

export type BrevoList = { id: number; name: string; contacts: number };

/** Listes de contacts du compte Brevo (lecture seule), les plus récentes d'abord. */
export async function listBrevoLists(): Promise<{ ok: true; lists: BrevoList[] } | { ok: false; error: string }> {
  const key = env.brevoApiKey();
  if (!key) return { ok: false, error: "BREVO_API_KEY n'est pas posée dans Vercel." };
  const lists: BrevoList[] = [];
  try {
    for (let offset = 0; offset < 500; offset += 50) {
      const res = await fetch(`https://api.brevo.com/v3/contacts/lists?limit=50&offset=${offset}&sort=desc`, {
        headers: { "api-key": key, accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        return { ok: false, error: `Brevo ${res.status} : ${body?.message ?? res.statusText}` };
      }
      const body = (await res.json()) as { lists?: Array<{ id: number; name: string; uniqueSubscribers?: number; totalSubscribers?: number }>; count?: number };
      for (const l of body.lists ?? []) lists.push({ id: l.id, name: l.name, contacts: l.uniqueSubscribers ?? l.totalSubscribers ?? 0 });
      if (lists.length >= (body.count ?? 0) || !(body.lists ?? []).length) break;
    }
    return { ok: true, lists };
  } catch (e) {
    return { ok: false, error: `Brevo injoignable : ${(e as Error).message}` };
  }
}

/**
 * Crée ou met à jour un contact dans une liste Brevo (`POST /v3/contacts`, updateEnabled : pas de doublon).
 * Seuls FIRSTNAME et LASTNAME sont envoyés : ce sont les attributs que tout compte Brevo possède.
 */
export async function upsertBrevoContact(listId: number, c: BrevoContact): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = env.brevoApiKey();
  if (!key) return { ok: false, error: "BREVO_API_KEY n'est pas posée dans Vercel." };
  if (!c.email && !c.extId) return { ok: false, error: "Contact sans e-mail ni identifiant." };
  const attributes: Record<string, string> = {};
  if (c.firstName) attributes.FIRSTNAME = c.firstName;
  if (c.lastName) attributes.LASTNAME = c.lastName;
  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...(c.email ? { email: c.email } : { ext_id: c.extId }), listIds: [listId], updateEnabled: true, attributes }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    return { ok: false, error: `Brevo ${res.status} : ${body?.message ?? res.statusText}` };
  } catch (e) {
    return { ok: false, error: `Brevo injoignable : ${(e as Error).message}` };
  }
}
