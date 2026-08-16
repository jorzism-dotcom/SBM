// ─── tests/datastore-expenses-tests.mjs ────────────────────────────────────
// DataStore.js-এর getDateRangeAggregate() (এন্ট্রি ৩৭, useKpiStats windowing-
// দরকার-নেই ডেটা-সোর্সগুলোর প্রথমটা — expenses) সরাসরি টেস্ট করে — আসল,
// অপরিবর্তিত প্রোডাকশন কোড ব্যবহার করে (কোনো লজিক এখানে কপি-পেস্ট করা হয়নি)।
// @capacitor-community/sqlite প্লাগইন native bridge-নির্ভর বলে plain Node-এ
// চলে না — tests/helpers/vite-node-loader.mjs একটা node:sqlite-ব্যাকড শিম
// দিয়ে সেটা রিপ্লেস করে, যাতে ঠিক এই ফাইলটাই আসল App-এ যেভাবে চলবে সেভাবে
// টেস্ট করা যায়।
//
// কেন এই টেস্ট জরুরি: getDateRangeAggregate()-এর dateKeyExact/dateKeyGte/
// dateKeyPrefix — এই তিনটার সিমান্টিক্স আলাদা (DataStore.js-এর ডকব্লক
// দ্রষ্টব্য), বিশেষ করে dateKeyGte বনাম dateKeyPrefix: App.jsx-এর
// `monthExpense` ফিল্টার আসলে ">= monthStartKey" (মাস-প্রেফিক্স ম্যাচ না!),
// অতীত মাস নেভিগেট করার সময় dateKeyPrefix ভুলভাবে ব্যবহার করলে ফলাফল ভুল
// (শুধু ওই একমাসেই সীমাবদ্ধ) হয়ে যেত — এই সুইট সেই রিগ্রেশন থেকে সুরক্ষা দেয়।
//
// রান করুন:  node tests/datastore-expenses-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { getDateRangeAggregate, upsertMany, closeDb } = await import("../src/db/DataStore.js");

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
  return `exptest_${++_bt}`;
}

function mkExpense(id, overrides = {}) {
  return {
    id,
    category: "বিবিধ",
    amount: 100,
    dateKey: "2026-08-01",
    updatedAt: 1000,
    ...overrides,
  };
}

// ── ১. dateKeyExact — ঠিক একটা date_key ──────────────────────────────────────
await t("dateKeyExact", "শুধু ম্যাচিং date_key-এর এন্ট্রি যোগ হয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "expenses", [
    mkExpense("e1", { dateKey: "2026-08-16", amount: 200 }),
    mkExpense("e2", { dateKey: "2026-08-16", amount: 300 }),
    mkExpense("e3", { dateKey: "2026-08-15", amount: 500 }),
  ]);
  const result = await getDateRangeAggregate(bt, "expenses", { dateKeyExact: "2026-08-16" });
  await closeDb(bt);
  const pass = result.count === 2 && result.total === 500;
  return { pass, expected: { count: 2, total: 500 }, actual: result };
});

await t("dateKeyExact", "কোনো ম্যাচ না থাকলে count=0, total=0 (NULL SUM এর ফলব্যাক)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "expenses", [mkExpense("e1", { dateKey: "2026-08-01" })]);
  const result = await getDateRangeAggregate(bt, "expenses", { dateKeyExact: "2026-01-01" });
  await closeDb(bt);
  const pass = result.count === 0 && result.total === 0;
  return { pass, expected: { count: 0, total: 0 }, actual: result };
});

// ── ২. dateKeyGte — মাস-শুরু থেকে আজ পর্যন্ত (মাস-প্রেফিক্স ম্যাচ না) ───────────
await t("dateKeyGte", "একই মাসের সব এন্ট্রি গোনে (>= monthStartKey)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "expenses", [
    mkExpense("e1", { dateKey: "2026-08-01", amount: 100 }),
    mkExpense("e2", { dateKey: "2026-08-15", amount: 150 }),
    mkExpense("e3", { dateKey: "2026-07-31", amount: 999 }), // আগের মাস — বাদ
  ]);
  const result = await getDateRangeAggregate(bt, "expenses", { dateKeyGte: "2026-08-01" });
  await closeDb(bt);
  const pass = result.count === 2 && result.total === 250;
  return { pass, expected: { count: 2, total: 250 }, actual: result };
});

await t("dateKeyGte", "পরের মাসের এন্ট্রিও অন্তর্ভুক্ত হয় (শুধু একমাসে সীমাবদ্ধ না — dateKeyPrefix থেকে আলাদা)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "expenses", [
    mkExpense("e1", { dateKey: "2026-08-05", amount: 100 }),
    mkExpense("e2", { dateKey: "2026-09-10", amount: 200 }), // পরের মাস — এখনো >= monthStartKey
  ]);
  const result = await getDateRangeAggregate(bt, "expenses", { dateKeyGte: "2026-08-01" });
  await closeDb(bt);
  const pass = result.count === 2 && result.total === 300;
  return { pass, expected: { count: 2, total: 300 }, actual: result };
});

// ── ৩. dateKeyPrefix — LIKE 'YYYY-MM%' (একমাসে সীমাবদ্ধ) ────────────────────
await t("dateKeyPrefix", "শুধু ওই একমাসের এন্ট্রি গোনে, dateKeyGte-এর মতো পরের মাস না", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "expenses", [
    mkExpense("e1", { dateKey: "2026-08-05", amount: 100 }),
    mkExpense("e2", { dateKey: "2026-08-20", amount: 50 }),
    mkExpense("e3", { dateKey: "2026-09-01", amount: 999 }), // পরের মাস — dateKeyPrefix-এ বাদ
  ]);
  const result = await getDateRangeAggregate(bt, "expenses", { dateKeyPrefix: "2026-08" });
  await closeDb(bt);
  const pass = result.count === 2 && result.total === 150;
  return { pass, expected: { count: 2, total: 150 }, actual: result };
});

// ── ৪. amount কলাম COALESCE(0) ফলব্যাক — NULL amount এরর/ক্র্যাশ করায় না ────
await t("amount ফলব্যাক", "NULL amount থাকলেও ক্র্যাশ করে না, ০ ধরে যোগ করে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "expenses", [
    mkExpense("e1", { dateKey: "2026-08-01", amount: null }),
    mkExpense("e2", { dateKey: "2026-08-01", amount: 75 }),
  ]);
  const result = await getDateRangeAggregate(bt, "expenses", { dateKeyExact: "2026-08-01" });
  await closeDb(bt);
  const pass = result.count === 2 && result.total === 75;
  return { pass, expected: { count: 2, total: 75 }, actual: result };
});

// ── ৫. খালি store — এরর ছাড়াই ডিফল্ট রিটার্ন করে ─────────────────────────────
await t("খালি store", "কোনো এন্ট্রি না থাকলেও count=0, total=0", async () => {
  const bt = freshBusinessType();
  const result = await getDateRangeAggregate(bt, "expenses", { dateKeyGte: "2026-01-01" });
  await closeDb(bt);
  const pass = result.count === 0 && result.total === 0;
  return { pass, expected: { count: 0, total: 0 }, actual: result };
});

// ── ফলাফল ────────────────────────────────────────────────────────────────────
console.log(`\n এক্সপেন্স DataStore টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failures.length > 0) {
  console.log(`❌ ${failCount}টি ফেল, ${passCount}টি পাস\n`);
  console.log(failures.join("\n"));
  console.log("");
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
  process.exit(0);
}
