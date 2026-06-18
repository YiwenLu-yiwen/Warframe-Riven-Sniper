import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_NOTIFICATION_EVENTS,
  MAX_SEEN_HIT_KEYS,
  collectHitNotifications,
  createNotificationMatchSignature,
  createRateLimitNotification,
  formatNotificationEvent,
  hitNotificationKey,
  pruneNotificationState,
  syncNotificationMatchState
} from "../shared/notifications.js";

describe("Web notification rules", () => {
  it("seeds existing online hits without alerting on first load", () => {
    const hit = {
      id: "auction-1",
      rivenId: "riven-a",
      status: "online",
      price: "320p",
      sellerName: "Lotus",
      rivenName: "Rubico Acri-crita"
    };

    const result = collectHitNotifications({
      hits: [hit],
      rivens: [{ id: "riven-a", price: "500p" }],
      seenHitKeys: [],
      initialized: false,
      lang: "zh"
    });

    assert.deepEqual(result.events, []);
    assert.equal(result.initialized, true);
    assert.equal(result.seenHitKeys.includes(hitNotificationKey(hit)), true);
  });

  it("announces new online hits and marks below-threshold prices", () => {
    const oldHit = {
      id: "auction-old",
      rivenId: "riven-a",
      status: "online",
      price: "450p",
      sellerName: "OldSeller",
      rivenName: "Rubico Visi"
    };
    const newHit = {
      id: "auction-new",
      rivenId: "riven-a",
      status: "online",
      price: "320p",
      sellerName: "NewSeller",
      rivenName: "Rubico Acri-crita"
    };

    const result = collectHitNotifications({
      hits: [oldHit, newHit],
      rivens: [{ id: "riven-a", price: "500p" }],
      seenHitKeys: [hitNotificationKey(oldHit)],
      initialized: true,
      lang: "zh"
    });

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].type, "low_price");
    assert.equal(result.events[0].title, "低价命中");
    assert.equal(result.events[0].listingName, "Rubico Acri-crita");
    assert.equal(result.events[0].threshold, "500p");
    assert.match(result.events[0].body, /NewSeller/);
    assert.match(result.events[0].body, /320p/);
    assert.match(result.events[0].body, /<500p/);
  });

  it("ignores offline hits for system notices", () => {
    const result = collectHitNotifications({
      hits: [{
        id: "auction-offline",
        rivenId: "riven-a",
        status: "offline",
        price: "10p",
        sellerName: "OfflineSeller",
        rivenName: "Rubico Visi"
      }],
      rivens: [{ id: "riven-a", price: "500p" }],
      seenHitKeys: [],
      initialized: true,
      lang: "en"
    });

    assert.deepEqual(result.events, []);
    assert.deepEqual(result.seenHitKeys, []);
  });

  it("only notices matched hits and dedupes one market listing across multiple Rivens", () => {
    const matchedA = {
      id: "auction-shared",
      rivenId: "riven-a",
      status: "online",
      price: "320p",
      sellerName: "SharedSeller",
      rivenName: "Rubico Acri-crita"
    };
    const matchedB = { ...matchedA, rivenId: "riven-b" };
    const unmatched = {
      id: "auction-unmatched",
      rivenId: "riven-missing",
      status: "online",
      price: "10p",
      sellerName: "WrongSeller",
      rivenName: "Braton Visi"
    };

    const result = collectHitNotifications({
      hits: [unmatched, matchedA, matchedB],
      rivens: [
        { id: "riven-a", price: "500p" },
        { id: "riven-b", price: "500p" }
      ],
      seenHitKeys: [],
      initialized: true,
      lang: "zh"
    });

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].sellerName, "SharedSeller");
    assert.deepEqual(result.seenHitKeys, [hitNotificationKey(matchedA)]);
  });

  it("creates one soft rate-limit notice for a waiting window", () => {
    const first = createRateLimitNotification({
      meta: { status: "rate_limited", retryAfterMs: 20000, nextRefreshInMs: 20000, refreshedAt: "2026-06-18T00:00:00.000Z" },
      previousKey: "",
      lang: "en"
    });

    const second = createRateLimitNotification({
      meta: { status: "rate_limited", retryAfterMs: 20000, nextRefreshInMs: 18000, refreshedAt: "2026-06-18T00:00:00.000Z" },
      previousKey: first.key,
      lang: "en"
    });

    assert.equal(first.event.type, "rate_limited");
    assert.equal(first.event.title, "Rate limited");
    assert.match(first.event.body, /20s/);
    assert.equal(second.event, null);
  });

  it("formats stored notices in the active language", () => {
    const event = {
      type: "low_price",
      listingName: "Acceltra acri-critacan",
      sellerName: "MarketSeller",
      price: "450p",
      threshold: "500p"
    };

    assert.deepEqual(formatNotificationEvent(event, "en"), {
      title: "Low price hit",
      body: "Acceltra acri-critacan · MarketSeller · 450p · threshold <500p"
    });

    assert.deepEqual(formatNotificationEvent(event, "zh"), {
      title: "低价命中",
      body: "Acceltra acri-critacan · MarketSeller · 450p · 阈值 <500p"
    });

    assert.deepEqual(formatNotificationEvent({ type: "browser_notice_enabled" }, "zh"), {
      title: "浏览器通知已启用",
      body: "系统弹窗已准备好。新的裂罅命中可以在网页外提醒。"
    });
  });

  it("keeps local notification storage bounded", () => {
    const seenHitKeys = Array.from({ length: MAX_SEEN_HIT_KEYS + 20 }, (_, index) => `hit-${index}`);
    const events = Array.from({ length: MAX_NOTIFICATION_EVENTS + 10 }, (_, index) => ({ id: `event-${index}` }));
    const pruned = pruneNotificationState({ seenHitKeys, events, initialized: true, rateLimitKey: "rate", matchSignature: "sig" });

    assert.equal(pruned.seenHitKeys.length, MAX_SEEN_HIT_KEYS);
    assert.equal(pruned.events.length, MAX_NOTIFICATION_EVENTS);
    assert.equal(pruned.seenHitKeys[0], "hit-20");
    assert.equal(pruned.events[0].id, "event-10");
    assert.equal(pruned.rateLimitKey, "rate");
    assert.equal(pruned.matchSignature, "sig");
  });

  it("clears hit notice cache when Riven match rules change", () => {
    const firstSignature = createNotificationMatchSignature([{
      id: "riven-a",
      target: "Rubico",
      positives: ["critical_chance", "critical_damage"],
      negative: "zoom",
      minPrice: "",
      price: "500p"
    }]);
    const nextSignature = createNotificationMatchSignature([{
      id: "riven-a",
      target: "Rubico",
      positives: ["critical_chance", "multishot"],
      negative: "zoom",
      minPrice: "",
      price: "500p"
    }]);

    const state = syncNotificationMatchState({
      initialized: true,
      matchSignature: firstSignature,
      seenHitKeys: ["hit-1"],
      events: [
        { id: "hit-notice", type: "low_price" },
        { id: "rate-notice", type: "rate_limited" }
      ]
    }, nextSignature);

    assert.equal(state.matchSignature, nextSignature);
    assert.deepEqual(state.seenHitKeys, []);
    assert.deepEqual(state.events, [{ id: "rate-notice", type: "rate_limited" }]);
  });
});
