import { BrandKitContent } from "@gyna/schemas";

/** Les listes de la charte se saisissent une ligne par élément, champs séparés par « | ». */
const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const cells = (line: string) => line.split("|").map((c) => c.trim());

export const paletteText = (c: BrandKitContent) => c.palette.map((p) => [p.nom, p.hex, p.usage].filter((x, i) => i < 2 || x).join(" | ")).join("\n");
export const formatsText = (c: BrandKitContent) => c.formats.map((f) => [f.canal, f.format, f.note].filter((x, i) => i < 2 || x).join(" | ")).join("\n");
export const mentionsText = (c: BrandKitContent) => c.mentions.map((m) => [m.texte, m.ou].filter((x, i) => i < 1 || x).join(" | ")).join("\n");

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};

/** Lit le formulaire de la charte. Lève une erreur lisible si une valeur est invalide (couleur, nombre…). */
export function parseBrandKitForm(form: FormData): BrandKitContent {
  const text = (k: string) => String(form.get(k) ?? "");
  const adresse = text("adresse");
  const coin = text("logo_coin");
  const result = BrandKitContent.safeParse({
    logo: { coin: coin || null, taille_pct: num(form.get("logo_taille")), marge_pct: num(form.get("logo_marge")), plaque: text("logo_plaque") || "auto" },
    palette: lines(text("palette")).map((l) => {
      const [nom = "", hex = "", usage = ""] = cells(l);
      return { nom, hex, usage };
    }),
    polices: { titres: text("police_titres").trim(), texte: text("police_texte").trim() },
    ton: { adresse: adresse || null, registre: text("registre").trim() },
    interdits: {
      mots: lines(text("interdits_mots")),
      formules: lines(text("interdits_formules")),
      regles: lines(text("interdits_regles")),
      sans_exclamation: form.get("sans_exclamation") === "on",
      sans_emoji: form.get("sans_emoji") === "on",
      sans_tiret_cadratin: form.get("sans_tiret_cadratin") === "on",
      sans_prix: form.get("sans_prix") === "on",
    },
    formats: lines(text("formats")).map((l) => {
      const [canal = "", format = "", note = ""] = cells(l);
      return { canal, format, note };
    }),
    cible: text("cible").trim(),
    positionnement: text("positionnement").trim(),
    mentions: lines(text("mentions")).map((l) => {
      const [texte = "", ou = ""] = cells(l);
      return { texte, ou };
    }),
  });
  if (!result.success) {
    const i = result.error.issues[0]!;
    throw new Error(`Charte de marque : ${i.message} (${i.path.join(" › ")}).`);
  }
  return result.data;
}
