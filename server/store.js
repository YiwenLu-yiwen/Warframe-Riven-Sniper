import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findWeaponCatalogEntry } from "./catalog.js";

let nextId = 1;
let rivens = [];
let storePath = process.env.RIVEN_STORE_PATH || join(process.cwd(), "data", "rivens.json");
let persistStore = process.env.RIVEN_STORE_PERSIST !== "false";
let loaded = false;

export function configureRivenStore({ path = storePath, persist = persistStore } = {}) {
  storePath = path;
  persistStore = persist;
  nextId = 1;
  rivens = [];
  loaded = !persistStore;
}

function loadRivens() {
  if (loaded) return;
  loaded = true;
  if (!persistStore || !existsSync(storePath)) return;

  try {
    const body = JSON.parse(readFileSync(storePath, "utf8"));
    nextId = Number.isInteger(body.nextId) && body.nextId > 0 ? body.nextId : 1;
    rivens = Array.isArray(body.rivens) ? body.rivens.map(riven => ({
      ...riven,
      positives: normalizeList(riven.positives)
    })) : [];
  } catch {
    nextId = 1;
    rivens = [];
  }
}

function saveRivens() {
  if (!persistStore) return;
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify({ nextId, rivens }, null, 2), "utf8");
}

function normalizeList(value) {
  return Array.isArray(value) ? value.slice(0, 3).map(item => String(item || "").trim()) : [];
}

export function validateRivenInput(input = {}) {
  const target = String(input.target || "").trim();
  if (!target) return { ok: false, message: "Weapon target is required." };
  const weapon = findWeaponCatalogEntry(target);
  if (!weapon) return { ok: false, message: "Choose a Riven weapon family from the catalog." };

  return {
    ok: true,
    value: {
      target: weapon.family,
      price: String(input.price || "").trim(),
      positives: normalizeList(input.positives),
      negative: String(input.negative || "").trim(),
      polarity: String(input.polarity || "Any").trim(),
      mastery: String(input.mastery || "").trim(),
      rank: String(input.rank || "Rank 8").trim(),
      rerolls: String(input.rerolls || "").trim()
    }
  };
}

export function listRivens() {
  loadRivens();
  return rivens.map(riven => ({ ...riven, positives: [...riven.positives] }));
}

export function createRiven(input) {
  loadRivens();
  const validation = validateRivenInput(input);
  if (!validation.ok) {
    const error = new Error(validation.message);
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  const riven = {
    id: `riven-${nextId++}`,
    ...validation.value
  };
  rivens.unshift(riven);
  saveRivens();
  return { ...riven, positives: [...riven.positives] };
}

export function deleteRiven(id) {
  loadRivens();
  const before = rivens.length;
  rivens = rivens.filter(riven => riven.id !== id);
  const deleted = rivens.length !== before;
  if (deleted) saveRivens();
  return deleted;
}

export function resetRivens() {
  nextId = 1;
  rivens = [];
  loaded = true;
  saveRivens();
}
