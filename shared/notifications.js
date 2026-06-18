export const MAX_NOTIFICATION_EVENTS = 30;
export const MAX_SEEN_HIT_KEYS = 500;
export const MAX_EVENTS_PER_REFRESH = 8;

function priceNumber(price) {
  const value = Number(String(price || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(value) ? value : NaN;
}

function normalizePlat(price) {
  const value = String(price || "").replace(/[^\d]/g, "");
  return value ? `${value}p` : "";
}

function boundedUnique(values, limit) {
  const seen = new Set();
  const unique = [];
  values.forEach(value => {
    const key = String(value || "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(key);
  });
  return unique.slice(Math.max(0, unique.length - limit));
}

export function hitNotificationKey(hit = {}) {
  return [
    hit.id,
    hit.rivenId,
    hit.sellerName,
    hit.rivenName || hit.title,
    hit.price
  ].map(value => String(value || "").trim()).join("::");
}

export function pruneNotificationState(state = {}) {
  return {
    initialized: Boolean(state.initialized),
    seenHitKeys: boundedUnique(state.seenHitKeys || [], MAX_SEEN_HIT_KEYS),
    events: (state.events || []).slice(Math.max(0, (state.events || []).length - MAX_NOTIFICATION_EVENTS)),
    rateLimitKey: String(state.rateLimitKey || "")
  };
}

function thresholdForRiven(riven = {}) {
  const max = normalizePlat(riven.price);
  return max && priceNumber(max) > 0 ? max : "";
}

function classifyHit(hit, riven) {
  if (hit.status !== "online") return null;
  const threshold = thresholdForRiven(riven);
  const actual = priceNumber(hit.price);
  if (threshold && Number.isFinite(actual) && actual < priceNumber(threshold)) return "low_price";
  return "new_online_hit";
}

function eventCopy(lang, type) {
  const copy = {
    zh: {
      low_price: "低价命中",
      new_online_hit: "新在线订单",
      threshold: "阈值",
      rate_limited: "限流等待",
      rateBody: seconds => `Warframe.Market 正在限流，约 ${seconds}s 后自动继续。`
    },
    en: {
      low_price: "Low price hit",
      new_online_hit: "New online listing",
      threshold: "threshold",
      rate_limited: "Rate limited",
      rateBody: seconds => `Warframe.Market is rate limited. Waiting about ${seconds}s before continuing.`
    }
  };
  return copy[lang]?.[type] || copy.en[type] || type;
}

function hitEvent({ hit, riven, type, lang }) {
  const threshold = thresholdForRiven(riven);
  const title = eventCopy(lang, type);
  const listing = hit.rivenName || hit.title || "";
  const seller = hit.sellerName || (lang === "zh" ? "未知卖家" : "Unknown seller");
  const thresholdText = type === "low_price" && threshold
    ? ` · ${eventCopy(lang, "threshold")} <${threshold}`
    : "";
  return {
    id: `${type}:${hitNotificationKey(hit)}`,
    type,
    severity: type === "low_price" ? "price" : "success",
    title,
    body: `${listing} · ${seller} · ${hit.price || ""}${thresholdText}`.trim(),
    createdAt: new Date().toISOString(),
    hitKey: hitNotificationKey(hit),
    rivenId: hit.rivenId || riven?.id || "",
    price: hit.price || "",
    sellerName: seller
  };
}

export function collectHitNotifications({
  hits = [],
  rivens = [],
  seenHitKeys = [],
  initialized = false,
  lang = "en",
  limit = MAX_EVENTS_PER_REFRESH
} = {}) {
  const rivenById = new Map(rivens.map(riven => [riven.id, riven]));
  const onlineHits = hits.filter(hit => hit.status === "online");
  const currentKeys = onlineHits.map(hitNotificationKey).filter(Boolean);
  const seen = new Set(seenHitKeys);
  const nextSeenHitKeys = boundedUnique([...seenHitKeys, ...currentKeys], MAX_SEEN_HIT_KEYS);

  if (!initialized) {
    return { events: [], seenHitKeys: nextSeenHitKeys, initialized: true };
  }

  const events = [];
  for (const hit of onlineHits) {
    const key = hitNotificationKey(hit);
    if (!key || seen.has(key)) continue;
    const riven = rivenById.get(hit.rivenId) || {};
    const type = classifyHit(hit, riven);
    if (!type) continue;
    events.push(hitEvent({ hit, riven, type, lang }));
    if (events.length >= limit) break;
  }

  return { events, seenHitKeys: nextSeenHitKeys, initialized: true };
}

export function createRateLimitNotification({ meta = {}, previousKey = "", lang = "en" } = {}) {
  if (meta.status !== "rate_limited" && !meta.rateLimited) {
    return { event: null, key: "" };
  }
  const waitMs = Number(meta.retryAfterMs || meta.nextRefreshInMs || 0);
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  const key = [
    "rate_limited",
    meta.refreshedAt || "",
    Math.ceil(waitMs / 1000)
  ].join(":");
  if (key === previousKey) return { event: null, key };
  return {
    key,
    event: {
      id: key,
      type: "rate_limited",
      severity: "wait",
      title: eventCopy(lang, "rate_limited"),
      body: eventCopy(lang, "rateBody")(seconds),
      createdAt: new Date().toISOString()
    }
  };
}
