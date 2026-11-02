import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCALES, en, normalizeLocale, translate, zhCN } from "../shared/locales.ts";

function flatten(value, prefix = "") {
  const out = new Map();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") out.set(path, child);
    else for (const [nested, text] of flatten(child, path)) out.set(nested, text);
  }
  return out;
}

function placeholders(value) {
  return [...value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)]
    .map((match) => match[1])
    .sort();
}

const english = flatten(en);
const chinese = flatten(zhCN);

test("English and Chinese expose the same keys", () => {
  assert.deepEqual([...chinese.keys()].sort(), [...english.keys()].sort());
});

test("Every translation has the same interpolation placeholders", () => {
  for (const [key, value] of english) {
    assert.deepEqual(placeholders(chinese.get(key)), placeholders(value), key);
  }
});

test("No translation is empty", () => {
  for (const [key, value] of english) assert.ok(value.trim(), `en ${key}`);
  for (const [key, value] of chinese) assert.ok(value.trim(), `zh-CN ${key}`);
});

test("Locale normalization covers the tags the host can report", () => {
  assert.deepEqual(LOCALES, ["en", "zh-CN"]);
  assert.equal(normalizeLocale("zh"), "zh-CN");
  assert.equal(normalizeLocale("zh-Hans"), "zh-CN");
  assert.equal(normalizeLocale("zh-CN"), "zh-CN");
  assert.equal(normalizeLocale("zh_CN"), "zh-CN");
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("fr"), "en");
  assert.equal(normalizeLocale(undefined), "en");
});

test("translate interpolates the same key in both languages", () => {
  assert.equal(translate("en", "usage.balance", { currency: "CNY" }), "Balance (CNY)");
  assert.equal(translate("zh-CN", "usage.balance", { currency: "CNY" }), "余额 (CNY)");
  assert.equal(
    translate("en", "usage.pricingPeak", { countdown: "2h" }),
    "Peak · off-peak in 2h",
  );
  assert.equal(
    translate("zh-CN", "usage.pricingPeak", { countdown: "2h" }),
    "高峰 · 2h后进入低谷",
  );
  assert.equal(translate("en", "missing.key"), "missing.key");
});
