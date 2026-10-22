// Tests for the ID document helpers in web/idcheck.js (used by the browser, tested here).
import test from "node:test";
import assert from "node:assert/strict";
import idcheck from "../../web/idcheck.js";

const { looksLikeId, idHolder, sameName } = idcheck;

test("looksLikeId: ID and passport copies are recognised by file name", () => {
  assert.equal(looksLikeId("Shared drive/Consultants/Thandi Mokoena/ID copy.pdf"), true);
  assert.equal(looksLikeId("Shared drive/Consultants/Priya Naidoo/Passport copy.pdf"), true);
  assert.equal(looksLikeId("Thandi Mokoena ID.pdf"), true);
  assert.equal(looksLikeId("Identity document - Lerato.docx"), true);
});

test("looksLikeId: other files are not mistaken for ID documents", () => {
  assert.equal(looksLikeId("Shared drive/Consultants/Thandi Mokoena/DP-700 certificate.pdf"), false);
  assert.equal(looksLikeId("Past Projects/2024 Identity Management Platform.docx"), false);
  assert.equal(looksLikeId("Past Projects/Valid project report.docx"), false);
  // Only the file name counts, so a folder called "ID" does not turn every file into an ID.
  assert.equal(looksLikeId("ID/Project report.docx"), false);
});

test("idHolder: reads the name line", () => {
  assert.equal(idHolder("CERTIFIED COPY\nFull name: Thandi Mokoena\nDocument number: DEMO-ID-0101"), "Thandi Mokoena");
  assert.equal(idHolder("Holder: L. Nkosi\nIssued: 2020"), "L. Nkosi");
  assert.equal(idHolder("No name line in this text"), "");
  assert.equal(idHolder(undefined), "");
});

test("sameName: matches the same person and rejects a different one", () => {
  assert.equal(sameName("Thandi Mokoena", "Thandi Mokoena"), true);
  assert.equal(sameName("thandi mokoena", "Thandi  Mokoena"), true);
  assert.equal(sameName("Thandi N Mokoena", "Thandi Mokoena"), true);
  assert.equal(sameName("Thandi Mokoena", "Thandi Dlamini"), false);
  assert.equal(sameName("Sipho Dlamini", "Sipho Dlamin"), false);
});

test("sameName: an initial is accepted when the surname and first letter agree", () => {
  assert.equal(sameName("L. Nkosi", "Lerato Nkosi"), true);
  assert.equal(sameName("L. Nkosi", "Thabo Nkosi"), false);
});

test("sameName: two different people who share a surname and first letter are not merged without an initial", () => {
  assert.equal(sameName("John Smith", "Jane Smith"), false);
});

test("sameName: empty names never match", () => {
  assert.equal(sameName("", "Thandi Mokoena"), false);
  assert.equal(sameName(undefined, undefined), false);
});
