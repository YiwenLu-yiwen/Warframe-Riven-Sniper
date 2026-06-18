export function priceNumber(price) {
  const value = Number(String(price).replace(/[^\d.]/g, ""));
  return Number.isFinite(value) ? value : NaN;
}

export function normalizePlatPrice(price) {
  const value = String(price || "").replace(/[^\d]/g, "");
  return value ? `${value}p` : "";
}

export function displayPlatPrice(price) {
  return normalizePlatPrice(price);
}

export function displayPriceRange({ minPrice = "", price = "" } = {}) {
  const min = normalizePlatPrice(minPrice);
  const max = normalizePlatPrice(price);
  const parts = [];
  if (min && priceNumber(min) > 0) parts.push(`>${min}`);
  if (max) parts.push(`<${max}`);
  return parts.join(" · ");
}

export function parseSearchQuery(query = "") {
  const priceFilters = [];
  let remaining = String(query).toLowerCase();
  const pricePattern = /(<=|>=|<|>|=)\s*(\d+(?:\.\d+)?)\s*p?\b/gi;

  remaining = remaining.replace(pricePattern, (_, operator, rawValue) => {
    priceFilters.push({ operator, value: Number(rawValue) });
    return " ";
  });

  return {
    terms: remaining.split(/\s+/).map(term => term.trim()).filter(Boolean),
    priceFilters
  };
}

export function queryHasPriceFilter(query) {
  const parsed = typeof query === "string" ? parseSearchQuery(query) : query;
  return Boolean(parsed?.priceFilters?.length);
}

export function priceFiltersMatch(filters = [], price) {
  if (!filters.length) return true;
  const actual = priceNumber(price);
  if (!Number.isFinite(actual)) return false;
  return filters.every(({ operator, value }) => {
    if (operator === "<") return actual < value;
    if (operator === "<=") return actual <= value;
    if (operator === ">") return actual > value;
    if (operator === ">=") return actual >= value;
    return actual === value;
  });
}

function tighterLower(current, next) {
  if (next.value > current.value) return next;
  if (next.value < current.value) return current;
  return { value: current.value, inclusive: current.inclusive && next.inclusive };
}

function tighterUpper(current, next) {
  if (next.value < current.value) return next;
  if (next.value > current.value) return current;
  return { value: current.value, inclusive: current.inclusive && next.inclusive };
}

export function priceRangeMatchesFilters(filters = [], { minPrice = "", price = "" } = {}) {
  if (!filters.length) return true;
  let lower = normalizePlatPrice(minPrice)
    ? { value: priceNumber(minPrice), inclusive: false }
    : { value: 0, inclusive: true };
  let upper = normalizePlatPrice(price)
    ? { value: priceNumber(price), inclusive: false }
    : { value: Infinity, inclusive: true };

  for (const { operator, value } of filters) {
    if (operator === ">") lower = tighterLower(lower, { value, inclusive: false });
    else if (operator === ">=") lower = tighterLower(lower, { value, inclusive: true });
    else if (operator === "<") upper = tighterUpper(upper, { value, inclusive: false });
    else if (operator === "<=") upper = tighterUpper(upper, { value, inclusive: true });
    else {
      lower = tighterLower(lower, { value, inclusive: true });
      upper = tighterUpper(upper, { value, inclusive: true });
    }
  }

  if (!Number.isFinite(lower.value) || Number.isNaN(lower.value) || Number.isNaN(upper.value)) return false;
  if (lower.value < upper.value) return true;
  return lower.value === upper.value && lower.inclusive && upper.inclusive;
}

export function queryMatchesTextAndPrice(query, text, price) {
  const parsed = typeof query === "string" ? parseSearchQuery(query) : query;
  const haystack = String(text || "").toLowerCase();
  return parsed.terms.every(term => haystack.includes(term))
    && priceFiltersMatch(parsed.priceFilters, price);
}
