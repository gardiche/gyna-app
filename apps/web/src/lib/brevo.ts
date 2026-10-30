import "server-only";
import { env } from "./env";

export type BrevoContact = { email: string; firstName?: string; lastName?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => EMAIL.test(v);

/** Prénom et nom d'un nom complet : le premier mot, puis le reste. */
export function splitName(full: string): { firstName?: string; lastName?: string } {
  const [first, ...rest] = full.trim().split(/\s+/);
  return rest.length ? { firstName: first, lastName: rest.join(" ") } : { lastName: first || undefined };
}

/**
 * Crée ou met à jour un contact dans une liste Brevo (`POST /v3/contacts`, updateEnabled : pas de doublon).
 * Seuls FIRSTNAME et LASTNAME sont envoyés : ce sont les attributs que tout compte Brevo possède.
 */
export async function upsertBrevoContact(listId: number, c: BrevoContact): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = env.brevoApiKey();
  if (!key) return { ok: false, error: "BREVO_API_KEY n'est pas posée dans Vercel." };
  const attributes: Record<string, string> = {};
  if (c.firstName) attributes.FIRSTNAME = c.firstName;
  if (c.lastName) attributes.LASTNAME = c.lastName;
  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: c.email, listIds: [listId], updateEnabled: true, attributes }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    return { ok: false, error: `Brevo ${res.status} : ${body?.message ?? res.statusText}` };
  } catch (e) {
    return { ok: false, error: `Brevo injoignable : ${(e as Error).message}` };
  }
}
