/**
 * Lightweight unit checks for Places helpers (no network).
 * Run: pnpm --filter @nemo/workspace exec tsx --tsconfig tsconfig.json lib/ingest/places.test.ts
 */
import assert from "node:assert/strict";

import {
  buildPlaceQuery,
  businessNameFromTitle,
  extractPhoneCandidate,
} from "./places";

assert.equal(
  businessNameFromTitle("Superior Sealing – Utah Concrete Restoration"),
  "Superior Sealing",
);
assert.equal(businessNameFromTitle("Acme | Home"), "Acme");
assert.equal(extractPhoneCandidate("Call 801-413-9403 today"), "801-413-9403");
assert.match(
  buildPlaceQuery({
    businessName: "Superior Sealing",
    phone: "801-413-9403",
    websiteHost: "superiorsealingutah.com",
  }),
  /Superior Sealing/,
);

console.log("places helpers ok");
