import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedinPostDate } from "./linkedin-dates.js";

// Identifiants relevés sur des publications réelles dont la date est connue par ailleurs.
test("la date d'une publication LinkedIn se lit dans son adresse, à la milliseconde", () => {
  assert.equal(
    linkedinPostDate("https://fr.linkedin.com/posts/guiot_castel-aka-tegvia-est-laur%C3%A9at-du-startup-activity-7515399517014441984-uw9G"),
    "2026-10-12T13:14:34.227Z",
  );
  assert.equal(linkedinPostDate("urn:li:activity:7514732682539491328"), "2026-10-10T17:04:48.499Z");
  assert.equal(linkedinPostDate("https://www.linkedin.com/feed/update/urn:li:ugcPost:7516101085896495104/"), "2026-10-14T11:42:21.283Z");
});

test("une adresse sans identifiant de publication, ou invraisemblable, ne donne pas de date", () => {
  assert.equal(linkedinPostDate("https://fr.linkedin.com/in/guiot"), null);
  assert.equal(linkedinPostDate("https://example.com/activity-12345"), null);
  // Un identifiant qui tomberait dans le futur n'est pas une date.
  assert.equal(linkedinPostDate("urn:li:activity:7515399517014441984", Date.UTC(2026, 0, 1)), null);
  // Un identifiant trop petit tomberait avant la naissance de ces identifiants.
  assert.equal(linkedinPostDate("urn:li:activity:1000000000000000000"), null);
});
