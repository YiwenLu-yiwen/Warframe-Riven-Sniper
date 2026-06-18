import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { handleRequest } from "../server/app.js";
import { listStats, listWeapons } from "../server/domain.js";
import {
  marketStatKey,
  marketSearchParamsForRiven,
  marketHitMatchesRiven,
  normalizeMarketAuction,
  uniqueWeaponFamiliesFromAuctions,
  fetchLiveHitsForRivens,
  MARKET_MIN_REQUEST_INTERVAL_MS,
  weaponFamilyFromMarketName,
  weaponUrlNameFromFamily
} from "../server/market.js";
import { createRiven, deleteRiven, listRivens, resetRivens } from "../server/store.js";
import { configureRivenStore } from "../server/store.js";

configureRivenStore({ persist: false });

describe("Riven weapon catalog", () => {
  it("exposes a broad unique catalog of Riven-eligible weapon families", () => {
    const weapons = listWeapons();
    const families = weapons.map(weapon => weapon.family);

    assert.equal(families.length > 400, true);
    assert.equal(families.length, new Set(families).size);
    assert.equal(weapons.every(weapon => weapon.rivenEligible), true);
    assert.equal(families.includes("Rubico"), true);
    assert.equal(families.includes("Torid"), true);
    assert.equal(families.includes("Rubico Prime"), false);
    assert.equal(families.includes("Akstiletto Prime"), false);
    assert.equal(families.includes("Dakra Prime"), true);
  });

  it("localizes known weapon family labels in Chinese", () => {
    const weapons = listWeapons({ lang: "zh" });
    const rubico = weapons.find(weapon => weapon.family === "Rubico");
    const catchmoon = weapons.find(weapon => weapon.family === "Catchmoon");
    const splitSword = weapons.find(weapon => weapon.family === "Dark Split-Sword");

    assert.equal(rubico.label, "绝路");
    assert.equal(catchmoon.label, "捕月");
    assert.equal(splitSword.label, "暗黑分合剑");
  });
});

describe("Riven stat pools", () => {
  it("keeps rifle-only stats off melee weapons", () => {
    const melee = listStats({ weapon: "Skana" }).map(stat => stat.key);

    assert.equal(melee.includes("range"), true);
    assert.equal(melee.includes("combo_duration"), true);
    assert.equal(melee.includes("multishot"), false);
    assert.equal(melee.includes("ammo_maximum"), false);
    assert.equal(melee.includes("zoom"), false);
  });

  it("keeps melee-only stats off rifle weapons", () => {
    const rifle = listStats({ weapon: "Rubico" }).map(stat => stat.key);

    assert.equal(rifle.includes("multishot"), true);
    assert.equal(rifle.includes("zoom"), true);
    assert.equal(rifle.includes("range"), false);
    assert.equal(rifle.includes("combo_duration"), false);
  });

  it("does not include positive-only elemental stats in negative pools", () => {
    const negative = listStats({ weapon: "Rubico", polarity: "negative" }).map(stat => stat.key);

    assert.equal(negative.includes("cold"), false);
    assert.equal(negative.includes("punch_through"), false);
    assert.equal(negative.includes("zoom"), true);
  });
});

describe("HTTP API", () => {
  let server;
  let baseUrl;

  before(async () => {
    resetRivens();
    server = createServer((req, res) => {
      handleRequest(req, res);
    });
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    resetRivens();
  });

  it("starts without fake stored Rivens or hits", async () => {
    const rivensResponse = await fetch(`${baseUrl}/api/rivens`);
    const hitsResponse = await fetch(`${baseUrl}/api/hits?scope=online`);
    const rivensBody = await rivensResponse.json();
    const hitsBody = await hitsResponse.json();

    assert.equal(rivensResponse.status, 200);
    assert.equal(hitsResponse.status, 200);
    assert.deepEqual(rivensBody.data, []);
    assert.deepEqual(hitsBody.data, []);
  });

  it("creates and deletes stored Riven watches through the HTTP API", async () => {
    const createResponse = await fetch(`${baseUrl}/api/rivens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "Rubico",
        positives: ["critical_chance", "critical_damage", "multishot"],
        negative: "zoom",
        polarity: "Madurai",
        mastery: "14",
        rank: "Rank 8",
        rerolls: "0",
        price: "500p"
      })
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(createBody.data.target, "Rubico");
    assert.equal(listRivens().length, 1);

    const deleteResponse = await fetch(`${baseUrl}/api/rivens/${createBody.data.id}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 204);
    assert.equal(listRivens().length, 0);
  });

  it("uses structured errors for invalid Riven create requests", async () => {
    const response = await fetch(`${baseUrl}/api/rivens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "" })
    });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  it("rejects variant names when creating stored Riven watches", async () => {
    const response = await fetch(`${baseUrl}/api/rivens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "Rubico Prime", positives: [] })
    });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  it("accepts Prime-only Riven families from the catalog", async () => {
    const createResponse = await fetch(`${baseUrl}/api/rivens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "Dakra Prime", positives: [] })
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(createBody.data.target, "Dakra Prime");

    const deleteResponse = await fetch(`${baseUrl}/api/rivens/${createBody.data.id}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 204);
  });

  it("returns empty hits when there are no stored watches", async () => {
    const response = await fetch(`${baseUrl}/api/hits?scope=online`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data, []);
    assert.equal(body.meta.refreshIntervalMs, 120000);
  });

  it("rejects unknown weapon stat requests with structured errors", async () => {
    const response = await fetch(`${baseUrl}/api/stats?weapon=Rubico%20Prime`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, "WEAPON_NOT_FOUND");
  });
});

describe("Warframe.Market adapter", () => {
  it("normalizes weapon variants into a single Riven family", () => {
    assert.equal(weaponFamilyFromMarketName("rubico_prime"), "Rubico");
    assert.equal(weaponFamilyFromMarketName("latron_wraith"), "Latron");
    assert.equal(weaponUrlNameFromFamily("Rubico Prime"), "rubico");
    assert.equal(weaponFamilyFromMarketName("dakra_prime"), "Dakra Prime");
    assert.equal(weaponUrlNameFromFamily("Dakra Prime"), "dakra_prime");
  });

  it("dedupes market auction weapons after variant normalization", () => {
    const families = uniqueWeaponFamiliesFromAuctions([
      { item: { weapon_url_name: "rubico" } },
      { item: { weapon_url_name: "rubico_prime" } },
      { item: { weapon_url_name: "latron_wraith" } }
    ]);

    assert.deepEqual(families, ["Latron", "Rubico"]);
  });

  it("maps online and ingame sellers into online hits", () => {
    const hit = normalizeMarketAuction({
      id: "auction-1",
      buyout_price: 320,
      updated: "2026-06-17T15:00:00.000+00:00",
      owner: { ingame_name: "VoidRelay", status: "ingame" },
      item: {
        weapon_url_name: "rubico",
        name: "crita-satican",
        polarity: "madurai",
        mastery_level: 14,
        mod_rank: 8,
        re_rolls: 2,
        attributes: [
          { positive: true, url_name: "critical_chance" },
          { positive: true, url_name: "multishot" },
          { positive: false, url_name: "zoom" }
        ]
      }
    });

    assert.equal(hit.weapon, "Rubico");
    assert.equal(hit.rivenName, "Rubico crita-satican");
    assert.equal(hit.statsEn, "+Critical Chance, +Multishot, -Zoom");
    assert.equal(hit.status, "online");
    assert.equal(hit.sellerName, "VoidRelay");
  });

  it("maps app stat keys into Warframe.Market search keys", () => {
    assert.equal(marketStatKey("damage"), "base_damage_/_melee_damage");
    assert.equal(marketStatKey("cold"), "cold_damage");
    assert.equal(marketStatKey("fire_rate"), "fire_rate_/_attack_speed");
  });

  it("spaces market auction requests by one second by default", () => {
    assert.equal(MARKET_MIN_REQUEST_INTERVAL_MS, 1000);
  });

  it("builds live auction search params from a stored Riven watch", () => {
    const params = marketSearchParamsForRiven({
      target: "Rubico",
      positives: ["critical_chance", "critical_damage", "multishot"],
      negative: "zoom"
    });

    assert.equal(params.weapon_url_name, "rubico");
    assert.equal(params.positive_stats, "critical_chance,critical_damage,multishot");
    assert.equal(params.negative_stats, "zoom");
    assert.equal(params.operation, "allOf");
  });

  it("matches normalized market hits against selected positive and negative stats", () => {
    const riven = {
      target: "Rubico",
      positives: ["critical_chance", "multishot", ""],
      negative: "zoom"
    };
    const matchingHit = {
      attributes: [
        { key: "critical_chance", positive: true },
        { key: "multishot", positive: true },
        { key: "zoom", positive: false }
      ]
    };
    const wrongNegative = {
      attributes: [
        { key: "critical_chance", positive: true },
        { key: "multishot", positive: true },
        { key: "recoil", positive: false }
      ]
    };

    assert.equal(marketHitMatchesRiven(matchingHit, riven), true);
    assert.equal(marketHitMatchesRiven(wrongNegative, riven), false);
  });

  it("searches each weapon once and filters all Rivens locally", async () => {
    const requestedWeapons = [];
    const fetchImpl = async url => {
      requestedWeapons.push(new URL(url).searchParams.get("weapon_url_name"));
      return new Response(JSON.stringify({
        payload: {
          auctions: [
            {
              id: "crit-damage",
              buyout_price: 100,
              owner: { ingame_name: "SellerOne", status: "online" },
              item: {
                weapon_url_name: "rubico",
                name: "crita-acri",
                attributes: [
                  { positive: true, url_name: "critical_chance" },
                  { positive: true, url_name: "critical_damage" },
                  { positive: false, url_name: "zoom" }
                ]
              }
            },
            {
              id: "multi",
              buyout_price: 120,
              owner: { ingame_name: "SellerTwo", status: "online" },
              item: {
                weapon_url_name: "rubico",
                name: "visi-sati",
                attributes: [
                  { positive: true, url_name: "multishot" },
                  { positive: false, url_name: "recoil" }
                ]
              }
            }
          ]
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const result = await fetchLiveHitsForRivens([
      { id: "riven-a", target: "Rubico", positives: ["critical_damage"], negative: "zoom" },
      { id: "riven-b", target: "Rubico", positives: ["multishot"], negative: "recoil" }
    ], {
      force: true,
      fetchImpl,
      minRequestIntervalMs: 0,
      rateLimitBackoffMs: 1,
      cacheNamespace: "test-shared-weapon"
    });

    assert.deepEqual(requestedWeapons, ["rubico"]);
    assert.deepEqual(result.data.map(hit => `${hit.rivenId}:${hit.id}`).sort(), ["riven-a:crit-damage", "riven-b:multi"]);
    assert.equal(result.meta.weaponsSearched, 1);
  });

  it("backs off progressively and retries the same weapon after market rate limiting", async () => {
    const statuses = [];
    const sleeps = [];
    let attempts = 0;
    const fetchImpl = async () => {
      attempts += 1;
      if (attempts <= 2) {
        statuses.push(429);
        return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: { "content-type": "application/json" } });
      }
      statuses.push(200);
      return new Response(JSON.stringify({ payload: { auctions: [] } }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const result = await fetchLiveHitsForRivens([
      { id: "riven-rate", target: "Rubico", positives: [], negative: "" }
    ], {
      force: true,
      fetchImpl,
      sleep: async ms => sleeps.push(ms),
      minRequestIntervalMs: 0,
      rateLimitBackoffMs: 10,
      cacheNamespace: "test-rate-limit"
    });

    assert.deepEqual(statuses, [429, 429, 200]);
    assert.deepEqual(sleeps, [10, 20]);
    assert.equal(result.meta.weaponsSearched, 1);
  });

  it("returns cached hits with soft rate-limit metadata after retry exhaustion", async () => {
    const namespace = "test-rate-limit-cached";
    const success = await fetchLiveHitsForRivens([
      { id: "riven-cached", target: "Rubico", positives: ["critical_damage"], negative: "" }
    ], {
      force: true,
      cacheNamespace: namespace,
      minRequestIntervalMs: 0,
      fetchImpl: async () => new Response(JSON.stringify({
        payload: {
          auctions: [{
            id: "cached-hit",
            buyout_price: 99,
            owner: { ingame_name: "CacheSeller", status: "online" },
            item: {
              weapon_url_name: "rubico",
              name: "acri",
              attributes: [{ positive: true, url_name: "critical_damage" }]
            }
          }]
        }
      }), { status: 200, headers: { "content-type": "application/json" } })
    });
    assert.equal(success.data.length, 1);

    const sleeps = [];
    const limited = await fetchLiveHitsForRivens([
      { id: "riven-cached", target: "Rubico", positives: ["critical_damage"], negative: "" }
    ], {
      force: true,
      cacheNamespace: namespace,
      minRequestIntervalMs: 0,
      rateLimitBackoffMs: 10,
      maxRateLimitRetries: 1,
      sleep: async ms => sleeps.push(ms),
      fetchImpl: async () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: { "content-type": "application/json" } })
    });

    assert.deepEqual(sleeps, [10]);
    assert.equal(limited.meta.status, "rate_limited");
    assert.equal(limited.meta.rateLimited, true);
    assert.equal(limited.meta.nextRefreshInMs, 10);
    assert.deepEqual(limited.data.map(hit => hit.id), ["cached-hit"]);
  });

  it("does not force-refresh every weapon when many weapons are tracked", async () => {
    const namespace = "test-force-limited";
    const rivens = [
      { id: "riven-rubico", target: "Rubico", positives: [], negative: "" },
      { id: "riven-soma", target: "Soma", positives: [], negative: "" },
      { id: "riven-lex", target: "Lex", positives: [], negative: "" },
      { id: "riven-skana", target: "Skana", positives: [], negative: "" }
    ];
    let requests = 0;
    await fetchLiveHitsForRivens(rivens, {
      force: true,
      cacheNamespace: namespace,
      minRequestIntervalMs: 0,
      fetchImpl: async url => {
        requests += 1;
        const weapon = new URL(url).searchParams.get("weapon_url_name");
        return new Response(JSON.stringify({
          payload: {
            auctions: [{
              id: `${weapon}-hit`,
              buyout_price: 10,
              owner: { ingame_name: "Seller", status: "online" },
              item: { weapon_url_name: weapon, name: "visi", attributes: [] }
            }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });
    assert.equal(requests, 4);

    const forced = await fetchLiveHitsForRivens(rivens, {
      force: true,
      cacheNamespace: namespace,
      minRequestIntervalMs: 0,
      fetchImpl: async () => {
        requests += 1;
        throw new Error("force refresh should reuse valid per-weapon cache for large batches");
      }
    });

    assert.equal(requests, 4);
    assert.equal(forced.meta.forceLimited, true);
    assert.equal(forced.meta.weaponsSearched, 0);
    assert.equal(forced.data.length, 4);
  });
});

describe("Stored Riven watches", () => {
  before(() => resetRivens());
  after(() => resetRivens());

  it("stores user-created watches without fake seed data", () => {
    assert.deepEqual(listRivens(), []);

    const riven = createRiven({
      target: "Rubico",
      positives: ["critical_chance", "critical_damage", "multishot"],
      negative: "zoom",
      polarity: "Madurai",
      mastery: "14",
      rank: "Rank 8",
      rerolls: "0",
      price: "500p"
    });

    assert.equal(riven.id.startsWith("riven-"), true);
    assert.equal(listRivens().length, 1);
    assert.equal(deleteRiven(riven.id), true);
    assert.deepEqual(listRivens(), []);
  });

  it("can persist user-created watches across store reloads", () => {
    const dir = mkdtempSync(join(tmpdir(), "riven-store-"));
    const path = join(dir, "rivens.json");

    try {
      configureRivenStore({ path, persist: true });
      resetRivens();
      createRiven({
        target: "Rubico",
        positives: ["critical_chance"],
        negative: "zoom",
        price: "300p"
      });

      configureRivenStore({ path, persist: true });
      const saved = listRivens();

      assert.equal(saved.length, 1);
      assert.equal(saved[0].target, "Rubico");
      assert.deepEqual(saved[0].positives, ["critical_chance"]);
    } finally {
      configureRivenStore({ persist: false });
      resetRivens();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
