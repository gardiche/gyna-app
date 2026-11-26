import { test } from "node:test";
import assert from "node:assert/strict";
import { imageUrlOf, mapProfile } from "./linkedin-search.js";

test("une image se lit sous ses différentes formes, et seulement en https", () => {
  assert.equal(imageUrlOf("https://media.licdn.com/a.jpg"), "https://media.licdn.com/a.jpg");
  assert.equal(imageUrlOf({ url: "https://media.licdn.com/b.jpg" }), "https://media.licdn.com/b.jpg");
  assert.equal(
    imageUrlOf([{ url: "https://x.test/100.jpg", width: 100 }, { url: "https://x.test/400.jpg", width: 400 }, { url: "https://x.test/800.jpg", width: 800 }]),
    "https://x.test/400.jpg",
    "la plus grande jusqu'à 400 px",
  );
  assert.equal(imageUrlOf("http://insecure.test/a.jpg"), null);
  assert.equal(imageUrlOf("pas une adresse"), null);
  assert.equal(imageUrlOf(undefined), null);
});

test("le profil rapporte sa photo et le logo de son entreprise quand la source les donne, rien sinon", () => {
  const p = mapProfile({
    publicIdentifier: "claire-v", firstName: "Claire", lastName: "V", photo: "https://media.licdn.com/p.jpg",
    currentPosition: [{ title: "Fondatrice", companyName: "Atelier", companyLogo: "https://media.licdn.com/l.jpg" }],
  });
  assert.equal(p?.photo_url, "https://media.licdn.com/p.jpg");
  assert.equal(p?.company_logo_url, "https://media.licdn.com/l.jpg");
  const q = mapProfile({ publicIdentifier: "karim-b", firstName: "Karim", lastName: "B" });
  assert.equal(q?.photo_url, undefined);
  assert.equal(q?.company_logo_url, undefined);
});
