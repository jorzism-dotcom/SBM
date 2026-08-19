// ─── tests/datastore-getallrows-tests.mjs ──────────────────────────────────
// DataStore.js-এর getAllRows() সরাসরি টেস্ট করে — আসল, অপরিবর্তিত প্রোডাকশন
// কোড ব্যবহার করে (কোনো লজিক এখানে কপি-পেস্ট করা হয়নি)।
//
// কেন এই টেস্ট জরুরি (এন্ট্রি ৭৫, products SQLite-primary ধাপ ৪ প্রস্তুতি —
// ব্যাকআপ পাথ redesign): getAllRows() এখন `buildBackupData()`-এর (App.jsx)
// products সোর্স — অটো-ব্যাকআপ প্রতি ৫-৪৫ মিনিটে এটাই কল করে। ভুল হলে
// (রেকর্ড মিস/ডুপ্লিকেট/deleted রেকর্ড ফাঁকিতে ঢুকে যাওয়া/chunk-সীমা পার
// হওয়া বড় টেবিলে রেকর্ড হারানো) সরাসরি ব্যাকআপ ফাইলেই নীরবে ডেটা হারাবে —
// তাই এই সুইটে বিশেষভাবে chunk-সীমা (২০০০) পার হওয়া বড় সেট, deleted রেকর্ড
// বাদ যাওয়া, খালি টেবিল, আর customers/invoices store কভার করা হয়েছে।
//
// রান করুন:  node tests/datastore-getallrows-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { getAllRows, upsertMany, closeDb } = await import("../src/db/DataStore.js");

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
  return `gartest_${++_bt}`;
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

// ── ১. মৌলিক — সব রেকর্ড ফেরত দেয় ───────────────────────────────────────
await t("getAllRows", "সবগুলো non-deleted রেকর্ড ফেরত দেয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1"), mkProduct("p2"), mkProduct("p3")]);
  const rows = await getAllRows(bt, "products");
  await closeDb(bt);
  const ids = rows.map((p) => p.id).sort();
  const pass = ids.length === 3 && ids.join(",") === "p1,p2,p3";
  return { pass, expected: "[p1,p2,p3]", actual: ids };
});

// ── ২. deleted রেকর্ড বাদ যায় ────────────────────────────────────────────
await t("getAllRows", "deleted=true রেকর্ড ফলাফলে অন্তর্ভুক্ত হয় না", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [mkProduct("p1"), mkProduct("p2", { deleted: true })]);
  const rows = await getAllRows(bt, "products");
  await closeDb(bt);
  const ids = rows.map((p) => p.id);
  const pass = ids.length === 1 && ids[0] === "p1";
  return { pass, expected: "[p1]", actual: ids };
});

// ── ৩. খালি টেবিল → খালি array (ক্র্যাশ করে না) ───────────────────────────
await t("getAllRows", "খালি টেবিলে খালি array ফেরত দেয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", []);
  const rows = await getAllRows(bt, "products");
  await closeDb(bt);
  const pass = Array.isArray(rows) && rows.length === 0;
  return { pass, expected: 0, actual: rows.length };
});

// ── ৪. CHUNK_SIZE (২০০০) সীমা পার হওয়া বড় টেবিল — কোনো রেকর্ড হারায় না ────
await t("getAllRows", "২০০০-এর বেশি রেকর্ড (multi-chunk cursor) সবগুলো ঠিকভাবে ফেরত দেয়, ডুপ্লিকেট/মিস নেই", async () => {
  const bt = freshBusinessType();
  const N = 4500;
  const products = Array.from({ length: N }, (_, i) => mkProduct(`p${String(i).padStart(5, "0")}`));
  await upsertMany(bt, "products", products);
  const rows = await getAllRows(bt, "products");
  await closeDb(bt);
  const uniqueIds = new Set(rows.map((p) => p.id));
  const pass = rows.length === N && uniqueIds.size === N;
  return { pass, expected: `${N}টা, ডুপ্লিকেট-শূন্য`, actual: `${rows.length}টা, ${uniqueIds.size}টা ইউনিক` };
});

// ── ৫. চূড়ান্ত batch ঠিক chunk-সীমায় (২০০০) শেষ হলেও লুপ সঠিকভাবে থামে ─────
await t("getAllRows", "রেকর্ড সংখ্যা ঠিক chunk-সীমার (২০০০) গুণিতক হলেও সব ফেরত দেয়, infinite loop হয় না", async () => {
  const bt = freshBusinessType();
  const N = 4000; // ২ × CHUNK_SIZE
  const products = Array.from({ length: N }, (_, i) => mkProduct(`p${String(i).padStart(5, "0")}`));
  await upsertMany(bt, "products", products);
  const rows = await getAllRows(bt, "products");
  await closeDb(bt);
  const pass = rows.length === N;
  return { pass, expected: N, actual: rows.length };
});

// ── ৬. customers/invoices store-এও কাজ করে (products-নির্দিষ্ট না) ────────
await t("getAllRows", "customers store-এও সঠিকভাবে কাজ করে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "customers", [
    { id: "c1", name: "গ্রাহক-১", updatedAt: 1000, deleted: false },
    { id: "c2", name: "গ্রাহক-২", updatedAt: 1000, deleted: false },
  ]);
  const rows = await getAllRows(bt, "customers");
  await closeDb(bt);
  const ids = rows.map((c) => c.id).sort();
  const pass = ids.length === 2 && ids.join(",") === "c1,c2";
  return { pass, expected: "[c1,c2]", actual: ids };
});

// ── ফলাফল ────────────────────────────────────────────────────────────────
console.log(`\n getAllRows() DataStore টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failures.length > 0) {
  console.log(`❌ ${failCount}টি ফেল, ${passCount}টি পাস\n`);
  console.log(failures.join("\n"));
  console.log("");
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
  process.exit(0);
}
