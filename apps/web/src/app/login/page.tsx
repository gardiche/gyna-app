import { sendMagicLink } from "./actions";
import { Spark } from "@/components/icons";

const MESSAGES: Record<string, string> = {
  envoye: "Lien envoyé. Ouvrez l'email et cliquez sur le lien pour vous connecter.",
  inconnu: "Cette adresse n'est pas autorisée. Demandez à un associé de l'ajouter.",
  membre: "Votre compte n'est rattaché à aucune organisation. Demandez à un associé de vous ajouter.",
  lien: "Le lien a expiré ou a déjà servi. Demandez-en un nouveau.",
  envoi: "L'envoi du lien a échoué. Réessayez dans un instant.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const key = sp.ok ?? sp.error;
  return (
    <main className="login">
      <div className="card">
        <div className="row"><Spark size={34} /><h1 style={{ fontSize: 28, fontWeight: 600 }}>Gyna</h1></div>
        <p className="muted" style={{ fontSize: 15 }}>Le cockpit d'acquisition d'Alpact. Connectez-vous avec votre email d'associé.</p>
        {key && MESSAGES[key] ? <p className={sp.ok ? "notice" : "notice notice-error"} role="status">{MESSAGES[key]}</p> : null}
        <form action={sendMagicLink} className="stack">
          <label className="field">
            Email
            <input type="email" name="email" required autoComplete="email" placeholder="vous@alpact.fr" />
          </label>
          <button type="submit" className="btn btn-dark">Recevoir un lien de connexion</button>
        </form>
      </div>
    </main>
  );
}
