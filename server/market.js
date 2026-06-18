import { findWeaponCatalogEntry, weaponCatalog } from "./catalog.js";

const MARKET_BASE_URL = "https://api.warframe.market/v1";
const RIVEN_MARKET_BASE_URL = "https://riven.market/_modules/riven/showrivens.php";
const VARIANT_WORDS = new Set(["prime", "vandal", "wraith"]);
export const MARKET_REFRESH_INTERVAL_MS = 60000;
export const MARKET_MIN_REFRESH_INTERVAL_MS = 10000;
export const MARKET_MIN_REQUEST_INTERVAL_MS = 1000;
export const MARKET_RATE_LIMIT_BACKOFF_MS = 10000;
export const MARKET_FORCE_REFRESH_WEAPON_LIMIT = 3;
const MARKET_RATE_LIMIT_STATUS = 429;
const MARKET_WEAPON_SORTS = ["price_asc", "price_desc"];
const RIVEN_MARKET_TIMEOUT_MS = 8000;

const attributeLabels = {
  "base_damage_/_melee_damage": "Base Damage",
  critical_chance: "Critical Chance",
  critical_damage: "Critical Damage",
  multishot: "Multishot",
  cold_damage: "Cold Damage",
  heat_damage: "Heat Damage",
  electric_damage: "Electricity Damage",
  toxin_damage: "Toxin Damage",
  ammo_maximum: "Ammo Maximum",
  zoom: "Zoom",
  recoil: "Recoil",
  status_chance: "Status Chance",
  status_duration: "Status Duration",
  "fire_rate_/_attack_speed": "Fire Rate / Attack Speed",
  reload_speed: "Reload Speed",
  punch_through: "Punch Through",
  damage_vs_corpus: "Damage to Corpus",
  damage_vs_grineer: "Damage to Grineer",
  damage_vs_infested: "Damage to Infested",
  impact_damage: "Impact Damage",
  puncture_damage: "Puncture Damage",
  slash_damage: "Slash Damage",
  channeling_damage: "Initial Combo",
  channeling_efficiency: "Heavy Attack Efficiency",
  finisher_damage: "Finisher Damage",
  critical_chance_on_slide_attack: "Critical Chance on Slide Attack"
};

const appToMarketStat = {
  damage: "base_damage_/_melee_damage",
  cold: "cold_damage",
  heat: "heat_damage",
  electricity: "electric_damage",
  toxin: "toxin_damage",
  fire_rate: "fire_rate_/_attack_speed",
  impact: "impact_damage",
  puncture: "puncture_damage",
  slash: "slash_damage",
  initial_combo: "channeling_damage",
  heavy_attack_efficiency: "channeling_efficiency",
  critical_chance_slide: "critical_chance_on_slide_attack"
};

const appToRivenMarketStat = {
  damage: "Damage",
  multishot: "Multi",
  fire_rate: "Speed",
  damage_vs_corpus: "Corpus",
  damage_vs_grineer: "Grineer",
  damage_vs_infested: "Infested",
  impact: "Impact",
  puncture: "Puncture",
  slash: "Slash",
  cold: "Cold",
  electricity: "Electric",
  heat: "Heat",
  toxin: "Toxin",
  combo_duration: "Combo",
  critical_chance: "CritChance",
  critical_chance_slide: "Slide",
  critical_damage: "CritDmg",
  finisher_damage: "Finisher",
  projectile_speed: "Flight",
  ammo_maximum: "Ammo",
  magazine_capacity: "Magazine",
  punch_through: "Punch",
  reload_speed: "Reload",
  range: "Range",
  status_chance: "StatusC",
  status_duration: "StatusD",
  recoil: "Recoil",
  zoom: "Zoom",
  initial_combo: "InitC",
  heavy_attack_efficiency: "ComboEfficiency",
  additional_combo_count_chance: "ComboGainExtra"
};

const marketToAppStat = new Map(
  Object.entries(appToMarketStat).map(([appKey, marketKey]) => [marketKey, appKey])
);
const rivenMarketToAppStat = new Map(
  Object.entries(appToRivenMarketStat).map(([appKey, marketKey]) => [marketKey, appKey])
);

const cache = new Map();
const weaponCache = new Map();
const marketUrlToFamily = new Map(weaponCatalog.map(weapon => [weapon.marketUrlName, weapon.family]));
let marketRequestChain = Promise.resolve();
let lastMarketRequestAt = 0;

export function normalizeMarketRefreshIntervalMs(value = MARKET_REFRESH_INTERVAL_MS) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MARKET_REFRESH_INTERVAL_MS;
  return Math.max(MARKET_MIN_REFRESH_INTERVAL_MS, Math.floor(numeric));
}

class MarketRateLimitError extends Error {
  constructor(message, { retryAfterMs }) {
    super(message);
    this.name = "MarketRateLimitError";
    this.code = "MARKET_RATE_LIMITED";
    this.retryAfterMs = retryAfterMs;
  }
}

function titleCaseToken(token) {
  if (/^[a-z]{2,3}_?\d+$/i.test(token)) return token.toUpperCase().replace("_", "-");
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function weaponUrlNameFromFamily(family) {
  const weapon = findWeaponCatalogEntry(family);
  if (weapon?.marketUrlName) return weapon.marketUrlName;

  return String(family)
    .trim()
    .toLowerCase()
    .replace(/\b(prime|vandal|wraith)\b/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function marketStatKey(appKey) {
  return appToMarketStat[appKey] || appKey;
}

export function appStatKey(marketKey) {
  return marketToAppStat.get(marketKey) || marketKey;
}

export function rivenMarketStatKey(appKey) {
  return appToRivenMarketStat[appKey] || appKey;
}

export function appStatKeyFromRivenMarket(marketKey) {
  return rivenMarketToAppStat.get(marketKey) || marketKey;
}

export function weaponFamilyFromMarketName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  const knownFamily = marketUrlToFamily.get(normalized);
  if (knownFamily) return knownFamily;

  const words = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .split("_")
    .filter(Boolean)
    .filter(word => !VARIANT_WORDS.has(word));

  return words.map(titleCaseToken).join(" ");
}

export function auctionOwnerIsOnline(owner = {}) {
  return owner.status === "online" || owner.status === "ingame";
}

export function uniqueWeaponFamiliesFromAuctions(auctions) {
  return [...new Set(auctions.map(auction => weaponFamilyFromMarketName(auction.item?.weapon_url_name || "")).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export function formatAuctionAttributes(attributes = []) {
  return attributes
    .map(attribute => {
      const sign = attribute.positive === false ? "-" : "+";
      const label = attributeLabels[attribute.url_name] || titleCaseToken(String(attribute.url_name || "").replace(/_/g, " "));
      return `${sign}${label}`;
    })
    .join(", ");
}

export function normalizeMarketAuction(auction) {
  const weapon = weaponFamilyFromMarketName(auction.item?.weapon_url_name || "");
  const owner = auction.owner || {};
  const price = auction.buyout_price || auction.starting_price || auction.top_bid || 0;
  const status = auctionOwnerIsOnline(owner) ? "online" : "offline";
  const attributes = (auction.item?.attributes || []).map(attribute => ({
    key: appStatKey(attribute.url_name),
    marketKey: attribute.url_name,
    value: attribute.value,
    positive: attribute.positive !== false
  }));

  return {
    id: auction.id,
    source: "warframe.market",
    marketUrl: `https://warframe.market/auction/${auction.id}`,
    weapon,
    title: `${weapon} ${auction.item?.name || "Riven"}`.trim(),
    rivenName: `${weapon} ${auction.item?.name || "Riven"}`.trim(),
    attributes,
    statsEn: formatAuctionAttributes(auction.item?.attributes || []),
    statsZh: formatAuctionAttributes(auction.item?.attributes || []),
    price: `${price}p`,
    sellerName: owner.ingame_name || "Unknown",
    status,
    time: auction.updated || auction.created || "",
    polarity: auction.item?.polarity || "",
    mastery: auction.item?.mastery_level ?? null,
    rank: auction.item?.mod_rank ?? null,
    rerolls: auction.item?.re_rolls ?? null
  };
}

export function marketSearchParamsForRiven(riven) {
  const positives = (riven.positives || []).filter(Boolean).map(marketStatKey);
  const params = {
    type: "riven",
    weapon_url_name: weaponUrlNameFromFamily(riven.target)
  };
  if (positives.length) {
    params.positive_stats = positives.join(",");
    params.operation = "allOf";
  }
  if (riven.negative) params.negative_stats = marketStatKey(riven.negative);
  return params;
}

function marketSearchParamsForWeapon(weapon, { sortBy = "" } = {}) {
  const params = {
    type: "riven",
    weapon_url_name: weaponUrlNameFromFamily(weapon)
  };
  if (sortBy) params.sort_by = sortBy;
  return params;
}

export function marketHitMatchesRiven(hit, riven) {
  const positiveKeys = new Set((hit.attributes || []).filter(attr => attr.positive).map(attr => attr.key));
  const negativeKeys = new Set((hit.attributes || []).filter(attr => !attr.positive).map(attr => attr.key));
  const wantedPositiveKeys = (riven.positives || []).filter(Boolean);
  const positivesMatch = wantedPositiveKeys.every(key => positiveKeys.has(key));
  const negativeMatches = !riven.negative || negativeKeys.has(riven.negative);
  return positivesMatch && negativeMatches && marketHitMatchesRivenPrice(hit, riven);
}

function marketPriceNumber(price) {
  const value = Number(String(price || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(value) ? value : NaN;
}

function marketHitMatchesRivenPrice(hit, riven) {
  const hasMin = Boolean(String(riven.minPrice || "").replace(/[^\d]/g, ""));
  const hasMax = Boolean(String(riven.price || "").replace(/[^\d]/g, ""));
  if (!hasMin && !hasMax) return true;
  const actual = marketPriceNumber(hit.price);
  if (!Number.isFinite(actual)) return false;
  if (hasMin && actual <= marketPriceNumber(riven.minPrice)) return false;
  if (hasMax && actual >= marketPriceNumber(riven.price)) return false;
  return true;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cloneHit(hit) {
  return { ...hit, attributes: [...(hit.attributes || [])] };
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'");
}

function stripHtml(value = "") {
  return decodeHtml(String(value).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attrValue(html = "", name = "") {
  const match = html.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function rivenMarketWeaponNameFromFamily(family) {
  const weapon = findWeaponCatalogEntry(family);
  return (weapon?.family || family)
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("_");
}

function rivenMarketFamilyFromWeaponName(value) {
  const normalized = String(value || "").replace(/_/g, " ");
  return findWeaponCatalogEntry(normalized)?.family || normalized;
}

function rivenMarketSearchParamsForWeapon(weapon) {
  return {
    baseurl: "Lw==",
    platform: "ALL",
    limit: "50",
    recency: "-1",
    veiled: "false",
    onlinefirst: "true",
    polarity: "all",
    rank: "all",
    mastery: "16",
    weapon: rivenMarketWeaponNameFromFamily(weapon),
    stats: "Any",
    neg: "all",
    price: "99999",
    rerolls: "-1",
    sort: "time",
    direction: "ASC",
    page: "1"
  };
}

function rivenMarketSearchUrlForWeapon(weapon) {
  const url = new URL(RIVEN_MARKET_BASE_URL);
  Object.entries(rivenMarketSearchParamsForWeapon(weapon)).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
}

async function readTextWithTimeout(url, {
  fetchImpl = fetch,
  timeoutMs = RIVEN_MARKET_TIMEOUT_MS
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || RIVEN_MARKET_TIMEOUT_MS));
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html, */*",
        "user-agent": "WarframeRivenSniperPrototype/0.1"
      }
    });
    if (!response.ok) throw new Error(`Riven.market returned ${response.status}`);
    return response.text();
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Riven.market timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function rivenMarketBlocks(html = "") {
  const blocks = [];
  const marker = /<div class="riven\b[^"]*"[\s\S]*?>/gi;
  const matches = [...String(html).matchAll(marker)];
  matches.forEach((match, index) => {
    const start = match.index;
    const end = matches[index + 1]?.index ?? String(html).indexOf("<div class=\"pagination\"", start + 1);
    blocks.push(String(html).slice(start, end > start ? end : undefined));
  });
  return blocks;
}

function rivenMarketStatus(block = "") {
  const onlineMatch = block.match(/<div class="attribute online ([^"]*)"/i);
  const statusClass = onlineMatch ? onlineMatch[1] : "";
  if (statusClass.includes("offline")) return "offline";
  return statusClass.includes("ingame") || block.includes("attribute online") ? "online" : "offline";
}

function rivenMarketSeller(block = "") {
  const match = block.match(/<div class="attribute seller[^"]*">([\s\S]*?)<\/div>/i);
  const text = stripHtml(match?.[1] || "");
  return text.replace(/\([A-Z0-9]+\)$/i, "").trim() || "Unknown";
}

function normalizeRivenMarketBlock(block = "") {
  const weapon = rivenMarketFamilyFromWeaponName(attrValue(block, "data-weapon"));
  const name = attrValue(block, "data-name") || "Riven";
  const user = attrValue(block, "data-user");
  const price = attrValue(block, "data-price") || "0";
  const attributes = [];

  [1, 2, 3, 4].forEach(index => {
    const stat = attrValue(block, `data-stat${index}`);
    if (!stat) return;
    const value = Number(attrValue(block, `data-stat${index}val`));
    attributes.push({
      key: appStatKeyFromRivenMarket(stat),
      marketKey: stat,
      value: Number.isFinite(value) ? value : 0,
      positive: index < 4
    });
  });

  const listingId = block.match(/id="price_(\d+)"/i)?.[1] || "";
  const id = listingId ? `riven-market-${listingId}` : `riven-market-${user}-${weapon}-${name}-${price}-${attributes.map(attr => `${attr.marketKey}:${attr.value}`).join("|")}`;
  return {
    id,
    source: "riven.market",
    marketUrl: "https://riven.market/list/ALL",
    weapon,
    title: `${weapon} ${name}`.trim(),
    rivenName: `${weapon} ${name}`.trim(),
    attributes,
    statsEn: attributes.map(attr => `${attr.positive ? "+" : "-"}${attr.key}`).join(", "),
    statsZh: attributes.map(attr => `${attr.positive ? "+" : "-"}${attr.key}`).join(", "),
    price: `${price}p`,
    sellerName: rivenMarketSeller(block),
    status: rivenMarketStatus(block),
    time: attrValue(block, "data-age") || "",
    polarity: attrValue(block, "data-polarity") || "",
    mastery: Number(attrValue(block, "data-mr")) || null,
    rank: Number(attrValue(block, "data-rank")) || null,
    rerolls: Number(attrValue(block, "data-rerolls")) || null
  };
}

async function fetchRivenMarketHitsForWeapon(weapon, {
  scope = "online",
  fetchImpl = fetch
} = {}) {
  const html = await readTextWithTimeout(rivenMarketSearchUrlForWeapon(weapon), { fetchImpl });
  return rivenMarketBlocks(html)
    .map(normalizeRivenMarketBlock)
    .filter(hit => scope === "all" || hit.status === "online");
}

function backoffDelayMs(attempt, baseMs = MARKET_RATE_LIMIT_BACKOFF_MS) {
  return Math.min(baseMs * (2 ** Math.max(0, attempt - 1)), 40000);
}

async function queuedMarketFetch(url, {
  fetchImpl = fetch,
  sleep = wait,
  minRequestIntervalMs = MARKET_MIN_REQUEST_INTERVAL_MS
} = {}) {
  const request = marketRequestChain.then(async () => {
    const elapsed = Date.now() - lastMarketRequestAt;
    const delay = Math.max(0, minRequestIntervalMs - elapsed);
    if (delay) await sleep(delay);

    const response = await fetchImpl(url, {
      headers: {
        "accept": "application/json",
        "user-agent": "WarframeRivenSniperPrototype/0.1"
      }
    });
    lastMarketRequestAt = Date.now();
    return response;
  });

  marketRequestChain = request.catch(() => {});
  return request;
}

async function readMarketPayload(url, {
  fetchImpl = fetch,
  sleep = wait,
  minRequestIntervalMs = MARKET_MIN_REQUEST_INTERVAL_MS,
  rateLimitBackoffMs = MARKET_RATE_LIMIT_BACKOFF_MS,
  maxRateLimitRetries = 3
} = {}) {
  let attempt = 0;

  while (true) {
    const response = await queuedMarketFetch(url, { fetchImpl, sleep, minRequestIntervalMs });
    if (response.status === MARKET_RATE_LIMIT_STATUS && attempt < maxRateLimitRetries) {
      attempt += 1;
      await sleep(backoffDelayMs(attempt, rateLimitBackoffMs));
      continue;
    }
    if (response.status === MARKET_RATE_LIMIT_STATUS) {
      throw new MarketRateLimitError("Warframe.Market rate limited this refresh.", {
        retryAfterMs: backoffDelayMs(maxRateLimitRetries, rateLimitBackoffMs)
      });
    }
    if (!response.ok) throw new Error(`Warframe.Market returned ${response.status}`);
    const body = await response.json();
    return body.payload || {};
  }
}

async function readMarketPayloadWithoutQueue(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "WarframeRivenSniperPrototype/0.1"
    }
  });
  if (!response.ok) throw new Error(`Warframe.Market returned ${response.status}`);
  const body = await response.json();
  return body.payload || {};
}

export async function fetchMarketHits({ weapon = "Rubico", scope = "online", limit = 50 } = {}) {
  const url = new URL(`${MARKET_BASE_URL}/auctions/search`);
  url.searchParams.set("type", "riven");
  url.searchParams.set("weapon_url_name", weaponUrlNameFromFamily(weapon));
  const payload = await readMarketPayload(url);
  return (payload.auctions || [])
    .map(normalizeMarketAuction)
    .filter(hit => scope === "all" || hit.status === "online")
    .slice(0, Math.max(1, Math.min(Number(limit) || 50, 100)));
}

async function fetchMarketHitsForRiven(riven, { scope = "online", limit = 50, ...requestOptions } = {}) {
  const url = new URL(`${MARKET_BASE_URL}/auctions/search`);
  Object.entries(marketSearchParamsForRiven(riven)).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  const payload = await readMarketPayload(url, requestOptions);
  return (payload.auctions || [])
    .map(normalizeMarketAuction)
    .filter(hit => scope === "all" || hit.status === "online")
    .filter(hit => marketHitMatchesRiven(hit, riven))
    .slice(0, Math.max(1, Math.min(Number(limit) || 50, 100)));
}

async function fetchMarketHitsForWeapon(weapon, { scope = "online", ...requestOptions } = {}) {
  const hitsById = new Map();

  for (const sortBy of MARKET_WEAPON_SORTS) {
    const url = new URL(`${MARKET_BASE_URL}/auctions/search`);
    Object.entries(marketSearchParamsForWeapon(weapon, { sortBy })).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    const payload = await readMarketPayload(url, requestOptions);
    for (const hit of (payload.auctions || []).map(normalizeMarketAuction)) {
      if (scope !== "all" && hit.status !== "online") continue;
      if (!hitsById.has(hit.id)) hitsById.set(hit.id, hit);
    }
  }

  return [...hitsById.values()];
}

function cacheKeyForRivens(rivens, scope, namespace = "default") {
  return JSON.stringify({
    namespace,
    scope,
    rivens: rivens.map(riven => ({
      id: riven.id,
      target: riven.target,
      positives: riven.positives || [],
      negative: riven.negative || ""
    }))
  });
}

function groupRivensByWeapon(rivens) {
  const groups = new Map();
  rivens.forEach(riven => {
    const weaponUrlName = weaponUrlNameFromFamily(riven.target);
    if (!groups.has(weaponUrlName)) {
      groups.set(weaponUrlName, { weapon: riven.target, weaponUrlName, rivens: [] });
    }
    groups.get(weaponUrlName).rivens.push(riven);
  });
  return [...groups.values()];
}

function weaponCacheKey({ weaponUrlName, scope, namespace = "default" }) {
  return JSON.stringify({ namespace, scope, weaponUrlName });
}

function cacheMeta({
  status = "fresh",
  cached,
  refreshIntervalMs = MARKET_REFRESH_INTERVAL_MS,
  nextRefreshInMs = MARKET_REFRESH_INTERVAL_MS,
  retryAfterMs = 0,
  weaponsSearched = 0,
  rivensSearched = 0,
  groups = [],
  rateLimitBackoffMs = MARKET_RATE_LIMIT_BACKOFF_MS,
  forceLimited = false
} = {}) {
  const cacheAgeMs = cached ? Date.now() - cached.refreshedAt : 0;
  return {
    source: "warframe.market + riven.market",
    status,
    rateLimited: status === "rate_limited",
    refreshIntervalMs,
    cacheAgeMs,
    nextRefreshInMs,
    retryAfterMs,
    refreshedAt: cached?.refreshedAt ? new Date(cached.refreshedAt).toISOString() : null,
    weaponsSearched,
    rivensSearched,
    trackedWeapons: groups.length,
    rateLimitBackoffMs,
    minRequestIntervalMs: MARKET_MIN_REQUEST_INTERVAL_MS,
    forceLimited
  };
}

async function fetchCachedMarketHitsForWeapon(group, {
  scope,
  force,
  fetchImpl,
  sleep,
  minRequestIntervalMs,
  rateLimitBackoffMs,
  maxRateLimitRetries,
  cacheNamespace,
  refreshIntervalMs
}) {
  const key = weaponCacheKey({ weaponUrlName: group.weaponUrlName, scope, namespace: cacheNamespace });
  const cached = weaponCache.get(key);
  const now = Date.now();
  if (!force && cached && now - cached.refreshedAt < refreshIntervalMs) {
    return { hits: cached.data.map(cloneHit), searched: false, cached: true };
  }

  const hits = await fetchMarketHitsForWeapon(group.weapon, {
    scope,
    fetchImpl,
    sleep,
    minRequestIntervalMs,
    rateLimitBackoffMs,
    maxRateLimitRetries
  });
  weaponCache.set(key, { data: hits.map(cloneHit), refreshedAt: now });
  return { hits, searched: true, cached: false };
}

async function fetchCachedRivenMarketHitsForWeapon(group, {
  scope,
  force,
  fetchImpl,
  cacheNamespace,
  refreshIntervalMs
}) {
  const key = weaponCacheKey({ weaponUrlName: group.weaponUrlName, scope, namespace: `${cacheNamespace}:riven.market` });
  const cached = weaponCache.get(key);
  const now = Date.now();
  if (!force && cached && now - cached.refreshedAt < refreshIntervalMs) {
    return { hits: cached.data.map(cloneHit), searched: false, cached: true, error: "" };
  }

  try {
    const hits = await fetchRivenMarketHitsForWeapon(group.weapon, { scope, fetchImpl });
    weaponCache.set(key, { data: hits.map(cloneHit), refreshedAt: now });
    return { hits, searched: true, cached: false, error: "" };
  } catch (error) {
    return {
      hits: cached ? cached.data.map(cloneHit) : [],
      searched: false,
      cached: Boolean(cached),
      error: error.message || "Riven.market unavailable"
    };
  }
}

export async function fetchLiveHitsForRivens(rivens, {
  scope = "online",
  force = false,
  limitPerRiven = 50,
  fetchImpl = fetch,
  sleep = wait,
  minRequestIntervalMs = MARKET_MIN_REQUEST_INTERVAL_MS,
  rateLimitBackoffMs = MARKET_RATE_LIMIT_BACKOFF_MS,
  maxRateLimitRetries = 3,
  cacheNamespace = "default",
  refreshIntervalMs = MARKET_REFRESH_INTERVAL_MS
} = {}) {
  const resolvedRefreshIntervalMs = normalizeMarketRefreshIntervalMs(refreshIntervalMs);
  if (!rivens.length) {
    return {
      data: [],
      meta: {
        source: "warframe.market + riven.market",
        refreshIntervalMs: resolvedRefreshIntervalMs,
        cacheAgeMs: 0,
        nextRefreshInMs: resolvedRefreshIntervalMs,
        refreshedAt: null
      }
    };
  }

  const key = cacheKeyForRivens(rivens, scope, cacheNamespace);
  const now = Date.now();
  const cached = cache.get(key);
  const groups = groupRivensByWeapon(rivens);
  const forceLimited = force && groups.length > MARKET_FORCE_REFRESH_WEAPON_LIMIT;
  if (!force && cached && now - cached.refreshedAt < resolvedRefreshIntervalMs) {
    const cacheAgeMs = now - cached.refreshedAt;
    return {
      data: cached.data.map(cloneHit),
      meta: {
        ...cacheMeta({
          status: "cached",
          cached,
          refreshIntervalMs: resolvedRefreshIntervalMs,
          nextRefreshInMs: Math.max(0, resolvedRefreshIntervalMs - cacheAgeMs),
          weaponsSearched: cached.weaponsSearched || 0,
          rivensSearched: rivens.length,
          groups,
          rateLimitBackoffMs
        }),
        cacheAgeMs,
      }
    };
  }

  const data = [];
  let weaponsSearched = 0;
  let rivenMarketSearched = 0;
  const sourceErrors = [];
  try {
    for (const group of groups) {
      const weaponResult = await fetchCachedMarketHitsForWeapon(group, {
        scope,
        force: force && !forceLimited,
        fetchImpl,
        sleep,
        minRequestIntervalMs,
        rateLimitBackoffMs,
        maxRateLimitRetries,
        cacheNamespace,
        refreshIntervalMs: resolvedRefreshIntervalMs
      });
      if (weaponResult.searched) weaponsSearched += 1;
      const rivenMarketResult = await fetchCachedRivenMarketHitsForWeapon(group, {
        scope,
        force: force && !forceLimited,
        fetchImpl,
        cacheNamespace,
        refreshIntervalMs: resolvedRefreshIntervalMs
      });
      if (rivenMarketResult.searched) rivenMarketSearched += 1;
      if (rivenMarketResult.error) sourceErrors.push(rivenMarketResult.error);
      const groupHits = [...weaponResult.hits, ...rivenMarketResult.hits];
      for (const riven of group.rivens) {
        const matches = groupHits
          .filter(hit => marketHitMatchesRiven(hit, riven))
          .slice(0, Math.max(1, Math.min(Number(limitPerRiven) || 50, 100)));
        data.push(...matches.map(hit => ({ ...hit, rivenId: riven.id })));
      }
    }
  } catch (error) {
    if (error.code === "MARKET_RATE_LIMITED") {
      const retryAfterMs = error.retryAfterMs || rateLimitBackoffMs;
      return {
        data: cached ? cached.data.map(cloneHit) : [],
        meta: cacheMeta({
          status: "rate_limited",
          cached,
          refreshIntervalMs: resolvedRefreshIntervalMs,
          nextRefreshInMs: retryAfterMs,
          retryAfterMs,
          weaponsSearched,
          rivensSearched: rivens.length,
          groups,
          rateLimitBackoffMs,
          forceLimited
        })
      };
    }
    throw error;
  }
  cache.set(key, { data, refreshedAt: now, weaponsSearched: weaponsSearched + rivenMarketSearched });

  return {
    data: data.map(cloneHit),
    meta: {
      ...cacheMeta({
        status: (weaponsSearched + rivenMarketSearched) ? "fresh" : "cached",
        cached: { refreshedAt: now },
        refreshIntervalMs: resolvedRefreshIntervalMs,
        nextRefreshInMs: resolvedRefreshIntervalMs,
        weaponsSearched: weaponsSearched + rivenMarketSearched,
        rivensSearched: rivens.length,
        groups,
        rateLimitBackoffMs,
        forceLimited
      }),
      sources: {
        "warframe.market": { searchedWeapons: weaponsSearched },
        "riven.market": {
          searchedWeapons: rivenMarketSearched,
          errors: [...new Set(sourceErrors)].slice(0, 3)
        }
      }
    }
  };
}

export async function fetchMarketWeaponFamilies({ scope = "all", limit = 500 } = {}) {
  const payload = await readMarketPayloadWithoutQueue(`${MARKET_BASE_URL}/auctions`);
  const auctions = (payload.auctions || [])
    .filter(auction => scope === "all" || auctionOwnerIsOnline(auction.owner))
    .slice(0, Math.max(1, Math.min(Number(limit) || 500, 2000)));

  return uniqueWeaponFamiliesFromAuctions(auctions).map(family => ({
    family,
    label: family,
    labels: { en: family, zh: family },
    group: null,
    rivenEligible: true
  }));
}
