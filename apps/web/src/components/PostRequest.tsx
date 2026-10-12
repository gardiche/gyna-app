"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Prépare la demande d'un lot de posts : combien, pour quel réseau, quel compte, avec quelle matière. Gyna la reçoit dans le chat. */
export function PostRequest({ venture }: { venture: string }) {
  const router = useRouter();
  const [count, setCount] = useState(5);
  const [platform, setPlatform] = useState("Instagram");
  const [author, setAuthor] = useState(`la page ${venture}`);
  const [matter, setMatter] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt =
      `Posts ${venture} : prépare ${count} post${count > 1 ? "s" : ""} ${platform} pour ${author.trim() || `la page ${venture}`}, avec un brief visuel pour chacun.` +
      (matter.trim() ? `\n\nMatière : ${matter.trim()}` : "\n\nJe n'ai pas de matière particulière : reste sur ce que dit le brief.");
    router.push(`/nouvelle?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <form onSubmit={submit} className="asset-form" style={{ borderTop: 0, paddingTop: 0 }}>
      <label className="field" style={{ width: 90 }}>
        Combien
        <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
      </label>
      <label className="field">
        Réseau
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option>Instagram</option>
          <option>LinkedIn</option>
        </select>
      </label>
      <label className="field" style={{ flex: "1 1 180px" }}>
        Qui publie
        <input value={author} maxLength={80} onChange={(e) => setAuthor(e.target.value)} />
      </label>
      <label className="field" style={{ flex: "2 1 320px" }}>
        Matière (anecdote, chiffre, décision, question reçue)
        <input value={matter} maxLength={1500} placeholder="Facultatif, mais c'est ce qui rend les posts vivants" onChange={(e) => setMatter(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-lime btn-sm">Demander à Gyna</button>
    </form>
  );
}
