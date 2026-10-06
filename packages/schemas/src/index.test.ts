import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLinkedinUrl, ProspectInput } from "./index.js";

test("normalise les variantes d'une URL LinkedIn vers la même clé", () => {
  const variants = [
    "https://www.linkedin.com/in/Claire-Martin/",
    "http://linkedin.com/in/claire-martin?utm_source=x",
    "https://fr.linkedin.com/in/claire-martin#about",
    "linkedin.com/in/claire-martin///",
  ];
  for (const v of variants) assert.equal(normalizeLinkedinUrl(v), "linkedin.com/in/claire-martin");
});

test("refuse ce qui n'est pas un profil /in/", () => {
  assert.equal(normalizeLinkedinUrl("https://www.linkedin.com/company/alpact"), null);
  assert.equal(normalizeLinkedinUrl("https://example.com/in/claire"), null);
});

test("valide un prospect et rejette une URL invalide", () => {
  assert.ok(ProspectInput.safeParse({ linkedin_url: "https://www.linkedin.com/in/a", full_name: "A" }).success);
  assert.ok(!ProspectInput.safeParse({ linkedin_url: "https://x.com/a", full_name: "A" }).success);
});
