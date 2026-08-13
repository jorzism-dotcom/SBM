// ─── tests/datastore-querypage-tests.mjs ───────────────────────────────────
// DataStore.js-এর queryPage() (keyset/seek pagination) সরাসরি টেস্ট করে —
// আসল, অপরিবর্তিত প্রোডাকশন কোড ব্যবহার করে (কোনো লজিক এখানে কপি-পেস্ট করা
// হয়নি)। @capacitor-community/sqlite প্লাগইন native bridge-নির্ভর বলে plain
// Node-এ চলে না — tests/helpers/vite-node-loader.mjs একটা node:sqlite-ব্যাকড
// শিম দিয়ে সেটা রিপ্লেস করে, যাতে ঠিক এই ফাইলটাই আসল App-এ যেভাবে চলবে সেভাবে
// টেস্ট করা যায়।
//
// কেন এই টেস্ট জরুরি (queryPage()-এর ডকব্লক দ্রষ্টব্য): এটাই আসন্ন read-path
// cutover (queryPage() App.jsx-এ wire করা)-এর সেফটি নেট — বিশেষ করে
// composite-cursor tie-breaking (ডুপ্লিকেট sortColumn ভ্যালুতে row miss/repeat
// না হওয়া) আর row-value tuple comparison (`(a,b) < (x,y)`, OR-প্যাটার্ন না)
// রিগ্রেশন থেকে সুরক্ষা দেয়।
//
// রান করুন:  node tests/datastore-querypage-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { queryPage, upsertMany, closeDb } = await import("../src/db/DataStore.js");

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
  return `qptest_${++_bt}`;
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

function mkInvoice(id, overrides = {}) {
  return {
    id,
    invoiceNo: `INV-${id}`,
    createdAt: 1000,
    total: 100,
    status: "active",
    ...overrides,
  };
}

// ── ১. বেসিক পেজিনেশন: প্রথম পেজ, limit, hasMore/nextCursor ──────────────────
await t("queryPage বেসিক", "প্রথম পেজ সঠিক সংখ্যক রো + DESC অর্ডার দেয়", async () => {
  const bt = freshBusinessType();
  const products = [1, 2, 3, 4, 5].map((i) => mkProduct(`p${i}`, { updatedAt: 1000 + i }));
  await upsertMany(bt, "products", products);

  const page = await queryPage(bt, "products", { limit: 2 });
  const ids = page.rows.map((r) => r.id);
  await closeDb(bt);
  const pass = ids.length === 2 && ids[0] === "p5" && ids[1] === "p4" && page.hasMore === true && page.nextCursor != null;
  return { pass, expected: "[p5,p4], hasMore=true", actual: { ids, hasMore: page.hasMore } };
});

await t("queryPage বেসিক", "শেষ পেজে (limit-এর কম রো) hasMore=false, nextCursor=null", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [1, 2, 3].map((i) => mkProduct(`p${i}`, { updatedAt: 1000 + i })));

  const page1 = await queryPage(bt, "products", { limit: 2 });
  const page2 = await queryPage(bt, "products", { limit: 2, cursor: page1.nextCursor });
  await closeDb(bt);
  const pass = page2.rows.length === 1 && page2.rows[0].id === "p1" && page2.hasMore === false && page2.nextCursor === null;
  return { pass, expected: "[p1], hasMore=false", actual: { ids: page2.rows.map((r) => r.id), hasMore: page2.hasMore } };
});

await t("queryPage বেসিক", "খালি store — খালি rows, nextCursor null, hasMore false, ক্র্যাশ করে না", async () => {
  const bt = freshBusinessType();
  const page = await queryPage(bt, "products", { limit: 10 });
  await closeDb(bt);
  const pass = page.rows.length === 0 && page.nextCursor === null && page.hasMore === false;
  return { pass, expected: "[], null, false", actual: page };
});

// ── ২. পুরো তালিকা traversal — কোনো row miss/duplicate হয় না ─────────────────
await t("queryPage traversal", "সব পেজ ঘুরে সব রো ঠিক একবার করে পাওয়া যায় (কোনো miss/duplicate নেই)", async () => {
  const bt = freshBusinessType();
  const N = 23;
  const products = Array.from({ length: N }, (_, i) => mkProduct(`p${i}`, { updatedAt: 1000 + i }));
  await upsertMany(bt, "products", products);

  const seen = [];
  let cursor = null;
  let guard = 0;
  do {
    const page = await queryPage(bt, "products", { limit: 5, cursor });
    seen.push(...page.rows.map((r) => r.id));
    cursor = page.nextCursor;
    guard++;
  } while (cursor && guard < 100);
  await closeDb(bt);

  const uniqueCount = new Set(seen).size;
  const pass = seen.length === N && uniqueCount === N && guard <= 100;
  return { pass, expected: `${N} unique`, actual: { total: seen.length, unique: uniqueCount, pages: guard } };
});

// ── ৩. Composite tie-break — ডুপ্লিকেট sortColumn ভ্যালু (আসল বাগ যেটা ফিক্স হয়েছে) ──
await t("queryPage tie-break", "ডুপ্লিকেট updated_at ভ্যালুতেও id দিয়ে টাইব্রেক করে কোনো রো স্কিপ/রিপিট হয় না", async () => {
  const bt = freshBusinessType();
  // ইচ্ছাকৃতভাবে সবগুলো রেকর্ডের updated_at একই মিলিসেকেন্ডে — এটাই সেই কেস যেটা
  // শুধু sortColumn দিয়ে কার্সার বানালে ভাঙত (docblock-এ বর্ণিত)।
  const N = 10;
  const products = Array.from({ length: N }, (_, i) => mkProduct(`p${i}`, { updatedAt: 5000 }));
  await upsertMany(bt, "products", products);

  const seen = [];
  let cursor = null;
  let guard = 0;
  do {
    const page = await queryPage(bt, "products", { limit: 3, cursor });
    seen.push(...page.rows.map((r) => r.id));
    cursor = page.nextCursor;
    guard++;
  } while (cursor && guard < 100);
  await closeDb(bt);

  const uniqueCount = new Set(seen).size;
  const pass = seen.length === N && uniqueCount === N;
  return { pass, expected: `${N} unique despite tie`, actual: { total: seen.length, unique: uniqueCount } };
});

// ── ৪. sortDir=ASC ঠিকমতো কাজ করে ────────────────────────────────────────────
await t("queryPage sortDir", "ASC দিলে সবচেয়ে পুরনো থেকে শুরু হয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [1, 2, 3, 4].map((i) => mkProduct(`p${i}`, { updatedAt: 1000 + i })));

  const page = await queryPage(bt, "products", { limit: 2, sortDir: "ASC" });
  await closeDb(bt);
  const ids = page.rows.map((r) => r.id);
  const pass = ids[0] === "p1" && ids[1] === "p2";
  return { pass, expected: "[p1,p2]", actual: ids };
});

// ── ৫. custom where/params (soft-delete ফিল্টার) ─────────────────────────────
await t("queryPage where/params", "where + params দিয়ে deleted বাদ দেওয়া যায়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { updatedAt: 1001, deleted: false }),
    mkProduct("p2", { updatedAt: 1002, deleted: true }),
    mkProduct("p3", { updatedAt: 1003, deleted: false }),
  ]);

  const page = await queryPage(bt, "products", { where: "deleted = ?", params: [0], limit: 10 });
  await closeDb(bt);
  const ids = page.rows.map((r) => r.id).sort();
  const pass = ids.length === 2 && ids[0] === "p1" && ids[1] === "p3";
  return { pass, expected: "[p1,p3]", actual: ids };
});

// ── ৬. invoices ডিফল্ট sort column (created_at) — আগে যে বাগ ছিল সেটার regression guard ──
await t("queryPage invoices ডিফল্ট", "invoices store-এ ডিফল্ট sort কলাম created_at (updated_at না, যেটা invoices-এ নেই)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [1, 2, 3].map((i) => mkInvoice(`inv${i}`, { createdAt: 2000 + i })));

  const page = await queryPage(bt, "invoices", { limit: 10 }); // sortColumn না দিয়ে — DEFAULT_SORT_COLUMN ব্যবহার হবে
  await closeDb(bt);
  const ids = page.rows.map((r) => r.id);
  const pass = ids.length === 3 && ids[0] === "inv3" && ids[2] === "inv1"; // created_at DESC
  return { pass, expected: "[inv3,inv2,inv1]", actual: ids };
});

// ── ৭. কার্সার সহ custom sortColumn (id দিয়ে) ঠিকমতো কাজ করে ─────────────────
await t("queryPage custom sortColumn", "sortColumn=id দিয়ে ঠিকমতো keyset কাজ করে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "customers", [
    { id: "c1", name: "ক", updatedAt: 1000, balance: 0 },
    { id: "c2", name: "খ", updatedAt: 1000, balance: 0 },
    { id: "c3", name: "গ", updatedAt: 1000, balance: 0 },
  ]);

  const page1 = await queryPage(bt, "customers", { sortColumn: "id", sortDir: "ASC", limit: 2 });
  const page2 = await queryPage(bt, "customers", { sortColumn: "id", sortDir: "ASC", limit: 2, cursor: page1.nextCursor });
  await closeDb(bt);
  const ids1 = page1.rows.map((r) => r.id);
  const ids2 = page2.rows.map((r) => r.id);
  const pass = ids1.join() === "c1,c2" && ids2.join() === "c3";
  return { pass, expected: "[c1,c2] then [c3]", actual: { ids1, ids2 } };
});

// ── ৮. রেকর্ড JSON রাউন্ড-ট্রিপ — data কলাম থেকে ঠিক অরিজিনাল অবজেক্ট ফেরত আসে ──
await t("queryPage ডেটা ইন্টিগ্রিটি", "rows-এর প্রতিটা আইটেম মূল রেকর্ডের সাথে মেলে (JSON parse ঠিকঠাক)", async () => {
  const bt = freshBusinessType();
  const original = mkProduct("p1", { updatedAt: 1000, price: 42.5, stock: 7 });
  await upsertMany(bt, "products", [original]);

  const page = await queryPage(bt, "products", { limit: 10 });
  await closeDb(bt);
  const row = page.rows[0];
  const pass = row && row.id === "p1" && row.price === 42.5 && row.stock === 7 && row.name === original.name;
  return { pass, expected: original, actual: row };
});

// ── ফলাফল ────────────────────────────────────────────────────────────────────
console.log(`\n queryPage() ইউনিট টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failures.length > 0) {
  console.log(`❌ ${failCount}টি ফেল, ${passCount}টি পাস\n`);
  console.log(failures.join("\n"));
  console.log("");
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
  process.exit(0);
}
