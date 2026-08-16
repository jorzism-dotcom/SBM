// ─── tests/datastore-inventory-tests.mjs ───────────────────────────────────
// DataStore.js-এর ইনভেন্টরি-সম্পর্কিত ফাংশনগুলো সরাসরি টেস্ট করে — আসল,
// অপরিবর্তিত প্রোডাকশন কোড ব্যবহার করে (কোনো লজিক এখানে কপি-পেস্ট করা হয়নি)।
// @capacitor-community/sqlite প্লাগইন native bridge-নির্ভর বলে plain Node-এ
// চলে না — tests/helpers/vite-node-loader.mjs একটা node:sqlite-ব্যাকড শিম
// দিয়ে সেটা রিপ্লেস করে, যাতে ঠিক এই ফাইলটাই আসল App-এ যেভাবে চলবে সেভাবে
// টেস্ট করা যায়।
//
// কেন এই টেস্ট জরুরি (এন্ট্রি ৩৬, PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ২):
// InventorySection-এর ৩টা KPI কার্ড, ডিটেইল লিস্ট, এক্সপায়ারি-ক্যান্ডিডেট আর
// সাপ্লায়ার-গ্রুপিং এখন সরাসরি SQL থেকে আসে — এই সুইটটাই সেই cutover-এর
// সেফটি নেট, বিশেষ করে critical/stockOut কাউন্টের COALESCE ডিফল্ট
// (min_stock_alert না থাকলে 5) আর stockValue-এর NULLIF ফলব্যাক
// (costPrice শূন্য/NULL হলে price, সেটাও না থাকলে ০) রিগ্রেশন থেকে সুরক্ষা দেয়।
//
// রান করুন:  node tests/datastore-inventory-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const {
  getInventoryCounts,
  getInventoryList,
  getExpiryCandidates,
  getSupplierSummary,
  getProductsBySupplierKey,
  upsertMany,
  closeDb,
} = await import("../src/db/DataStore.js");

let passCount = 0;
let failCount = 0;
const failures = [];

async function t(suite, name, fn) {
  try {
    const { pass, expected, actual } = await fn();
    if (pass) {
      passCount++;
    } else {
      failCount++;
      failures.push(`  ✗ [${suite}] ${name} — প্রত্যাশিত ${JSON.stringify(expected)}, পাওয়া গেছে ${JSON.stringify(actual)}`);
    }
  } catch (err) {
    failCount++;
    failures.push(`  ✗ [${suite}] ${name} — এরর/ক্র্যাশ: ${err?.stack || err}`);
  }
}

// প্রতিটা টেস্টে আলাদা businessType (আলাদা in-memory DB) ব্যবহার হচ্ছে, যাতে
// টেস্ট কেসগুলো একে অন্যের ডেটার সাথে মিশে না যায় — প্রতিটা স্বাধীন/আইসোলেটেড।
let _bt = 0;
function freshBusinessType() {
  return `invtest_${++_bt}`;
}

function mkProduct(id, overrides = {}) {
  return {
    id,
    name: `প্রোডাক্ট-${id}`,
    stock: 10,
    costPrice: 5,
    price: 10,
    updatedAt: 1000,
    deleted: false,
    company: "অজ্ঞাত",
    ...overrides,
  };
}

// ── ১. getInventoryCounts — allStock/critical/stockOut/stockValue ───────────
await t("getInventoryCounts", "allStock শুধু stock>0 প্রোডাক্ট গোনে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { stock: 10 }),
    mkProduct("p2", { stock: 0 }),
    mkProduct("p3", { stock: null }),
    mkProduct("p4", { stock: 3 }),
  ]);
  const counts = await getInventoryCounts(bt);
  await closeDb(bt);
  const pass = counts.allStock === 2;
  return { pass, expected: 2, actual: counts.allStock };
});

await t("getInventoryCounts", "critical = stock>0 AND stock<=minStockAlert (ডিফল্ট ৫)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { stock: 5 }), // minStockAlert না দেওয়া → ডিফল্ট ৫, তাই critical
    mkProduct("p2", { stock: 6 }), // ডিফল্ট ৫-এর বেশি → critical না
    mkProduct("p3", { stock: 2, minStockAlert: 10 }), // explicit ১০ → critical
    mkProduct("p4", { stock: 0, minStockAlert: 10 }), // স্টক-আউট, critical না (stock>0 শর্ত)
  ]);
  const counts = await getInventoryCounts(bt);
  await closeDb(bt);
  const pass = counts.critical === 2 && counts.stockOut === 1;
  return { pass, expected: { critical: 2, stockOut: 1 }, actual: { critical: counts.critical, stockOut: counts.stockOut } };
});

await t("getInventoryCounts", "stockValue = COALESCE(costPrice, price, 0) * stock, costPrice শূন্য হলে price-এ ফলব্যাক", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { stock: 10, costPrice: 5, price: 20 }), // 10*5=50
    mkProduct("p2", { stock: 4, costPrice: 0, price: 25 }), // costPrice শূন্য → price ফলব্যাক: 4*25=100
    mkProduct("p3", { stock: 2, costPrice: null, price: null }), // দুটোই নেই → 0
  ]);
  const counts = await getInventoryCounts(bt);
  await closeDb(bt);
  const pass = counts.stockValue === 150;
  return { pass, expected: 150, actual: counts.stockValue };
});

await t("getInventoryCounts", "soft-deleted প্রোডাক্ট বাদ যায়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { stock: 10, deleted: false }),
    mkProduct("p2", { stock: 10, deleted: true }),
  ]);
  const counts = await getInventoryCounts(bt);
  await closeDb(bt);
  const pass = counts.allStock === 1;
  return { pass, expected: 1, actual: counts.allStock };
});

await t("getInventoryCounts", "খালি store — সব কাউন্ট ০, ক্র্যাশ করে না", async () => {
  const bt = freshBusinessType();
  const counts = await getInventoryCounts(bt);
  await closeDb(bt);
  const pass = counts.allStock === 0 && counts.critical === 0 && counts.stockOut === 0 && counts.stockValue === 0;
  return { pass, expected: "সব ০", actual: counts };
});

// ── ২. getInventoryList — 'all' | 'critical' | 'out' ─────────────────────────
await t("getInventoryList", "kind='all' → stock>0 প্রোডাক্ট, stock DESC সর্টেড", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { stock: 3 }),
    mkProduct("p2", { stock: 9 }),
    mkProduct("p3", { stock: 0 }),
    mkProduct("p4", { stock: 6 }),
  ]);
  const list = await getInventoryList(bt, "all");
  await closeDb(bt);
  const ids = list.map((p) => p.id);
  const pass = ids.length === 3 && ids[0] === "p2" && ids[1] === "p4" && ids[2] === "p1";
  return { pass, expected: "[p2,p4,p1]", actual: ids };
});

await t("getInventoryList", "kind='critical' → শুধু কম-স্টক প্রোডাক্ট", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { stock: 2, minStockAlert: 5 }),
    mkProduct("p2", { stock: 20, minStockAlert: 5 }),
    mkProduct("p3", { stock: 0, minStockAlert: 5 }),
  ]);
  const list = await getInventoryList(bt, "critical");
  await closeDb(bt);
  const ids = list.map((p) => p.id).sort();
  const pass = ids.length === 1 && ids[0] === "p1";
  return { pass, expected: "[p1]", actual: ids };
});

await t("getInventoryList", "kind='out' → শুধু স্টক-আউট (NULL বা ০)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { stock: 0 }),
    mkProduct("p2", { stock: null }),
    mkProduct("p3", { stock: 5 }),
  ]);
  const list = await getInventoryList(bt, "out");
  await closeDb(bt);
  const ids = list.map((p) => p.id).sort();
  const pass = ids.length === 2 && ids[0] === "p1" && ids[1] === "p2";
  return { pass, expected: "[p1,p2]", actual: ids };
});

await t("getInventoryList", "রিটার্নড আইটেম আসল রেকর্ডের সাথে মেলে (JSON round-trip)", async () => {
  const bt = freshBusinessType();
  const original = mkProduct("p1", { stock: 7, name: "প্যারাসিটামল" });
  await upsertMany(bt, "products", [original]);
  const list = await getInventoryList(bt, "all");
  await closeDb(bt);
  const pass = list.length === 1 && list[0].name === "প্যারাসিটামল" && list[0].stock === 7;
  return { pass, expected: original, actual: list[0] };
});

await t("getInventoryList", "অজানা kind দিলে এরর থ্রো করে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1")]);
  let threw = false;
  try {
    await getInventoryList(bt, "bogus");
  } catch {
    threw = true;
  }
  await closeDb(bt);
  return { pass: threw, expected: "throws", actual: threw ? "threw" : "no throw" };
});

// ── ৩. getExpiryCandidates — nearest_expiry_date ভিত্তিক ─────────────────────
await t("getExpiryCandidates", "৩ মাসের মধ্যে (ডিফল্ট) মেয়াদ শেষ হবে এমন ব্যাচ/প্রোডাক্ট ফেরত দেয়", async () => {
  const bt = freshBusinessType();
  const soon = new Date();
  soon.setMonth(soon.getMonth() + 1);
  const far = new Date();
  far.setFullYear(far.getFullYear() + 2);
  await upsertMany(bt, "products", [
    mkProduct("p1", { stock: 5, expiryDate: soon.toISOString().slice(0, 10) }),
    mkProduct("p2", { stock: 5, expiryDate: far.toISOString().slice(0, 10) }),
    mkProduct("p3", { stock: 5 }), // কোনো expiryDate নেই
  ]);
  const candidates = await getExpiryCandidates(bt);
  await closeDb(bt);
  const ids = candidates.map((p) => p.id);
  const pass = ids.length === 1 && ids[0] === "p1";
  return { pass, expected: "[p1]", actual: ids };
});

await t("getExpiryCandidates", "monthsAhead প্যারামিটার দিয়ে উইন্ডো কাস্টমাইজ করা যায়", async () => {
  const bt = freshBusinessType();
  const in6Months = new Date();
  in6Months.setMonth(in6Months.getMonth() + 6);
  await upsertMany(bt, "products", [mkProduct("p1", { stock: 5, expiryDate: in6Months.toISOString().slice(0, 10) })]);

  const narrow = await getExpiryCandidates(bt, { monthsAhead: 3 });
  const wide = await getExpiryCandidates(bt, { monthsAhead: 8 });
  await closeDb(bt);
  const pass = narrow.length === 0 && wide.length === 1;
  return { pass, expected: { narrow: 0, wide: 1 }, actual: { narrow: narrow.length, wide: wide.length } };
});

await t("getExpiryCandidates", "batches থাকলে সবচেয়ে কাছের qty>0 ব্যাচের expiryDate ব্যবহার হয়", async () => {
  const bt = freshBusinessType();
  const soon = new Date();
  soon.setMonth(soon.getMonth() + 1);
  const later = new Date();
  later.setMonth(later.getMonth() + 2);
  await upsertMany(bt, "products", [
    mkProduct("p1", {
      stock: 8,
      batches: [
        { qty: 0, expiryDate: soon.toISOString().slice(0, 10) }, // qty=0 → বাদ
        { qty: 8, expiryDate: later.toISOString().slice(0, 10) },
      ],
    }),
  ]);
  const candidates = await getExpiryCandidates(bt, { monthsAhead: 3 });
  await closeDb(bt);
  const pass = candidates.length === 1 && candidates[0].id === "p1";
  return { pass, expected: "[p1]", actual: candidates.map((p) => p.id) };
});

// ── ৪. getSupplierSummary — GROUP BY supplier_key ────────────────────────────
await t("getSupplierSummary", "প্রতি সাপ্লায়ারের count/stock/out/low ঠিকভাবে গ্রুপ হয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { company: "স্কয়ার", stock: 10 }),
    mkProduct("p2", { company: "স্কয়ার", stock: 0 }),
    mkProduct("p3", { company: "বেক্সিমকো", stock: 3, minStockAlert: 5 }),
  ]);
  const summary = await getSupplierSummary(bt);
  await closeDb(bt);
  const square = summary.find((s) => s.name === "স্কয়ার");
  const beximco = summary.find((s) => s.name === "বেক্সিমকো");
  const pass =
    summary.length === 2 &&
    square?.count === 2 &&
    square?.out_count === 1 &&
    beximco?.count === 1 &&
    beximco?.low_count === 1;
  return {
    pass,
    expected: { squareCount: 2, squareOut: 1, beximcoCount: 1, beximcoLow: 1 },
    actual: { square, beximco },
  };
});

await t("getSupplierSummary", "company/category না থাকলে 'অজ্ঞাত' গ্রুপে পড়ে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1", { company: undefined, category: undefined })]);
  const summary = await getSupplierSummary(bt);
  await closeDb(bt);
  const pass = summary.length === 1 && summary[0].name === "অজ্ঞাত";
  return { pass, expected: "অজ্ঞাত", actual: summary[0]?.name };
});

await t("getSupplierSummary", "count DESC অর্ডারে সর্টেড থাকে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { company: "A" }),
    mkProduct("p2", { company: "B" }),
    mkProduct("p3", { company: "B" }),
    mkProduct("p4", { company: "B" }),
  ]);
  const summary = await getSupplierSummary(bt);
  await closeDb(bt);
  const pass = summary[0].name === "B" && summary[0].count === 3;
  return { pass, expected: "B প্রথমে, count=3", actual: summary[0] };
});

// ── ৫. getProductsBySupplierKey ──────────────────────────────────────────────
await t("getProductsBySupplierKey", "শুধু নির্দিষ্ট সাপ্লায়ারের প্রোডাক্ট ফেরত দেয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { company: "স্কয়ার" }),
    mkProduct("p2", { company: "বেক্সিমকো" }),
    mkProduct("p3", { company: "স্কয়ার" }),
  ]);
  const rows = await getProductsBySupplierKey(bt, "স্কয়ার");
  await closeDb(bt);
  const ids = rows.map((p) => p.id).sort();
  const pass = ids.length === 2 && ids[0] === "p1" && ids[1] === "p3";
  return { pass, expected: "[p1,p3]", actual: ids };
});

await t("getProductsBySupplierKey", "না-মেলা সাপ্লায়ার-কী দিলে খালি array (ক্র্যাশ করে না)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1", { company: "স্কয়ার" })]);
  const rows = await getProductsBySupplierKey(bt, "নেই-এমন-কোম্পানি");
  await closeDb(bt);
  const pass = rows.length === 0;
  return { pass, expected: 0, actual: rows.length };
});

// ── ফলাফল ────────────────────────────────────────────────────────────────────
console.log(`\n ইনভেন্টরি DataStore টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failures.length > 0) {
  console.log(`❌ ${failCount}টি ফেল, ${passCount}টি পাস\n`);
  console.log(failures.join("\n"));
  console.log("");
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
  process.exit(0);
}
