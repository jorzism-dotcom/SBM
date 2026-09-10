// ─── tests/datastore-analytics-parity-tests.mjs ─────────────────────────────
// এন্ট্রি ১২৭ (SQLITE_MIGRATION_LOG.md Phase ৩ ধাপ ৬ — Invoices Category B) —
// AnalyticsSection_-এর topProducts/topCustomers আর Dashboard-এর auto-carry
// "সর্বশেষ কার্যক্রমের দিন" স্ক্যানের SQL সমতুল্য তিনটা হেল্পার সরাসরি টেস্ট:
//   getTopProductRevenueByDateRange()  → invoiceItems GROUP BY product_name
//   getTopCustomerTotalsByDateRange()  → invoices GROUP BY customer_id
//   getLastActivityDateKey()           → ৩টা টেবিলে MAX(date_key)
// আসল, অপরিবর্তিত প্রোডাকশন কোড ব্যবহার করা হয়েছে (কোনো লজিক কপি-পেস্ট নেই) —
// tests/helpers/vite-node-loader.mjs-এর node:sqlite শিম দিয়ে।
//
// কেন এই সুইট: App.jsx-এর সাইটগুলো এই ধাপে এখনো JS-ভিত্তিক (shadow-verify), তাই
// real-device-এparity দেখার আগে SQL হেল্পারগুলোকে হাতে-হিসাব-করা প্রত্যাশিত মান দিয়ে
// আটকে রাখা জরুরি — বিশেষত ৩টা সূক্ষ্ম জিনিস: (১) self-use ইনভয়েস invoiceItems-এ
// লেখেই না (extractInvoiceItemRows-এর initial guard), (২) status='voided' ডিফল্টে
// বাদ, includeVoided:true দিলে JS-এর বর্তমান আচরণের সাথে মেলে, (৩) খালি/NULL
// date_key যেন MAX-এ না ধরা পড়ে (SQLite-তে '' < '2026-…' সত্যি, তাই ফিল্টার বাধ্যতামূলক)।
//
// রান করুন:  node tests/datastore-analytics-parity-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const {
  upsertMany,
  upsertInvoiceItems,
  getTopProductRevenueByDateRange: getTopProductRevenue,
  getTopCustomerTotalsByDateRange: getTopCustomerTotals,
  getLastActivityDateKey,
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
  return `analytics_${++_bt}`;
}

const SINCE = "2026-08-10"; // "আজ" 2026-09-10 ধরে ৩০-দিনের জানালা (29 দিন আগে)

// ── ১. topProducts — SUM(qty)/SUM(revenue), cutoff, ORDER BY revenue DESC ─────
await t("getTopProductRevenue", "৩০-দিনের জানালার ভেতরে group+sum, বাইরেরটা বাদ", async () => {
  const bt = freshBusinessType();
  const i1 = { id: "inv1", dateKey: "2026-09-01", items: [{ name: "প্যারাসিটামল", price: 10, qty: 3 }, { name: "ভিটামিন-C", price: 60, qty: 2 }] };
  const i2 = { id: "inv2", dateKey: "2026-09-05", items: [{ name: "প্যারাসিটামল", price: 10, qty: 2 }] };
  const i3 = { id: "inv3", dateKey: "2026-08-01", items: [{ name: "প্যারাসিটামল", price: 10, qty: 999 }] }; // cutoff-এর আগে — বাদ
  await upsertMany(bt, "invoices", [i1, i2, i3]);
  for (const inv of [i1, i2, i3]) await upsertInvoiceItems(bt, inv, new Map());
  const rows = await getTopProductRevenue(bt, { sinceDateKey: SINCE, limit: 5 });
  await closeDb(bt);
  const paracetamol = rows.find((r) => r.name === "প্যারাসিটামল");
  const vitaminC = rows.find((r) => r.name === "ভিটামিন-C");
  const pass =
    rows.length === 2 &&
    paracetamol?.qty === 5 &&
    paracetamol?.revenue === 50 &&   // 999-ওয়ালা ২০২৬-০৮-০১-এর ইনভয়েস cutoff-এর বাইরে → বাদ
    vitaminC?.revenue === 120 &&
    rows[0].name === "ভিটামিন-C";     // revenue DESC: 120 > 50
  return { pass, expected: { rows: 2, paracetamol: { qty: 5, revenue: 50 }, first: "ভিটামিন-C" }, actual: rows };
});

// ── ২. voided ইনভয়েস ডিফল্টে বাদ, includeVoided:true-তে থাকে ─────────────────
await t("getTopProductRevenue", "status ফিল্টার (includeVoided flag)", async () => {
  const bt = freshBusinessType();
  const a = { id: "v1", dateKey: "2026-09-02", items: [{ name: "X", price: 100, qty: 1 }] };
  const b = { id: "v2", dateKey: "2026-09-03", status: "voided", items: [{ name: "Y", price: 10, qty: 7 }] };
  await upsertMany(bt, "invoices", [a, b]);
  await upsertInvoiceItems(bt, a, new Map());
  await upsertInvoiceItems(bt, b, new Map());
  const activeOnly = await getTopProductRevenue(bt, { sinceDateKey: SINCE, limit: 10 });
  const withVoided = await getTopProductRevenue(bt, { sinceDateKey: SINCE, limit: 10, includeVoided: true });
  await closeDb(bt);
  const pass =
    activeOnly.length === 1 && activeOnly[0].name === "X" &&
    withVoided.length === 2 && withVoided.some((r) => r.name === "Y" && r.qty === 7);
  return { pass, expected: { activeOnly: ["X"], withVoided: ["X", "Y(7)"] }, actual: { activeOnly, withVoided } };
});

// ── ৩. self-use ইনভয়েসের লাইন invoiceItems-এ লেখেই না (নথিভূত সেমান্টিক) ──────
await t("getTopProductRevenue", "self-use ইনভয়েস SQLite-তে অনুপস্থিত — shadow-নোট", async () => {
  const bt = freshBusinessType();
  const su = { id: "s1", dateKey: "2026-09-04", isSelfUse: true, items: [{ name: "ঘরে-ব্যবহৃত", price: 20, qty: 2 }] };
  await upsertMany(bt, "invoices", [su]);
  await upsertInvoiceItems(bt, su, new Map());
  const rows = await getTopProductRevenue(bt, { sinceDateKey: SINCE, limit: 5, includeVoided: true });
  await closeDb(bt);
  const pass = rows.length === 0; // JS topProducts এটাকে গোনে — এটাই shadow-চেকে যে পার্থক্য ধরা পড়বে
  return { pass, expected: [], actual: rows };
});

// ── ৪. sinceDateKey ছাড়া throw (silent "সব ডেটা" ফলাফল ঠেকানোর গার্ড) ─────────
await t("getTopProductRevenue", "sinceDateKey ছাড়া Error ছোড়ে", async () => {
  const bt = freshBusinessType();
  let threw = false;
  try {
    await getTopProductRevenue(bt, { limit: 5 });
  } catch (e) {
    threw = /sinceDateKey আবশ্যক/.test(String(e?.message || e));
  }
  await closeDb(bt);
  return { pass: threw, expected: "thrown", actual: threw };
});

// ── ৫. topCustomers — customer_id ধরে SUM(total)/COUNT(*), LIMIT ──────────────
await t("getTopCustomerTotals", "গ্রুপ+সাম+কাউন্ট, cutoff, customerId-বিহীন বাদ", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [
    { id: "a", dateKey: "2026-09-01", customerId: "c1", total: 300 },
    { id: "b", dateKey: "2026-09-02", customerId: "c1", total: 200 },
    { id: "c", dateKey: "2026-09-03", customerId: "c2", total: 400 },
    { id: "d", dateKey: "2026-08-01", customerId: "c1", total: 9999 }, // cutoff-এর আগে — বাদ
    { id: "e", dateKey: "2026-09-04", total: 50 },                     // customerId নেই — বাদ
  ]);
  const rows = await getTopCustomerTotals(bt, { sinceDateKey: SINCE, limit: 5 });
  await closeDb(bt);
  const c1 = rows.find((r) => r.customerId === "c1");
  const pass = rows.length === 2 && rows[0].customerId === "c1" && c1?.total === 500 && c1?.count === 2 && !rows.some((r) => r.customerId === null);
  return { pass, expected: [{ customerId: "c1", total: 500, count: 2 }, { customerId: "c2", total: 400, count: 1 }], actual: rows };
});

// ── ৬. voided বাদ (ডিফল্ট) / রাখা (includeVoided) ─────────────────────────────
await t("getTopCustomerTotals", "status='voided' ফিল্টার", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [
    { id: "a", dateKey: "2026-09-01", customerId: "c1", total: 100, status: "active" },
    { id: "b", dateKey: "2026-09-02", customerId: "c1", total: 50, status: "voided" },
  ]);
  const activeOnly = await getTopCustomerTotals(bt, { sinceDateKey: SINCE, limit: 5 });
  const withVoided = await getTopCustomerTotals(bt, { sinceDateKey: SINCE, limit: 5, includeVoided: true });
  await closeDb(bt);
  const pass = activeOnly[0]?.total === 100 && activeOnly[0]?.count === 1 && withVoided[0]?.total === 150 && withVoided[0]?.count === 2;
  return { pass, expected: { activeOnly: 100, withVoided: 150 }, actual: { activeOnly, withVoided } };
});

// ── ৭. lastActivityDateKey — ৩টে টেবিলের সর্বোচ্চ, আজকের/ভবিষ্যতের বাদ ─────────
await t("getLastActivityDateKey", "সর্বোচ্চ দিন, beforeDateKey-এর আগেরটা", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [{ id: "i1", dateKey: "2026-09-08", total: 10 }]);
  await upsertMany(bt, "txns", [{ id: "t1", type: "joma", amount: 5, dateKey: "2026-09-09" }]);
  await upsertMany(bt, "cashLogs", [{ id: "c1", type: "in", amount: 1, dateKey: "2026-09-05" }]);
  const k = await getLastActivityDateKey(bt, "2026-09-10");
  await closeDb(bt);
  return { pass: k === "2026-09-09", expected: "2026-09-09", actual: k };
});

// ── ৮. beforeDateKey-এর সমান বা পরের দিন যেন ধরা না পড়ে (carry-forward শর্ত) ──
await t("getLastActivityDateKey", "আজকের দিন বাদ (strictly < today)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "invoices", [{ id: "i1", dateKey: "2026-09-10", total: 10 }, { id: "i2", dateKey: "2026-09-01", total: 5 }]);
  const k = await getLastActivityDateKey(bt, "2026-09-10");
  await closeDb(bt);
  return { pass: k === "2026-09-01", expected: "2026-09-01", actual: k };
});

// ── ৯. খালি/NULL date_key যেন MAX-কে দূষিত না করে ──────────────────────────────
await t("getLastActivityDateKey", "খালি date_key উপেক্ষা", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "txns", [{ id: "t1", type: "joma", amount: 5, dateKey: "" }]);
  await upsertMany(bt, "invoices", [{ id: "i1", dateKey: "2026-08-20", total: 1 }]);
  const k = await getLastActivityDateKey(bt, "2026-09-10");
  await closeDb(bt);
  return { pass: k === "2026-08-20", expected: "2026-08-20", actual: k };
});

// ── ১০. কোনো কার্যক্রমই না থাকলে null (JS-এর length===0 রিটার্নের সমতুল্য) ──────
await t("getLastActivityDateKey", "খালি ডেটাবেস → null", async () => {
  const bt = freshBusinessType();
  const k = await getLastActivityDateKey(bt, "2026-09-10");
  await closeDb(bt);
  return { pass: k === null, expected: null, actual: k };
});

// ── ১১. beforeDateKey ছাড়া throw ──────────────────────────────────────────────
await t("getLastActivityDateKey", "beforeDateKey ছাড়া Error ছোড়ে", async () => {
  const bt = freshBusinessType();
  let threw = false;
  try {
    await getLastActivityDateKey(bt, "");
  } catch (e) {
    threw = /beforeDateKey আবশ্যক/.test(String(e?.message || e));
  }
  await closeDb(bt);
  return { pass: threw, expected: "thrown", actual: threw };
});

// ── ১২-১৪. in-app দৃশ্যতা (DiagLog) — ব্যবহারকারীর কাছে PC/adb নেই, তাই shadow
//     ওয়ার্নিংগুলো অ্যাপের ভেতরেই (সেটিংস → "⏱️ টাইমিং ডায়াগনস্টিক") জমা হতে হবে।
//     { quiet: true } মানে কনসোলে ছাপা হবে না (লাইনটা ইতিমধ্যে console.warn-এ গেছে),
//     কিন্তু রিং-বাফারে থাকবে — এই দুটো আচরণই এখানে আটকানো হলো।
const { logDiag, getDiagLog, clearDiagLog } = await import("../src/db/DiagLog.js");

await t("DiagLog", "logDiag() → প্যানেলে লাইন জমা হয় (সময়-স্ট্যাম্পসহ)", () => {
  clearDiagLog();
  logDiag("⚠️ [টেস্ট] parity লাইন ১");
  const lines = getDiagLog();
  const ok = lines.length === 1 && lines[0].includes("⚠️ [টেস্ট] parity লাইন ১") && /^\[\d{2}:\d{2}:\d{2}\] /.test(lines[0]);
  return { pass: ok, expected: "1টা স্ট্যাম্প-সহ লাইন", actual: lines[0] };
});

await t("DiagLog", "{ quiet: true } → রিং-বাফারে জমা, কিন্তু console.log-এ ছাপে না", () => {
  clearDiagLog();
  const orig = console.log;
  let printed = 0;
  console.log = (...args) => { if (String(args[0] || "").includes("quiet টেস্ট")) printed++; };
  try {
    logDiag("⚠️ [টেস্ট] quiet লাইন", { quiet: true });
    logDiag("⚠️ [টেস্ট] quiet টেস্ট লাইন");
  } finally {
    console.log = orig;
  }
  const lines = getDiagLog();
  // দুটোই বাফারে আছে, কিন্তু শুধু দ্বিতীয়টা console.log-এ গেছে (printed===1)
  return { pass: lines.length === 2 && printed === 1, expected: "বাফার=২, console=১", actual: `বাফার=${lines.length}, console=${printed}` };
});

await t("DiagLog", "রিং-বাফার ক্যাপ ৪০০ — পুরনো লাইন বাদ যায়, নতুন সবার উপরে", () => {
  clearDiagLog();
  for (let i = 0; i < 450; i++) logDiag(`টেস্ট লাইন ${i}`, { quiet: true });
  const lines = getDiagLog();
  const ok = lines.length === 400 && lines[0].includes("টেস্ট লাইন 449") && lines[399].includes("টেস্ট লাইন 50");
  clearDiagLog();
  return { pass: ok, expected: "400 (সর্বশেষ ৪৪৯ → ৫০)", actual: `${lines.length} টা; প্রথমে=${lines[0] || "—"}${lines[0] ? "" : ""}` };
});

console.log(`\ndatastore-analytics-parity-tests.mjs (এন্ট্রি ১২৭): ${passCount} পাস, ${failCount} ফেইল\n`);
if (failCount) {
  console.log(failures.join("\n"));
  process.exit(1);
}
