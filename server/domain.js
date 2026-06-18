import { findWeaponCatalogEntry, statCatalog, weaponCatalog } from "./catalog.js";
import { fetchLiveHitsForRivens, MARKET_REFRESH_INTERVAL_MS } from "./market.js";
import { listRivens } from "./store.js";
import { analyzeRiven, dispositionSummary, recommendedAnalysisStats } from "../shared/riven-analysis.js";

export function listWeapons({ lang = "en", query = "" } = {}) {
  const needle = query.trim().toLowerCase();
  return weaponCatalog
    .filter(weapon => !needle || `${weapon.family} ${weapon.zh} ${weapon.group}`.toLowerCase().includes(needle))
    .map(weapon => ({
      family: weapon.family,
      label: lang === "zh" ? weapon.zh : weapon.family,
      labels: { en: weapon.family, zh: weapon.zh },
      group: weapon.group,
      disposition: weapon.disposition,
      analysis: {
        disposition: dispositionSummary(weapon.disposition),
        recommended: recommendedAnalysisStats({ group: weapon.group, statCatalog, lang })
      },
      rivenEligible: true
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

export function findWeapon(familyOrLabel) {
  return findWeaponCatalogEntry(familyOrLabel);
}

export function enrichRiven(riven, { lang = "en" } = {}) {
  const found = findWeapon(riven.target);
  if (!found) return riven;
  return {
    ...riven,
    weapon: {
      family: found.family,
      label: lang === "zh" ? found.zh : found.family,
      labels: { en: found.family, zh: found.zh },
      group: found.group,
      disposition: found.disposition,
      analysis: {
        disposition: dispositionSummary(found.disposition),
        recommended: recommendedAnalysisStats({ group: found.group, statCatalog, lang })
      }
    }
  };
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

export function getRivenAnalysis({ weapon = "Rubico", positives = "", negative = "", lang = "en" } = {}) {
  const found = findWeapon(weapon);
  if (!found) return null;
  return {
    ...analyzeRiven({
      weapon: found.family,
      group: found.group,
      disposition: found.disposition,
      positives,
      negative,
      statCatalog,
      lang
    }),
    weapon: {
      family: found.family,
      label: lang === "zh" ? found.zh : found.family,
      labels: { en: found.family, zh: found.zh }
    }
  };
}

export async function listLiveWeapons({ lang = "en", query = "" } = {}) {
  return listWeapons({ lang, query });
}

export async function listHits({ scope = "online", rivenId, force = false, refreshMs } = {}) {
  const rivens = listRivens().filter(riven => !rivenId || riven.id === rivenId);
  return fetchLiveHitsForRivens(rivens, { scope, force, refreshIntervalMs: refreshMs });
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
