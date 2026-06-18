import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseSearchQuery,
  displayPlatPrice,
  displayPriceRange,
  normalizePlatPrice,
  priceRangeMatchesFilters,
  priceFiltersMatch,
  queryHasPriceFilter,
  queryMatchesTextAndPrice
} from "../public/search-query.js";

describe("Smart search price filters", () => {
  it("parses compact and spaced platinum comparisons", () => {
    assert.deepEqual(parseSearchQuery("<450p"), {
      terms: [],
      priceFilters: [{ operator: "<", value: 450 }]
    });
    assert.deepEqual(parseSearchQuery("> 100p"), {
      terms: [],
      priceFilters: [{ operator: ">", value: 100 }]
    });
    assert.deepEqual(parseSearchQuery("< 450 p"), {
      terms: [],
      priceFilters: [{ operator: "<", value: 450 }]
    });
  });

  it("normalizes configured prices to platinum display strings", () => {
    assert.equal(normalizePlatPrice("500"), "500p");
    assert.equal(normalizePlatPrice("500p"), "500p");
    assert.equal(displayPlatPrice("500"), "500p");
    assert.equal(displayPlatPrice(""), "");
  });

  it("formats configured min and max prices as explicit bounds", () => {
    assert.equal(displayPriceRange({ minPrice: "", price: "500p" }), "<500p");
    assert.equal(displayPriceRange({ minPrice: "100p", price: "500p" }), ">100p · <500p");
    assert.equal(displayPriceRange({ minPrice: "100p", price: "" }), ">100p");
    assert.equal(displayPriceRange({ minPrice: "", price: "" }), "");
  });

  it("matches configured price ranges against search price filters", () => {
    assert.equal(priceRangeMatchesFilters(parseSearchQuery("<1000").priceFilters, { minPrice: "", price: "500p" }), true);
    assert.equal(priceRangeMatchesFilters(parseSearchQuery(">1000p").priceFilters, { minPrice: "", price: "500p" }), false);
    assert.equal(priceRangeMatchesFilters(parseSearchQuery(">200p <300p").priceFilters, { minPrice: "100p", price: "500p" }), true);
    assert.equal(priceRangeMatchesFilters(parseSearchQuery("<50p").priceFilters, { minPrice: "100p", price: "500p" }), false);
  });

  it("matches listings inside combined price ranges", () => {
    const query = parseSearchQuery(">100p <500p");

    assert.equal(priceFiltersMatch(query.priceFilters, "320p"), true);
    assert.equal(priceFiltersMatch(query.priceFilters, "99p"), false);
    assert.equal(priceFiltersMatch(query.priceFilters, "500p"), false);
  });

  it("keeps text terms while applying price filters", () => {
    const query = parseSearchQuery("rubico > 100p < 500p online");

    assert.equal(queryHasPriceFilter(query), true);
    assert.equal(queryMatchesTextAndPrice(query, "rubico critacan online", "320p"), true);
    assert.equal(queryMatchesTextAndPrice(query, "rubico critacan offline", "320p"), false);
    assert.equal(queryMatchesTextAndPrice(query, "rubico critacan online", "650p"), false);
  });

  it("matches configured Riven max prices without requiring live listings", () => {
    assert.equal(queryMatchesTextAndPrice("<1000", "rubico critacan 500p", "500p"), true);
    assert.equal(queryMatchesTextAndPrice("<1000p", "rubico critacan 500p", "500p"), true);
    assert.equal(queryMatchesTextAndPrice(">1000p", "rubico critacan 500p", "500p"), false);
  });
});
