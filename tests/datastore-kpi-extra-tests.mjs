// ─── tests/datastore-kpi-extra-tests.mjs ───────────────────────────────────
// DataStore.js-এর useKpiStats-সম্পর্কিত বাকি ডেটা-সোর্সগুলো (এন্ট্রি ৩৮-৩৯)
// সরাসরি টেস্ট করে — আসল, অপরিবর্তিত প্রোডাকশন কোড ব্যবহার করে (কোনো লজিক
// এখানে কপি-পেস্ট করা হয়নি)। @capacitor-community/sqlite প্লাগইন native
// bridge-নির্ভর বলে plain Node-এ চলে না — tests/helpers/vite-node-loader.mjs
// একটা node:sqlite-ব্যাকড শিম দিয়ে সেটা রিপ্লেস করে, যাতে ঠিক এই ফাইলটাই
// আসল App-এ যেভাবে চলবে সেভাবে টেস্ট করা যায়।
//
// কেন এই টেস্ট জরুরি: এই ৫টা ফাংশন (cashLogs, purchaseOrders, txns, returns,
// stockMovements) প্রতিটাতেই একটা অতিরিক্ত type/source শর্ত বা voided-ইনভয়েস
// বাদ দেওয়ার NOT EXISTS সাব-কোয়েরি আছে — জেনেরিক getDateRangeAggregate()
// ইচ্ছাকৃতভাবে এখানে পুনর্ব্যবহার করা হয়নি ঠিক এই কারণেই (DataStore.js-এর
// এন্ট্রি ৩৮ কমেন্ট দ্রষ্টব্য)। এই সুইট সেই ডোমেইন-স্পেসিফিক ফিল্টার লজিকগুলো
// (বিশেষ করে voided-ইনভয়েস বাদ, txns-এর source-ব্ল্যাকলিস্ট) রিগ্রেশন থেকে
// সুরক্ষা দেয়।
//
// রান করুন:  node tests/datastore-kpi-extra-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const {
  getCashLogTotal,
  getPurchaseOrderTotals,
  getTxnTotals,
  getReturnsTotals,
  getExpiredRemovalTotals,
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

let _bt = 0;
function freshBusinessType() {
  return `kpitest_${++_bt}`;
}

// ── ১. getCashLogTotal — নির্দিষ্ট date_key + type-এর SUM ────────────────────
await t("getCashLogTotal", "শুধু ম্যাচিং date_key + type যোগ হয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "cashLogs", [
    { id: "c1", type: "in", amount: 500, dateKey: "2026-08-16", createdAt: 1000 },
    { id: "c2", type: "in", amount: 300, dateKey: "2026-08-16", createdAt: 1000 },
    { id: "c3", type: "out", amount: 200, dateKey: "2026-08-16", createdAt: 1000 }, // ভিন্ন type — বাদ
    { id: "c4", type: "in", amount: 999, dateKey: "2026-08-15", createdAt: 1000 }, // ভিন্ন তারিখ — বাদ
  ]);
  const total = await getCashLogTotal(bt, { dateKey: "2026-08-16", type: "in" });
  await closeDb(bt);
  const pass = total === 800;
  return { pass, expected: 800, actual: total };
});

await t("getCashLogTotal", "কোনো ম্যাচ না থাকলে ০ রিটার্ন করে (NULL SUM ফলব্যাক)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "cashLogs", [{ id: "c1", type: "in", amount: 100, dateKey: "2026-08-16", createdAt: 1000 }]);
  const total = await getCashLogTotal(bt, { dateKey: "2026-08-17", type: "in" });
  await closeDb(bt);
  const pass = total === 0;
  return { pass, expected: 0, actual: total };
});

// ── ২. getPurchaseOrderTotals — 'pe' এন্ট্রি, আজ + মাসের ────────────────────
await t("getPurchaseOrderTotals", "todayCost/todayCount শুধু আজকের 'pe' এন্ট্রি গোনে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "purchaseOrders", [
    { id: "po1", _type: "pe", totalCost: 1000, dateKey: "2026-08-16", at: 1000 },
    { id: "po2", _type: "pe", totalCost: 500, dateKey: "2026-08-16", at: 1000 },
    { id: "po3", _type: "po", totalCost: 9999, dateKey: "2026-08-16", at: 1000 }, // 'pe' না — বাদ
    { id: "po4", _type: "pe", totalCost: 2000, dateKey: "2026-08-10", at: 1000 }, // আগের তারিখ, মাসেই আছে
  ]);
  const totals = await getPurchaseOrderTotals(bt, { todayKey: "2026-08-16", monthStartKey: "2026-08-01" });
  await closeDb(bt);
  const pass = totals.todayCost === 1500 && totals.todayCount === 2 && totals.monthCost === 3500;
  return { pass, expected: { todayCost: 1500, todayCount: 2, monthCost: 3500 }, actual: totals };
});

await t("getPurchaseOrderTotals", "monthCost dateKeyGte monthStartKey (>=), শুধু প্রেফিক্স-ম্যাচ না", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "purchaseOrders", [
    { id: "po1", _type: "pe", totalCost: 100, dateKey: "2026-07-31", at: 1000 }, // আগের মাস — বাদ
    { id: "po2", _type: "pe", totalCost: 200, dateKey: "2026-08-01", at: 1000 },
  ]);
  const totals = await getPurchaseOrderTotals(bt, { todayKey: "2026-08-16", monthStartKey: "2026-08-01" });
  await closeDb(bt);
  const pass = totals.monthCost === 200;
  return { pass, expected: 200, actual: totals.monthCost };
});

// ── ৩. getTxnTotals — todayBakiIncurred (voided বাদ) + todayJoma (source ব্ল্যাকলিস্ট) ──
await t("getTxnTotals", "todayBakiIncurred voided ইনভয়েসের সাথে যুক্ত txn বাদ দেয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [
    { id: "inv1", invoiceNo: "INV-1", createdAt: 1000, total: 100, status: "active" },
    { id: "inv2", invoiceNo: "INV-2", createdAt: 1000, total: 100, status: "voided" },
  ]);
  await upsertMany(bt, "txns", [
    { id: "t1", type: "baki", amount: 500, invoiceId: "inv1", dateKey: "2026-08-16", time: 1000 },
    { id: "t2", type: "baki", amount: 300, invoiceId: "inv2", dateKey: "2026-08-16", time: 1000 }, // voided ইনভয়েস — বাদ
    { id: "t3", type: "baki", amount: 200, invoiceId: null, dateKey: "2026-08-16", time: 1000 }, // invoiceId নেই — বাদ (শর্ত: invoiceId থাকতে হবে)
  ]);
  const totals = await getTxnTotals(bt, "2026-08-16");
  await closeDb(bt);
  const pass = totals.todayBakiIncurred === 500;
  return { pass, expected: 500, actual: totals.todayBakiIncurred };
});

await t("getTxnTotals", "todayJoma ব্ল্যাকলিস্টেড source বাদ দেয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "txns", [
    { id: "t1", type: "joma", amount: 400, source: null, dateKey: "2026-08-16", time: 1000 },
    { id: "t2", type: "joma", amount: 100, source: "manual", dateKey: "2026-08-16", time: 1000 },
    { id: "t3", type: "joma", amount: 999, source: "cash-sale", dateKey: "2026-08-16", time: 1000 }, // ব্ল্যাকলিস্টেড — বাদ
    { id: "t4", type: "joma", amount: 999, source: "void-reversal", dateKey: "2026-08-16", time: 1000 }, // ব্ল্যাকলিস্টেড — বাদ
  ]);
  const totals = await getTxnTotals(bt, "2026-08-16");
  await closeDb(bt);
  const pass = totals.todayJoma === 500;
  return { pass, expected: 500, actual: totals.todayJoma };
});

// ── ৪. getReturnsTotals — today/month refund + profit-impact + cash-refund, voided বাদ ──
await t("getReturnsTotals", "todayRefund/todayProfitImpact/todayCashRefund সঠিকভাবে গণনা হয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "returns", [
    { id: "r1", invoiceId: null, refundAmount: 200, costPrice: 50, qty: 2, refundMode: "cash", dateKey: "2026-08-16", createdAt: 1000 },
    { id: "r2", invoiceId: null, refundAmount: 100, costPrice: 20, qty: 1, refundMode: "due", dateKey: "2026-08-16", createdAt: 1000 },
  ]);
  const totals = await getReturnsTotals(bt, { todayKey: "2026-08-16", monthStartKey: "2026-08-01" });
  await closeDb(bt);
  // profitImpact = SUM(refundAmount - costPrice*qty) = (200-100) + (100-20) = 100+80 = 180
  // cashRefund = শুধু refundMode='cash' → 200
  const pass = totals.todayRefund === 300 && totals.todayProfitImpact === 180 && totals.todayCashRefund === 200;
  return {
    pass,
    expected: { todayRefund: 300, todayProfitImpact: 180, todayCashRefund: 200 },
    actual: totals,
  };
});

await t("getReturnsTotals", "voided ইনভয়েসের সাথে যুক্ত রিটার্ন বাদ যায়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [
    { id: "inv1", invoiceNo: "INV-1", createdAt: 1000, total: 100, status: "voided" },
  ]);
  await upsertMany(bt, "returns", [
    { id: "r1", invoiceId: "inv1", refundAmount: 500, costPrice: 0, qty: 0, refundMode: "cash", dateKey: "2026-08-16", createdAt: 1000 }, // voided-এর সাথে যুক্ত — বাদ
    { id: "r2", invoiceId: null, refundAmount: 100, costPrice: 0, qty: 0, refundMode: "cash", dateKey: "2026-08-16", createdAt: 1000 },
  ]);
  const totals = await getReturnsTotals(bt, { todayKey: "2026-08-16", monthStartKey: "2026-08-01" });
  await closeDb(bt);
  const pass = totals.todayRefund === 100;
  return { pass, expected: 100, actual: totals.todayRefund };
});

await t("getReturnsTotals", "monthRefund/monthProfitImpact monthStartKey থেকে আজ পর্যন্ত সব যোগ করে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "returns", [
    { id: "r1", invoiceId: null, refundAmount: 100, costPrice: 10, qty: 1, refundMode: "cash", dateKey: "2026-08-01", createdAt: 1000 },
    { id: "r2", invoiceId: null, refundAmount: 50, costPrice: 5, qty: 1, refundMode: "cash", dateKey: "2026-08-16", createdAt: 1000 },
    { id: "r3", invoiceId: null, refundAmount: 999, costPrice: 0, qty: 0, refundMode: "cash", dateKey: "2026-07-31", createdAt: 1000 }, // আগের মাস — বাদ
  ]);
  const totals = await getReturnsTotals(bt, { todayKey: "2026-08-16", monthStartKey: "2026-08-01" });
  await closeDb(bt);
  const pass = totals.monthRefund === 150 && totals.monthProfitImpact === 135;
  return { pass, expected: { monthRefund: 150, monthProfitImpact: 135 }, actual: totals };
});

// ── ৫. getExpiredRemovalTotals — stockMovements, source='expired_removal' ────
await t("getExpiredRemovalTotals", "শুধু নির্দিষ্ট month_key + source='expired_removal' গোনে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "stockMovements", [
    { id: "m1", source: "expired_removal", monthKey: "2026-08", value: 300, at: 1000 },
    { id: "m2", source: "expired_removal", monthKey: "2026-08", value: 150, at: 1000 },
    { id: "m3", source: "manual_adjust", monthKey: "2026-08", value: 999, at: 1000 }, // ভিন্ন source — বাদ
    { id: "m4", source: "expired_removal", monthKey: "2026-07", value: 999, at: 1000 }, // ভিন্ন মাস — বাদ
  ]);
  const totals = await getExpiredRemovalTotals(bt, "2026-08");
  await closeDb(bt);
  const pass = totals.value === 450 && totals.count === 2;
  return { pass, expected: { value: 450, count: 2 }, actual: totals };
});

await t("getExpiredRemovalTotals", "কোনো ম্যাচ না থাকলে value=0, count=0", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "stockMovements", [{ id: "m1", source: "expired_removal", monthKey: "2026-01", value: 100, at: 1000 }]);
  const totals = await getExpiredRemovalTotals(bt, "2026-08");
  await closeDb(bt);
  const pass = totals.value === 0 && totals.count === 0;
  return { pass, expected: { value: 0, count: 0 }, actual: totals };
});

// ── ফলাফল ────────────────────────────────────────────────────────────────────
console.log(`\n KPI-এক্সট্রা DataStore টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failures.length > 0) {
  console.log(`❌ ${failCount}টি ফেল, ${passCount}টি পাস\n`);
  console.log(failures.join("\n"));
  console.log("");
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
  process.exit(0);
}
