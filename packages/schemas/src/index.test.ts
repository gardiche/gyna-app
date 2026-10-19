import { test } from "node:test";
import assert from "node:assert/strict";
import { maskMissionTokens, normalizeLinkedinUrl, ProspectInput } from "./index.js";

test("masque les jetons de mission, même mal recopiés, sans toucher au reste", () => {
  assert.equal(maskMissionTokens("le jeton `gm-46pe4-kdq8q-zsy6-c3zeh` est refusé"), "le jeton `[jeton masqué]` est refusé");
  assert.equal(maskMissionTokens("mission_token: GM-SK7M2-9XS4T-H3W8N-B6R5S."), "mission_token: [jeton masqué].");
  assert.equal(maskMissionTokens("eyJhbGciOiJIUzI1NiJ9.eyJvcmdfaWQiOiJ4In0.c2lnbmF0dXJlLXRlc3Q"), "[jeton masqué]");
  assert.equal(maskMissionTokens("Programme gm-2027, 16 semaines"), "Programme gm-2027, 16 semaines");
});

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
