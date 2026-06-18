export const MAX_NOTIFICATION_EVENTS = 30;
export const MAX_SEEN_HIT_KEYS = 500;
export const MAX_EVENTS_PER_REFRESH = 8;
export const MAX_NOTIFICATION_AGE_MS = 6 * 60 * 60 * 1000;
const HIT_NOTIFICATION_TYPES = new Set(["low_price", "new_online_hit"]);

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
    hit.sellerName,
    hit.rivenName || hit.title,
    hit.price
  ].map(value => String(value || "").trim()).join("::");
}

export function notificationMessageKey(event = {}) {
  const type = String(event.type || "");
  if (event.hitKey) return `hit:${event.hitKey}`;
  if (type === "rate_limited") return "system:rate_limited";
  if (type === "browser_notice_enabled") return "system:browser_notice_enabled";
  return [
    "message",
    type,
    event.listingName || event.rivenName || event.title || "",
    event.sellerName || "",
    event.price || "",
    event.threshold || "",
    event.body || ""
  ].map(value => String(value || "").trim()).join("::");
}

export function createNotificationMatchSignature(rivens = []) {
  const watches = rivens.map(riven => ({
    id: String(riven.id || ""),
    target: String(riven.target || ""),
    positives: (riven.positives || []).filter(Boolean).map(String).sort(),
    negative: String(riven.negative || ""),
    minPrice: normalizePlat(riven.minPrice),
    price: normalizePlat(riven.price)
  }));
  watches.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(watches);
}

export function pruneNotificationState(state = {}) {
  const now = Date.now();
  const freshEvents = (state.events || []).filter(event => {
    const createdAt = Date.parse(event.createdAt || "");
    return !Number.isFinite(createdAt) || now - createdAt <= MAX_NOTIFICATION_AGE_MS;
  });
  return {
    initialized: Boolean(state.initialized),
    seenHitKeys: boundedUnique(state.seenHitKeys || [], MAX_SEEN_HIT_KEYS),
    dismissedHitKeys: boundedUnique(state.dismissedHitKeys || [], MAX_SEEN_HIT_KEYS),
    dismissedEventIds: boundedUnique(state.dismissedEventIds || [], MAX_SEEN_HIT_KEYS),
    dismissedMessageKeys: boundedUnique(state.dismissedMessageKeys || [], MAX_SEEN_HIT_KEYS),
    events: freshEvents.slice(Math.max(0, freshEvents.length - MAX_NOTIFICATION_EVENTS)),
    rateLimitKey: String(state.rateLimitKey || ""),
    matchSignature: String(state.matchSignature || "")
  };
}

export function syncNotificationMatchState(state = {}, nextSignature = "") {
  const pruned = pruneNotificationState(state);
  const signature = String(nextSignature || "");
  if (pruned.matchSignature && pruned.matchSignature !== signature) {
    return {
      ...pruned,
      seenHitKeys: [],
      events: pruned.events.filter(event => !HIT_NOTIFICATION_TYPES.has(event.type)),
      matchSignature: signature
    };
  }
  return {
    ...pruned,
    matchSignature: signature
  };
}

export function resetNotificationMatchState(state = {}, nextSignature = "") {
  const pruned = pruneNotificationState(state);
  return {
    ...pruned,
    initialized: false,
    seenHitKeys: [],
    dismissedHitKeys: [],
    dismissedEventIds: [],
    dismissedMessageKeys: [],
    events: pruned.events.filter(event => !HIT_NOTIFICATION_TYPES.has(event.type)),
    matchSignature: String(nextSignature || "")
  };
}

export function dismissNotificationEvent(state = {}, id = "") {
  const pruned = pruneNotificationState(state);
  const event = pruned.events.find(item => item.id === id);
  const dismissedHitKeys = event?.hitKey
    ? boundedUnique([...pruned.dismissedHitKeys, event.hitKey], MAX_SEEN_HIT_KEYS)
    : pruned.dismissedHitKeys;
  const dismissedEventIds = id
    ? boundedUnique([...pruned.dismissedEventIds, id], MAX_SEEN_HIT_KEYS)
    : pruned.dismissedEventIds;
  const dismissedMessageKeys = event
    ? boundedUnique([...pruned.dismissedMessageKeys, notificationMessageKey(event)], MAX_SEEN_HIT_KEYS)
    : pruned.dismissedMessageKeys;
  return {
    ...pruned,
    dismissedHitKeys,
    dismissedEventIds,
    dismissedMessageKeys,
    rateLimitKey: event?.type === "rate_limited" ? event.id : pruned.rateLimitKey,
    events: pruned.events.filter(item => item.id !== id)
  };
}

export function clearNotificationEvents(state = {}) {
  const pruned = pruneNotificationState(state);
  const visibleHitKeys = pruned.events.map(event => event.hitKey).filter(Boolean);
  const visibleEventIds = pruned.events.map(event => event.id).filter(Boolean);
  const visibleMessageKeys = pruned.events.map(notificationMessageKey).filter(Boolean);
  const rateLimitEvent = pruned.events.find(event => event.type === "rate_limited");
  return {
    ...pruned,
    dismissedHitKeys: boundedUnique([...pruned.dismissedHitKeys, ...visibleHitKeys], MAX_SEEN_HIT_KEYS),
    dismissedEventIds: boundedUnique([...pruned.dismissedEventIds, ...visibleEventIds], MAX_SEEN_HIT_KEYS),
    dismissedMessageKeys: boundedUnique([...pruned.dismissedMessageKeys, ...visibleMessageKeys], MAX_SEEN_HIT_KEYS),
    rateLimitKey: rateLimitEvent?.id || pruned.rateLimitKey,
    events: []
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

function notificationCopy(lang, type) {
  const copy = {
    zh: {
      low_price: "低价命中",
      new_online_hit: "新在线订单",
      threshold: "阈值",
      unknownSeller: "未知卖家",
      rate_limited: "限流等待",
      rateBody: seconds => `Warframe.Market 正在限流，约 ${seconds}s 后自动继续。`,
      browser_notice_enabled: "浏览器通知已启用",
      browserNoticeEnabledBody: "系统弹窗已准备好。新的裂罅命中可以在网页外提醒。"
    },
    en: {
      low_price: "Low price hit",
      new_online_hit: "New online listing",
      threshold: "threshold",
      unknownSeller: "Unknown seller",
      rate_limited: "Rate limited",
      rateBody: seconds => `Warframe.Market is rate limited. Waiting about ${seconds}s before continuing.`,
      browser_notice_enabled: "Browser notices enabled",
      browserNoticeEnabledBody: "System popups are ready. New Riven hits can now appear outside the page."
    }
  };
  return copy[lang]?.[type] || copy.en[type] || type;
}

function localizedFallbackBody(body, lang) {
  const text = String(body || "");
  if (lang === "zh") {
    return text
      .replace(/\bthreshold\b/gi, "阈值")
      .replace(/\bUnknown seller\b/g, "未知卖家");
  }
  return text
    .replace(/阈值/g, "threshold")
    .replace(/未知卖家/g, "Unknown seller");
}

function hitEvent({ hit, riven, type, lang }) {
  const threshold = thresholdForRiven(riven);
  const listing = hit.rivenName || hit.title || "";
  const seller = hit.sellerName || "";
  const localized = formatNotificationEvent({
    type,
    listingName: listing,
    sellerName: seller,
    price: hit.price || "",
    threshold
  }, lang);
  return {
    id: `${type}:${hitNotificationKey(hit)}`,
    type,
    severity: type === "low_price" ? "price" : "success",
    title: localized.title,
    body: localized.body,
    createdAt: new Date().toISOString(),
    hitKey: hitNotificationKey(hit),
    rivenId: hit.rivenId || riven?.id || "",
    weapon: hit.weapon || riven?.target || "",
    listingName: listing,
    threshold,
    price: hit.price || "",
    sellerName: seller
  };
}

export function formatNotificationEvent(event = {}, lang = "en") {
  const type = event.type || "new_online_hit";
  const title = notificationCopy(lang, type);

  if (type === "rate_limited") {
    const bodySeconds = String(event.body || "").match(/(\d+)s/)?.[1];
    const seconds = Number(event.waitSeconds) || Number(event.seconds) || Number(bodySeconds) || 1;
    return {
      title,
      body: notificationCopy(lang, "rateBody")(Math.max(1, Math.ceil(seconds)))
    };
  }

  if (type === "browser_notice_enabled") {
    return {
      title,
      body: notificationCopy(lang, "browserNoticeEnabledBody")
    };
  }

  if (type === "low_price" || type === "new_online_hit") {
    const listing = event.listingName || event.rivenName || "";
    const seller = event.sellerName || notificationCopy(lang, "unknownSeller");
    const price = event.price || "";
    const threshold = event.threshold || "";
    const thresholdText = type === "low_price" && threshold
      ? ` · ${notificationCopy(lang, "threshold")} <${threshold}`
      : "";
    const body = [listing, seller, price].filter(Boolean).join(" · ");
    return {
      title,
      body: `${body}${thresholdText}`.trim() || localizedFallbackBody(event.body, lang)
    };
  }

  return {
    title: event.title || title,
    body: event.body || ""
  };
}

export function collectHitNotifications({
  hits = [],
  rivens = [],
  seenHitKeys = [],
  dismissedHitKeys = [],
  dismissedEventIds = [],
  dismissedMessageKeys = [],
  initialized = false,
  lang = "en",
  limit = MAX_EVENTS_PER_REFRESH
} = {}) {
  const rivenById = new Map(rivens.map(riven => [riven.id, riven]));
  const matchedOnlineHits = hits.filter(hit => hit.status === "online" && rivenById.has(hit.rivenId));
  const currentKeys = matchedOnlineHits.map(hitNotificationKey).filter(Boolean);
  const seen = new Set([...seenHitKeys, ...dismissedHitKeys]);
  const nextSeenHitKeys = boundedUnique([...seenHitKeys, ...currentKeys], MAX_SEEN_HIT_KEYS);

  if (!initialized) {
    return { events: [], seenHitKeys: nextSeenHitKeys, initialized: true };
  }

  const events = [];
  for (const hit of matchedOnlineHits) {
    const key = hitNotificationKey(hit);
    if (!key || seen.has(key)) continue;
    const riven = rivenById.get(hit.rivenId) || {};
    const type = classifyHit(hit, riven);
    if (!type) continue;
    const event = hitEvent({ hit, riven, type, lang });
    if (dismissedEventIds.includes(event.id)) continue;
    if (dismissedMessageKeys.includes(notificationMessageKey(event))) continue;
    events.push(event);
    seen.add(key);
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
      title: formatNotificationEvent({ type: "rate_limited", waitSeconds: seconds }, lang).title,
      body: formatNotificationEvent({ type: "rate_limited", waitSeconds: seconds }, lang).body,
      waitSeconds: seconds,
      createdAt: new Date().toISOString()
    }
  };
}
