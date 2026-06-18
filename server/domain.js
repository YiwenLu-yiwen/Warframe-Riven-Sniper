import { findWeaponCatalogEntry, statCatalog, weaponCatalog } from "./catalog.js";
import { fetchLiveHitsForRivens, MARKET_REFRESH_INTERVAL_MS } from "./market.js";
import { listRivens } from "./store.js";

export function listWeapons({ lang = "en", query = "" } = {}) {
  const needle = query.trim().toLowerCase();
  return weaponCatalog
    .filter(weapon => !needle || `${weapon.family} ${weapon.zh} ${weapon.group}`.toLowerCase().includes(needle))
    .map(weapon => ({
      family: weapon.family,
      label: lang === "zh" ? weapon.zh : weapon.family,
      labels: { en: weapon.family, zh: weapon.zh },
      group: weapon.group,
      rivenEligible: true
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

export function findWeapon(familyOrLabel) {
  return findWeaponCatalogEntry(familyOrLabel);
}

export function listStats({ weapon = "Rubico", polarity = "positive", lang = "en" } = {}) {
  const found = findWeapon(weapon);
  if (!found) return null;
  const isNegative = polarity === "negative";
  const group = found?.group === "archmelee" ? "melee" : found?.group;
  return statCatalog
    .filter(stat => stat.key === "" || ((!group || stat.groups.includes(group)) && (!isNegative || !stat.positiveOnly)))
    .map(stat => ({
      key: stat.key,
      label: stat.key ? (lang === "zh" ? stat.zh : stat.en) : (lang === "zh" ? "不限定" : "No preference"),
      labels: { en: stat.en, zh: stat.zh },
      positiveOnly: Boolean(stat.positiveOnly),
      groups: stat.groups
    }));
}

export async function listLiveWeapons({ lang = "en", query = "" } = {}) {
  return listWeapons({ lang, query });
}

export async function listHits({ scope = "online", rivenId, force = false } = {}) {
  const rivens = listRivens().filter(riven => !rivenId || riven.id === rivenId);
  return fetchLiveHitsForRivens(rivens, { scope, force });
}

export async function health() {
  const rivens = listRivens();
  return {
    status: "ok",
    weapons: weaponCatalog.length,
    rivens: rivens.length,
    onlineHits: 0,
    refreshIntervalMs: MARKET_REFRESH_INTERVAL_MS,
    source: "warframe.market, warframe wiki, warframestat.us"
  };
}
