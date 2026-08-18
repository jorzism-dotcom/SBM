// ─── tests/datastore-reorder-alerts-tests.mjs ───────────────────────────────
// এন্ট্রি ৬২ (Phase ৩ শেষ বাকি আইটেম — reorderAlerts sales-velocity SQL cutover)
// worker.js-এর PREDICT_REORDER-এর SQL-অংশ getReorderSalesRows() টেস্ট করে
// (৩০-দিনের রোলিং SUM(qty), product_name-কী)। products-এর সাথে জয়েন+
// avgDaily/daysLeft/status কম্পিউটেশন App.jsx-এর computeReorderAlertsFromSalesRows()-এ
// (browser-only App.jsx-এর ভেতরে, Node-এ import করা যায় না — datastore-
// distinct-lookups-tests.mjs-এর একই সীমাবদ্ধতা/কনভেনশন) — তাই এখানে শুধু
// DataStore-এর SQL অংশ হাতে-হিসাব-করা প্রত্যাশিত মান দিয়ে সরাসরি যাচাই।
//
// রান করুন:  node tests/datastore-reorder-alerts-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { upsertInvoiceItems, getReorderSalesRows, closeDb } = await import("../src/db/DataStore.js");

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
  return `reorder_${++_bt}`;
}

const D30 = "2026-07-18"; // "আজ" 2026-08-17 ধরে ৩০ দিন আগে

// ── ১. সাধারণ কেস — cutoff-এর পরের বিক্রি যোগ হয়, আগেরটা বাদ ────────────────
await t("getReorderSalesRows", "cutoff-এর পরের বিক্রিই শুধু যোগ হয়", async () => {
  const bt = freshBusinessType();
  await upsertInvoiceItems(bt, { id: "i1", dateKey: "2026-08-10", discount: 0, items: [{ name: "প্যারাসিটামল", price: 10, qty: 5 }] }, new Map());
  await upsertInvoiceItems(bt, { id: "i2", dateKey: "2026-06-01", discount: 0, items: [{ name: "প্যারাসিটামল", price: 10, qty: 100 }] }, new Map()); // cutoff-এর আগে, বাদ
  const rows = await getReorderSalesRows(bt, D30);
  await closeDb(bt);
  const row = rows.find(r => r.name === "প্যারাসিটামল");
  const pass = rows.length === 1 && row?.sold30 === 5;
  return { pass, expected: { sold30: 5 }, actual: row };
});

// ── ২. একাধিক ইনভয়েসে একই পণ্য — SUM ঠিকভাবে যোগ হয় ─────────────────────────
await t("getReorderSalesRows", "একাধিক ইনভয়েসে একই পণ্যের SUM", async () => {
  const bt = freshBusinessType();
  await upsertInvoiceItems(bt, { id: "i1", dateKey: "2026-08-01", discount: 0, items: [{ name: "X", price: 10, qty: 3 }] }, new Map());
  await upsertInvoiceItems(bt, { id: "i2", dateKey: "2026-08-05", discount: 0, items: [{ name: "X", price: 10, qty: 4 }] }, new Map());
  await upsertInvoiceItems(bt, { id: "i3", dateKey: "2026-08-10", discount: 0, items: [{ name: "Y", price: 10, qty: 2 }] }, new Map());
  const rows = await getReorderSalesRows(bt, D30);
  await closeDb(bt);
  const x = rows.find(r => r.name === "X");
  const y = rows.find(r => r.name === "Y");
  const pass = rows.length === 2 && x?.sold30 === 7 && y?.sold30 === 2;
  return { pass, expected: { x: 7, y: 2 }, actual: { x: x?.sold30, y: y?.sold30 } };
});

// ── ৩. status='active' ছাড়া (voided/returned) বাদ পড়ে ──────────────────────
await t("getReorderSalesRows", "voided ইনভয়েস-আইটেম বাদ পড়ে (HAVING SUM>0)", async () => {
  const bt = freshBusinessType();
  await upsertInvoiceItems(bt, { id: "i1", dateKey: "2026-08-10", discount: 0, items: [{ name: "Z", price: 10, qty: 5 }] }, new Map());
  await upsertInvoiceItems(bt, { id: "i1", dateKey: "2026-08-10", discount: 0, status: "voided", items: [{ name: "Z", price: 10, qty: 5 }] }, new Map());
  const rows = await getReorderSalesRows(bt, D30);
  await closeDb(bt);
  const row = rows.find(r => r.name === "Z");
  // voided upsert একই invoice_id-এর জন্য replace করে (DELETE+INSERT প্যাটার্ন,
  // upsertInvoiceItems()-এর কমেন্ট দ্রষ্টব্য) — শেষ status-ই টেকে
  const pass = !row; // voided হলে status='active' ফিল্টারে বাদ পড়ে যাওয়ার কথা
  return { pass, expected: "কোনো active রো না", actual: row };
});

// ── ৪. sold30===0 (কোনো বিক্রি নেই) হলে রেজাল্টে আসে না ─────────────────────
await t("getReorderSalesRows", "কোনো বিক্রি না থাকলে খালি রেজাল্ট", async () => {
  const bt = freshBusinessType();
  const rows = await getReorderSalesRows(bt, D30);
  await closeDb(bt);
  return { pass: rows.length === 0, expected: [], actual: rows };
});

// ── সারাংশ ───────────────────────────────────────────────────────────────
console.log(`\n reorderAlerts SQL (এন্ট্রি ৬২) টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failCount === 0) {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
  process.exit(0);
} else {
  console.log(`❌ ${failCount}টি ফেইল হয়েছে:\n`);
  failures.forEach(f => console.log(f));
  console.log();
  process.exit(1);
}
