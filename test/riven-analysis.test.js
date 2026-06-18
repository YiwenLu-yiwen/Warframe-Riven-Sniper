import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeListingAttributes,
  analyzeRiven,
  dispositionSummary,
  listingAnalysisCacheKey,
  recommendedAnalysisStats,
  statTierMark
} from "../shared/riven-analysis.js";
import { statCatalog } from "../server/catalog.js";

describe("Riven analysis", () => {
  it("maps current disposition values to readable strength bands", () => {
    assert.deepEqual(dispositionSummary(1.35).grade, "A");
    assert.deepEqual(dispositionSummary(1.15).grade, "B");
    assert.deepEqual(dispositionSummary(0.9).grade, "C");
    assert.deepEqual(dispositionSummary(0.65).grade, "D");
  });

  it("grades selected Riven stats with positive and negative tiers", () => {
    const analysis = analyzeRiven({
      weapon: "Rubico",
      group: "rifle",
      disposition: 0.9,
      positives: ["critical_chance", "critical_damage", "multishot"],
      negative: "zoom",
      statCatalog,
      lang: "en"
    });

    assert.equal(analysis.grade, "A");
    assert.equal(analysis.disposition.grade, "C");
    assert.deepEqual(analysis.positives.map(stat => `${stat.sign}${stat.label}:${stat.tier}`), [
      "+Critical Chance:A",
      "+Critical Damage:A",
      "+Multishot:A"
    ]);
    assert.equal(`${analysis.negative.sign}${analysis.negative.label}:${analysis.negative.tier}`, "-Zoom:A");
    assert.deepEqual([...analysis.positives, analysis.negative].map(statTierMark), ["A", "A", "A", "A"]);
  });

  it("uses the weapon class to recommend different positive and negative stats", () => {
    const rifle = recommendedAnalysisStats({ group: "rifle", statCatalog, lang: "en" });
    const melee = recommendedAnalysisStats({ group: "melee", statCatalog, lang: "en" });

    assert.equal(rifle.positives.some(stat => stat.key === "multishot"), true);
    assert.equal(rifle.safeNegatives.some(stat => stat.key === "zoom"), true);
    assert.equal(melee.positives.some(stat => stat.key === "range"), true);
    assert.equal(melee.safeNegatives.some(stat => stat.key === "finisher_damage"), true);
    assert.equal(melee.positives.some(stat => stat.key === "multishot"), false);
  });

  it("grades exact Web Hit attributes and exposes a stable cache key", () => {
    const attributes = [
      { key: "critical_chance", positive: true, value: 131 },
      { key: "critical_damage", positive: true, value: 102.6 },
      { key: "multishot", positive: true, value: 91.6 },
      { key: "damage_vs_infested", positive: false, value: 0.7 }
    ];
    const grades = analyzeListingAttributes({
      weapon: "Tazicor",
      group: "robotic",
      attributes,
      statCatalog,
      lang: "en"
    });

    assert.deepEqual(grades.map(grade => `${grade.key}:${statTierMark(grade)}`), [
      "critical_chance:A+",
      "critical_damage:A+",
      "multishot:A+",
      "damage_vs_infested:C+"
    ]);
    assert.equal(
      listingAnalysisCacheKey({ weapon: "Tazicor", group: "robotic", attributes }),
      listingAnalysisCacheKey({ weapon: "Tazicor", group: "robotic", attributes: attributes.map(attribute => ({ ...attribute })) })
    );
  });

  it("uses the numeric roll to apply plus, neutral, or minus modifiers", () => {
    const grades = analyzeListingAttributes({
      weapon: "Acceltra",
      group: "rifle",
      attributes: [
        { key: "critical_damage", positive: true, value: 58 },
        { key: "critical_chance", positive: true, value: 60 },
        { key: "multishot", positive: true, value: 20 }
      ],
      statCatalog,
      lang: "en"
    });

    assert.deepEqual(grades.map(statTierMark), ["A+", "A", "A-"]);
  });
});
