import test from "node:test";
import assert from "node:assert/strict";
import { isFounderTitle } from "./linkedin-profiles.js";

test("un intitulé de fondateur est reconnu, un métier de création de contenu ne l'est pas", () => {
  for (const t of ["Fondatrice", "Co-founder & CEO", "Créateur d'entreprise", "Créatrice de start-up", "Gérant", "Freelance", "Porteur de projet"]) assert.equal(isFounderTitle(t), true, t);
  for (const t of ["Créateur de contenu", "Créatrice de contenu digital", "Chargé de communication", "Responsable marketing"]) assert.equal(isFounderTitle(t), false, t);
});
