// ─── tests/datastore-customer-rfm-tests.mjs ────────────────────────────────
// এন্ট্রি ৫৭ (Phase 3, Customers RFM/LTV SQL cutover) — App.jsx-এর Customers
// কম্পোনেন্টের rfmData useMemo-র SQL সমতুল্য getCustomerRfmAggregates()।
//
// এই ফাংশনটা ৩টা আলাদা কোয়েরি করে (ইচ্ছাকৃতভাবে একটা JOIN-এ না — invoices ×
// txns cross-product হয়ে SUM ভুল হওয়ার ঝুঁকি এড়াতে, DataStore.js-এর কমেন্ট
// দ্রষ্টব্য):
//   ১. invoices GROUP BY customer_id  → ltv/frequency/lastDateKey
//   ২. txns (type='joma', date_key>=d30) GROUP BY customer_id → recentPaid
//   ৩. invoices গ্লোবাল টোটাল → totalSales/monthSale (সেগমেন্ট-থ্রেশহোল্ডে ব্যবহৃত)
//
// txns.customer_id কলাম এই এন্ট্রিতেই নতুন যোগ হয়েছে (আগে ছিল না — কারণ
// schema.sql-এর txns টেবিল কমেন্টে বিস্তারিত: invoice_id-নির্ভর JOIN দিয়ে
// কাস্টমার-ডিটেইল পেজের সরাসরি "বাকি আদায়" টাইপ txn (invoiceId=null) ধরা
// পড়ত না)।
//
// রান করুন:  node tests/datastore-customer-rfm-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { upsertMany, closeDb, getCustomerRfmAggregates } = await import("../src/db/DataStore.js");

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
  return `custrfm_${++_bt}`;
}

function byId(rows) {
  const m = new Map();
  rows.forEach(r => m.set(String(r.id), r));
  return m;
}

// ── ltv/frequency/lastDateKey (invoices GROUP BY) ───────────────────────────
await t("getCustomerRfmAggregates", "একই কাস্টমারের একাধিক ইনভয়েস — SUM/COUNT/MAX ঠিকভাবে GROUP হয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [
    { id: "i1", customerId: "c1", total: 500, dateKey: "2026-08-01", status: "active" },
    { id: "i2", customerId: "c1", total: 300, dateKey: "2026-08-10", status: "active" },
    { id: "i3", customerId: "c2", total: 1000, dateKey: "2026-08-05", status: "active" },
  ]);
  const agg = await getCustomerRfmAggregates(bt, { d30: "2026-07-18" });
  await closeDb(bt);
  const m = byId(agg.byCustomer);
  const c1 = m.get("c1"), c2 = m.get("c2");
  const pass = c1?.ltv === 800 && c1?.frequency === 2 && c1?.lastDateKey === "2026-08-10"
    && c2?.ltv === 1000 && c2?.frequency === 1;
  return { pass, expected: "c1:ltv800/freq2/last08-10, c2:ltv1000/freq1", actual: { c1, c2 } };
});

await t("getCustomerRfmAggregates", "voided (status!=active) ইনভয়েস LTV-তে ধরা পড়ে না", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [
    { id: "i1", customerId: "c1", total: 500, dateKey: "2026-08-01", status: "active" },
    { id: "i2", customerId: "c1", total: 9999, dateKey: "2026-08-02", status: "voided" },
  ]);
  const agg = await getCustomerRfmAggregates(bt, { d30: "2026-07-18" });
  await closeDb(bt);
  const c1 = byId(agg.byCustomer).get("c1");
  const pass = c1?.ltv === 500 && c1?.frequency === 1;
  return { pass, expected: "ltv500/freq1 (voided বাদ)", actual: c1 };
});

await t("getCustomerRfmAggregates", "customerId null ইনভয়েস (walk-in) GROUP-এ আসে না", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [
    { id: "i1", customerId: null, total: 999, dateKey: "2026-08-01", status: "active" }, // walk-in
    { id: "i2", customerId: "c1", total: 100, dateKey: "2026-08-01", status: "active" },
  ]);
  const agg = await getCustomerRfmAggregates(bt, { d30: "2026-07-18" });
  await closeDb(bt);
  const pass = agg.byCustomer.length === 1 && agg.byCustomer[0].id === "c1";
  return { pass, expected: "শুধু c1", actual: agg.byCustomer };
});

// ── recentPaid (txns GROUP BY, customer_id কলাম) ────────────────────────────
await t("getCustomerRfmAggregates", "recentPaid — শুধু joma টাইপ + d30 উইন্ডোর ভেতরের টাকা যোগ হয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "txns", [
    { id: "t1", customerId: "c1", type: "joma", amount: 200, dateKey: "2026-08-10" }, // উইন্ডোর ভেতরে
    { id: "t2", customerId: "c1", type: "joma", amount: 300, dateKey: "2026-08-15" }, // উইন্ডোর ভেতরে
    { id: "t3", customerId: "c1", type: "baki", amount: 999, dateKey: "2026-08-15" }, // baki, বাদ
    { id: "t4", customerId: "c1", type: "joma", amount: 999, dateKey: "2026-06-01" }, // d30-এর বাইরে, বাদ
  ]);
  const agg = await getCustomerRfmAggregates(bt, { d30: "2026-07-18" });
  await closeDb(bt);
  const c1 = byId(agg.recentPaidByCustomer).get("c1");
  const pass = c1?.recentPaid === 500;
  return { pass, expected: 500, actual: c1?.recentPaid };
});

await t("getCustomerRfmAggregates", "invoiceId=null-এর সরাসরি \"বাকি আদায়\" txn-ও recentPaid-এ ধরা পড়ে (মূল ব্লকার — customer_id কলাম না থাকলে এটা বাদ পড়ে যেত)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "txns", [
    { id: "t1", customerId: "c1", invoiceId: null, type: "joma", amount: 750, dateKey: "2026-08-10", source: "collection" },
  ]);
  const agg = await getCustomerRfmAggregates(bt, { d30: "2026-07-18" });
  await closeDb(bt);
  const c1 = byId(agg.recentPaidByCustomer).get("c1");
  const pass = c1?.recentPaid === 750;
  return { pass, expected: 750, actual: c1?.recentPaid };
});

// ── totals (গ্লোবাল, সেগমেন্ট-থ্রেশহোল্ডে ব্যবহৃত) ──────────────────────────
await t("getCustomerRfmAggregates", "totals.totalSales/monthSale — সব active ইনভয়েসের যোগফল, d30 উইন্ডো আলাদা", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [
    { id: "i1", customerId: "c1", total: 100, dateKey: "2026-06-01", status: "active" }, // d30-এর বাইরে
    { id: "i2", customerId: "c1", total: 200, dateKey: "2026-08-01", status: "active" }, // উইন্ডোর ভেতরে
    { id: "i3", customerId: "c1", total: 500, dateKey: "2026-08-01", status: "voided" }, // voided, দুটোতেই বাদ
  ]);
  const agg = await getCustomerRfmAggregates(bt, { d30: "2026-07-18" });
  await closeDb(bt);
  const pass = agg.totals.totalSales === 300 && agg.totals.monthSale === 200;
  return { pass, expected: { totalSales: 300, monthSale: 200 }, actual: agg.totals };
});

// ── খালি ডেটা ────────────────────────────────────────────────────────────────
await t("getCustomerRfmAggregates", "কোনো ইনভয়েস/txn না থাকলে খালি অ্যারে + শূন্য totals (crash না)", async () => {
  const bt = freshBusinessType();
  const agg = await getCustomerRfmAggregates(bt, { d30: "2026-07-18" });
  await closeDb(bt);
  const pass = agg.byCustomer.length === 0 && agg.recentPaidByCustomer.length === 0
    && agg.totals.totalSales === 0 && agg.totals.monthSale === 0;
  return { pass, expected: "সব খালি/শূন্য", actual: agg };
});

console.log(`\n Customer RFM/LTV SQL (এন্ট্রি ৫৭) টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failCount > 0) {
  console.log(`❌ ${failCount}টি ব্যর্থ, ${passCount}টি পাস\n`);
  failures.forEach(f => console.log(f));
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
}
