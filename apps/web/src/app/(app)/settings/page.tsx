import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { createTelegramCode, unlinkTelegram, updateBudget, updateProfile } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = session.supabase;
  const [{ data: me }, { data: org }, { data: members }, { data: allowed }] = await Promise.all([
    db.from("members").select("display_name, telegram_chat_id, telegram_link_code").eq("id", session.memberId).single(),
    db.from("organizations").select("name, default_mission_budget_eur").eq("id", session.orgId).single(),
    db.from("members").select("id, display_name, role, telegram_chat_id").eq("org_id", session.orgId).order("created_at"),
    db.from("allowed_emails").select("email, display_name").eq("org_id", session.orgId),
  ]);
  const bot = env.telegramBotName();

  return (
    <>
      <div>
        <h1 className="page-title">Paramètres</h1>
        <p className="page-sub">{org?.name}, connecté en tant que {session.email}</p>
      </div>
      <div className="workspace">
        <div className="card-main stack" style={{ gap: 20 }}>
          <form action={updateProfile} className="card card-pad stack">
            <h2 style={{ fontSize: 17, fontWeight: 600 }}>Profil</h2>
            <label className="field">Nom affiché<input name="display_name" defaultValue={me?.display_name ?? ""} required /></label>
            <div className="row"><button type="submit" className="btn btn-dark">Enregistrer</button></div>
          </form>

          <section className="card card-pad stack">
            <h2 style={{ fontSize: 17, fontWeight: 600 }}>Telegram</h2>
            {me?.telegram_chat_id ? (
              <>
                <p className="muted">Compte lié. Les validations vous sont envoyées sur Telegram, avec Approuver et Rejeter en un tap.</p>
                <form action={unlinkTelegram}><button type="submit" className="btn btn-sm">Délier</button></form>
              </>
            ) : me?.telegram_link_code ? (
              <p style={{ fontSize: 15, lineHeight: 1.6 }}>
                Envoyez <strong className="tabular">/start {me.telegram_link_code}</strong> à {bot ? <a href={`https://t.me/${bot}`} target="_blank" rel="noreferrer">@{bot}</a> : "votre bot Gyna"} sur Telegram, puis rechargez cette page.
              </p>
            ) : (
              <form action={createTelegramCode} className="stack">
                <p className="muted">Recevez les brouillons à valider sur Telegram et décidez en un tap.</p>
                <div className="row"><button type="submit" className="btn btn-dark">Lier mon compte Telegram</button></div>
              </form>
            )}
          </section>

          <form action={updateBudget} className="card card-pad stack">
            <h2 style={{ fontSize: 17, fontWeight: 600 }}>Budget par mission</h2>
            <p className="muted">Au-delà, la mission s'arrête et attend l'accord d'un associé.</p>
            <label className="field" style={{ maxWidth: 220 }}>
              Plafond (€)
              <input name="budget" inputMode="decimal" defaultValue={String(org?.default_mission_budget_eur ?? 5)} />
            </label>
            <div className="row"><button type="submit" className="btn btn-dark">Enregistrer</button></div>
          </form>
        </div>

        <aside>
          <section className="card-lavender">
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Associés</h2>
            <ul className="inset inset-list">
              {(members ?? []).map((m) => (
                <li key={m.id}><span>{m.display_name}</span><span>{m.telegram_chat_id ? "Telegram lié" : ""}</span></li>
              ))}
            </ul>
            <p style={{ fontSize: 13 }}>
              Emails autorisés : {(allowed ?? []).map((a) => a.email).join(", ")}. Pour en ajouter un, insérez-le dans la table allowed_emails depuis Supabase.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
