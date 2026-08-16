// ─── tests/datastore-getbyids-tests.mjs ────────────────────────────────────
// DataStore.js-এর getByIds() (ব্যাচ id-লুকআপ) সরাসরি টেস্ট করে — আসল,
// অপরিবর্তিত প্রোডাকশন কোড ব্যবহার করে (কোনো লজিক এখানে কপি-পেস্ট করা হয়নি)।
// @capacitor-community/sqlite প্লাগইন native bridge-নির্ভর বলে plain Node-এ
// চলে না — tests/helpers/vite-node-loader.mjs একটা node:sqlite-ব্যাকড শিম
// দিয়ে সেটা রিপ্লেস করে, যাতে ঠিক এই ফাইলটাই আসল App-এ যেভাবে চলবে সেভাবে
// টেস্ট করা যায়।
//
// কেন এই টেস্ট জরুরি (এন্ট্রি ৪২, PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ৭
// প্রস্তুতি): getByIds() হলো lazy boot-load-এর ভিত্তি — পেজিনেটেড
// queryPage() থেকে পাওয়া id-লিস্টের জন্য পূর্ণ product অবজেক্ট আনার একমাত্র
// batched পথ। ভুল হলে (id মিস/ডুপ্লিকেট/অর্ডার এলোমেলো) সরাসরি POS/Products
// লিস্টে ভুল/অনুপস্থিত কার্ড রেন্ডার হবে — তাই এই সুইটে বিশেষভাবে অর্ডার-
// প্রিজার্ভেশন, ডুপ্লিকেট-id, না-পাওয়া-id, খালি-ইনপুট, আর বড় (chunk-সীমা
// পার হওয়া) ব্যাচ কভার করা হয়েছে।
//
// রান করুন:  node tests/datastore-getbyids-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { getByIds, upsertMany, closeDb } = await import("../src/db/DataStore.js");

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

let _bt = 0;
function freshBusinessType() {
  return `gbitest_${++_bt}`;
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
    ...overrides,
  };
}

// ── ১. মৌলিক ব্যাচ-লুকআপ ─────────────────────────────────────────────────
await t("getByIds", "একাধিক id একসাথে সঠিক রেকর্ড ফেরত দেয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1"), mkProduct("p2"), mkProduct("p3")]);
  const rows = await getByIds(bt, "products", ["p1", "p3"]);
  await closeDb(bt);
  const ids = rows.map((p) => p.id);
  const pass = ids.length === 2 && ids.includes("p1") && ids.includes("p3");
  return { pass, expected: "[p1,p3]", actual: ids };
});

// ── ২. ইনপুট-অর্ডার বজায় থাকে ─────────────────────────────────────────────
await t("getByIds", "রিটার্ন-অর্ডার ইনপুট id-লিস্টের অর্ডার অনুসরণ করে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1"), mkProduct("p2"), mkProduct("p3")]);
  const rows = await getByIds(bt, "products", ["p3", "p1", "p2"]);
  await closeDb(bt);
  const ids = rows.map((p) => p.id);
  const pass = ids[0] === "p3" && ids[1] === "p1" && ids[2] === "p2";
  return { pass, expected: "[p3,p1,p2]", actual: ids };
});

// ── ৩. না-পাওয়া id চুপচাপ বাদ যায় (ক্র্যাশ করে না) ────────────────────────
await t("getByIds", "না-পাওয়া id বাদ দিয়ে বাকিগুলো ফেরত দেয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1")]);
  const rows = await getByIds(bt, "products", ["p1", "nonexistent"]);
  await closeDb(bt);
  const pass = rows.length === 1 && rows[0].id === "p1";
  return { pass, expected: 1, actual: rows.length };
});

// ── ৪. ডুপ্লিকেট id একবারই আসে ────────────────────────────────────────────
await t("getByIds", "একই id বারবার দিলেও রেকর্ড একবারই ফেরত আসে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1")]);
  const rows = await getByIds(bt, "products", ["p1", "p1", "p1"]);
  await closeDb(bt);
  const pass = rows.length === 1;
  return { pass, expected: 1, actual: rows.length };
});

// ── ৫. খালি ইনপুট → খালি array, কোনো DB কল না ──────────────────────────────
await t("getByIds", "খালি id-লিস্টে খালি array ফেরত দেয়", async () => {
  const bt = freshBusinessType();
  const rows = await getByIds(bt, "products", []);
  const pass = Array.isArray(rows) && rows.length === 0;
  return { pass, expected: 0, actual: rows.length };
});

// ── ৬. সব id ভুল হলে খালি array ───────────────────────────────────────────
await t("getByIds", "সবগুলো id ভুল হলে খালি array (ক্র্যাশ করে না)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1")]);
  const rows = await getByIds(bt, "products", ["a", "b", "c"]);
  await closeDb(bt);
  const pass = rows.length === 0;
  return { pass, expected: 0, actual: rows.length };
});

// ── ৭. CHUNK_SIZE (৫০০) সীমা পার হওয়া বড় ব্যাচ ────────────────────────────
await t("getByIds", "৫০০-এর বেশি id (multi-chunk) সব রেকর্ড ঠিকভাবে ফেরত দেয়", async () => {
  const bt = freshBusinessType();
  const N = 1200;
  const products = Array.from({ length: N }, (_, i) => mkProduct(`p${i}`));
  await upsertMany(bt, "products", products);
  const ids = products.map((p) => p.id);
  const rows = await getByIds(bt, "products", ids);
  await closeDb(bt);
  const pass = rows.length === N && rows[0].id === "p0" && rows[N - 1].id === `p${N - 1}`;
  return { pass, expected: `${N}টা, অর্ডার-প্রিজার্ভড`, actual: `${rows.length}টা` };
});

// ── ৮. customers/invoices store-এও কাজ করে (products-নির্দিষ্ট না) ────────
await t("getByIds", "customers store-এও সঠিকভাবে কাজ করে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "customers", [
    { id: "c1", name: "গ্রাহক-১", updatedAt: 1000 },
    { id: "c2", name: "গ্রাহক-২", updatedAt: 1000 },
  ]);
  const rows = await getByIds(bt, "customers", ["c2", "c1"]);
  await closeDb(bt);
  const ids = rows.map((c) => c.id);
  const pass = ids[0] === "c2" && ids[1] === "c1";
  return { pass, expected: "[c2,c1]", actual: ids };
});

// ── ফলাফল ────────────────────────────────────────────────────────────────
console.log(`\n getByIds() DataStore টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failures.length > 0) {
  console.log(`❌ ${failCount}টি ফেল, ${passCount}টি পাস\n`);
  console.log(failures.join("\n"));
  console.log("");
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
  process.exit(0);
}
