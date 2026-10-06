import { signIn } from "./actions";
import { Spark } from "@/components/icons";

export const metadata = { title: "Connexion à Gyna" };

const ERRORS: Record<string, string> = {
  champs: "Saisissez votre email et votre mot de passe.",
  identifiants: "Email ou mot de passe incorrect.",
  membre: "Ce compte n'est rattaché à aucune organisation. Demandez à un associé de vous ajouter.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const { error, email } = await searchParams;
  const message = error ? ERRORS[error] : null;

  return (
    <main className="login">
      <form action={signIn} className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <Spark size={30} />
          <span>Gyna</span>
        </div>

        <div className="login-intro">
          <h1 id="login-title">Connexion</h1>
          <p>Le cockpit d'acquisition d'Alpact.</p>
        </div>

        {message ? <p className="login-error" role="alert">{message}</p> : null}

        <label className="login-field">
          <span>Email</span>
          <input type="email" name="email" required autoComplete="email" defaultValue={email ?? ""} autoFocus={!email} />
        </label>
        <label className="login-field">
          <span>Mot de passe</span>
          <input type="password" name="password" required autoComplete="current-password" autoFocus={Boolean(email)} />
        </label>

        <button type="submit" className="login-submit">Se connecter</button>

        <p className="login-help">Mot de passe oublié ? Un associé peut le réinitialiser depuis Supabase.</p>
      </form>
    </main>
  );
}
