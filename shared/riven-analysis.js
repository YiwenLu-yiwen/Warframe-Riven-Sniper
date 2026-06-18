// Riven disposition bands follow the Warframe Wiki ranges; DE describes
// disposition as a per-weapon stat-roll multiplier adjusted around Prime Access.
// Sources:
// https://warframe.fandom.com/wiki/Riven_Mods#Disposition
// https://forums.warframe.com/topic/1303780-riven-disposition-guidelines/

const positiveTiers = {
  gun: {
    A: ["critical_damage", "multishot", "critical_chance"],
    B: ["damage", "fire_rate", "toxin", "heat", "cold", "electricity", "status_chance", "slash"],
    C: ["reload_speed", "projectile_speed", "punch_through", "magazine_capacity", "damage_vs_grineer", "damage_vs_corpus", "damage_vs_infested", "status_duration", "puncture"],
    D: ["zoom", "recoil", "ammo_maximum", "impact"]
  },
  shotgun: {
    A: ["multishot", "critical_damage", "critical_chance", "damage"],
    B: ["status_chance", "fire_rate", "toxin", "heat", "cold", "electricity", "slash", "reload_speed"],
    C: ["punch_through", "magazine_capacity", "damage_vs_grineer", "damage_vs_corpus", "damage_vs_infested", "status_duration", "puncture"],
    D: ["zoom", "recoil", "ammo_maximum", "impact"]
  },
  melee: {
    A: ["critical_damage", "critical_chance", "damage", "fire_rate"],
    B: ["range", "initial_combo", "combo_duration", "status_chance", "slash", "toxin", "heat", "cold", "electricity"],
    C: ["additional_combo_count_chance", "heavy_attack_efficiency", "damage_vs_grineer", "damage_vs_corpus", "damage_vs_infested", "puncture", "impact"],
    D: ["critical_chance_slide", "finisher_damage", "status_duration"]
  }
};

const negativeTiers = {
  gun: {
    A: ["zoom", "recoil"],
    B: ["ammo_maximum"],
    C: ["damage_vs_infested", "damage_vs_corpus", "damage_vs_grineer", "status_duration", "projectile_speed", "magazine_capacity", "punch_through"],
    D: ["critical_damage", "critical_chance", "multishot", "damage", "fire_rate", "status_chance", "slash", "toxin", "heat", "cold", "electricity", "reload_speed"]
  },
  shotgun: {
    A: ["zoom", "recoil"],
    B: ["ammo_maximum", "magazine_capacity"],
    C: ["damage_vs_infested", "damage_vs_corpus", "damage_vs_grineer", "status_duration", "projectile_speed", "punch_through"],
    D: ["critical_damage", "critical_chance", "multishot", "damage", "fire_rate", "status_chance", "slash", "toxin", "heat", "cold", "electricity", "reload_speed"]
  },
  melee: {
    A: ["finisher_damage", "critical_chance_slide"],
    B: ["damage_vs_infested", "damage_vs_corpus", "damage_vs_grineer"],
    C: ["status_duration", "heavy_attack_efficiency", "additional_combo_count_chance", "combo_duration", "puncture", "impact"],
    D: ["critical_damage", "critical_chance", "damage", "fire_rate", "range", "initial_combo", "status_chance", "slash", "toxin", "heat", "cold", "electricity"]
  }
};

const positiveScores = { A: 30, B: 22, C: 12, D: 3 };
const negativeScores = { A: 12, B: 8, C: 0, D: -20 };
const dispositionScores = { A: 8, B: 5, C: 2, D: -3 };

const positiveRollBands = {
  critical_damage: { high: 55, low: 42 },
  critical_chance: { high: 70, low: 50 },
  multishot: { high: 40, low: 30 },
  damage: { high: 130, low: 95 },
  fire_rate: { high: 45, low: 30 },
  status_chance: { high: 80, low: 55 },
  slash: { high: 90, low: 65 },
  toxin: { high: 55, low: 40 },
  heat: { high: 55, low: 40 },
  cold: { high: 55, low: 40 },
  electricity: { high: 55, low: 40 },
  reload_speed: { high: 45, low: 30 },
  projectile_speed: { high: 55, low: 38 },
  punch_through: { high: 1.6, low: 0.9 },
  magazine_capacity: { high: 55, low: 35 }
};

const negativeRollBands = {
  zoom: { high: 45, low: 20 },
  recoil: { high: 55, low: 30 },
  ammo_maximum: { high: 55, low: 30 },
  damage_vs_infested: { high: 55, low: 25 },
  damage_vs_corpus: { high: 55, low: 25 },
  damage_vs_grineer: { high: 55, low: 25 }
};

export function analysisGroup(group = "rifle") {
  if (group === "melee" || group === "archmelee") return "melee";
  if (group === "shotgun") return "shotgun";
  return "gun";
}

export function dispositionSummary(disposition) {
  const value = Number(disposition);
  if (!Number.isFinite(value) || value <= 0) {
    return { value: 0, grade: "D", dots: "○○○○○", labelKey: "unknown", score: dispositionScores.D };
  }
  if (value >= 1.31) return { value, grade: "A", dots: "●●●●●", labelKey: "strong", score: dispositionScores.A };
  if (value >= 1.11) return { value, grade: "B", dots: "●●●●○", labelKey: "aboveAverage", score: dispositionScores.B };
  if (value >= 0.9) return { value, grade: "C", dots: "●●●○○", labelKey: "neutral", score: dispositionScores.C };
  if (value >= 0.7) return { value, grade: "D", dots: "●●○○○", labelKey: "low", score: dispositionScores.D };
  return { value, grade: "D", dots: "●○○○○", labelKey: "faint", score: dispositionScores.D };
}

export function tierForStat(key, { group = "rifle", polarity = "positive" } = {}) {
  if (!key) return "";
  const tiers = polarity === "negative" ? negativeTiers : positiveTiers;
  const table = tiers[analysisGroup(group)];
  for (const tier of ["A", "B", "C", "D"]) {
    if (table[tier].includes(key)) return tier;
  }
  return "C";
}

export function statTierMark(row = {}) {
  if (!row.tier) return "";
  return `${row.tier}${row.rollModifier || ""}`;
}

function normalizedAttributeRows(attributes = []) {
  return attributes
    .filter(attribute => attribute?.key)
    .map(attribute => ({
      key: String(attribute.key),
      positive: attribute.positive !== false,
      value: Number(attribute.value)
    }));
}

export function listingAnalysisCacheKey({ weapon = "", group = "", attributes = [] } = {}) {
  const rows = normalizedAttributeRows(attributes)
    .map(attribute => [
      attribute.key,
      attribute.positive ? "+" : "-",
      Number.isFinite(attribute.value) ? attribute.value : ""
    ].join(":"))
    .join("|");
  return `${weapon}::${group}::${rows}`;
}

function statAllowed(stat, group, polarity) {
  if (!stat?.key) return false;
  const normalizedGroup = group === "archmelee" ? "melee" : group;
  if (polarity === "negative" && stat.positiveOnly) return false;
  return !normalizedGroup || stat.groups?.includes(normalizedGroup);
}

function statLabel(key, statCatalog = [], lang = "en") {
  const stat = statCatalog.find(item => item.key === key);
  if (!stat) return String(key || "").replace(/_/g, " ");
  return lang === "zh" ? stat.zh : stat.en;
}

function statRow(key, { group, polarity, statCatalog, lang }) {
  const tier = tierForStat(key, { group, polarity });
  const sign = polarity === "negative" ? "-" : "+";
  return {
    key,
    sign,
    tier,
    label: statLabel(key, statCatalog, lang),
    score: polarity === "negative" ? negativeScores[tier] : positiveScores[tier]
  };
}

function rollModifier(key, value, polarity) {
  const numeric = Math.abs(Number(value));
  if (!Number.isFinite(numeric)) return "";
  const bands = polarity === "negative" ? negativeRollBands : positiveRollBands;
  const band = bands[key] || { high: 75, low: 35 };
  if (polarity === "negative") {
    if (numeric <= band.low) return "+";
    if (numeric >= band.high) return "-";
    return "";
  }
  if (numeric >= band.high) return "+";
  if (numeric <= band.low) return "-";
  return "";
}

export function analyzeListingAttributes({
  weapon = "",
  group = "rifle",
  attributes = [],
  statCatalog = [],
  lang = "en"
} = {}) {
  return normalizedAttributeRows(attributes).map(attribute => ({
    ...statRow(attribute.key, {
      group,
      polarity: attribute.positive ? "positive" : "negative",
      statCatalog,
      lang
    }),
    weapon,
    value: attribute.value,
    rollModifier: rollModifier(attribute.key, attribute.value, attribute.positive ? "positive" : "negative")
  }));
}

function parseStatKeys(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

function gradeFromScore(score) {
  if (score >= 82) return "A";
  if (score >= 62) return "B";
  if (score >= 40) return "C";
  return "D";
}

function rankedStats({ group = "rifle", polarity = "positive", statCatalog = [], lang = "en", limit = 6 } = {}) {
  const table = polarity === "negative" ? negativeTiers[analysisGroup(group)] : positiveTiers[analysisGroup(group)];
  const rows = [];
  for (const tier of ["A", "B", "C", "D"]) {
    for (const key of table[tier]) {
      const stat = statCatalog.find(item => item.key === key);
      if (statAllowed(stat, group, polarity)) rows.push(statRow(key, { group, polarity, statCatalog, lang }));
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

export function recommendedAnalysisStats({ group = "rifle", statCatalog = [], lang = "en" } = {}) {
  return {
    positives: rankedStats({ group, polarity: "positive", statCatalog, lang, limit: 6 }),
    safeNegatives: rankedStats({ group, polarity: "negative", statCatalog, lang, limit: 4 })
  };
}

export function analyzeRiven({
  weapon = "",
  group = "rifle",
  disposition = 0,
  positives = [],
  negative = "",
  statCatalog = [],
  lang = "en"
} = {}) {
  const positiveRows = parseStatKeys(positives).slice(0, 3).map(key => statRow(key, {
    group,
    polarity: "positive",
    statCatalog,
    lang
  }));
  const negativeKey = String(negative || "").trim();
  const negativeRow = negativeKey ? statRow(negativeKey, {
    group,
    polarity: "negative",
    statCatalog,
    lang
  }) : null;
  const dispositionInfo = dispositionSummary(disposition);
  const selectedScore = positiveRows.reduce((sum, row) => sum + row.score, 0)
    + (negativeRow ? negativeRow.score : 4)
    + dispositionInfo.score;
  const hasSelectedStats = positiveRows.length > 0 || Boolean(negativeRow);

  return {
    weapon,
    group,
    grade: hasSelectedStats ? gradeFromScore(selectedScore) : dispositionInfo.grade,
    score: selectedScore,
    disposition: dispositionInfo,
    positives: positiveRows,
    negative: negativeRow,
    recommended: recommendedAnalysisStats({ group, statCatalog, lang })
  };
}
