// ─── tests/datastore-invoiceitems-tests.mjs ─────────────────────────────────
// এন্ট্রি ৪৮ (AIPage_-এর ৪র্থ সাব-প্যাটার্ন — forecastData/productSales জয়েন) —
// upsertInvoiceItems()/getProductSalesRows() সরাসরি টেস্ট করে: write-time
// লাইন-আইটেম extraction, ৩০/৬০/৯০-দিনের বাকেট SQL অ্যাগ্রিগেট, আর সবচেয়ে
// গুরুত্বপূর্ণ — logic.js-এর computeProductSales()-এর সাথে সরাসরি প্যারিটি-
// তুলনা (SQL পাথ ও JS পাথ একই ইনপুটে একই আউটপুট দিচ্ছে কিনা)।
//
// রান করুন:  node tests/datastore-invoiceitems-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { upsertInvoiceItems, removeInvoiceItems, getProductSalesRows, closeDb } = await import("../src/db/DataStore.js");
const { computeProductSales } = await import("../src/logic.js");

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
  return `invitems_${++_bt}`;
}

const CUTOFFS = { d30: "2026-07-17", d60: "2026-06-17", d90: "2026-05-19" };

// ── হেল্পার: একই ইনভয়েস-অ্যারে SQL (upsertInvoiceItems+getProductSalesRows) আর
// JS (computeProductSales সরাসরি) দুই পথেই চালিয়ে ফলাফল তুলনা করে ──────────────
async function compareParity(bt, invoices, prodMap = new Map()) {
  for (const inv of invoices) {
    await upsertInvoiceItems(bt, inv, prodMap);
  }
  const sqlRows = (await getProductSalesRows(bt, CUTOFFS)).sort((a, b) => a.name.localeCompare(b.name));
  const jsRows = computeProductSales(invoices, prodMap, CUTOFFS).sort((a, b) => a.name.localeCompare(b.name));
  await closeDb(bt);
  return { sqlRows, jsRows };
}

// ── ১. সাধারণ কেস — SQL ও JS একদম মেলা উচিত ──────────────────────────────────
await t("invoiceItems", "সাধারণ কেস — m1/rev/cost/qty SQL ও JS-এ হুবহু মেলে", async () => {
  const bt = freshBusinessType();
  const prodMap = new Map([["p1", { costPrice: 50 }]]);
  const invoices = [
    { id: "i1", dateKey: "2026-08-10", discount: 0, items: [{ productId: "p1", name: "প্যারাসিটামল", price: 100, qty: 2, costPrice: 50 }] },
  ];
  const { sqlRows, jsRows } = await compareParity(bt, invoices, prodMap);
  const pass = sqlRows.length === 1 && JSON.stringify(sqlRows) === JSON.stringify(jsRows) && sqlRows[0].m1 === 2 && sqlRows[0].rev === 200;
  return { pass, expected: jsRows, actual: sqlRows };
});

// ── ২. ৩০/৬০/৯০ বাকেট বিভাজন — একাধিক ইনভয়েস, একই পণ্য ──────────────────────
await t("invoiceItems", "৩০-৬০-৯০ বাকেট বিভাজন SQL ও JS-এ মেলে", async () => {
  const bt = freshBusinessType();
  const invoices = [
    { id: "i1", dateKey: "2026-08-10", discount: 0, items: [{ name: "X", price: 10, qty: 1 }] }, // m1
    { id: "i2", dateKey: "2026-06-20", discount: 0, items: [{ name: "X", price: 10, qty: 2 }] }, // m2
    { id: "i3", dateKey: "2026-05-25", discount: 0, items: [{ name: "X", price: 10, qty: 4 }] }, // m3
    { id: "i4", dateKey: "2026-01-01", discount: 0, items: [{ name: "X", price: 10, qty: 8 }] }, // ৯০-দিনের বাইরে, বাদ
  ];
  const { sqlRows, jsRows } = await compareParity(bt, invoices);
  const row = sqlRows.find(r => r.name === "X");
  const pass = JSON.stringify(sqlRows) === JSON.stringify(jsRows) && row?.m1 === 1 && row?.m2 === 2 && row?.m3 === 4 && row?.qty === 7;
  return { pass, expected: jsRows, actual: sqlRows };
});

// ── ৩. একাধিক পণ্য — একে অন্যের সাথে না মিশে আলাদা রো ───────────────────────
await t("invoiceItems", "একাধিক পণ্য আলাদা রো-তে থাকে, একে অন্যের সাথে মিশে যায় না", async () => {
  const bt = freshBusinessType();
  const invoices = [
    { id: "i1", dateKey: "2026-08-01", discount: 0, items: [
      { name: "A", price: 10, qty: 3 },
      { name: "B", price: 20, qty: 1 },
    ] },
  ];
  const { sqlRows, jsRows } = await compareParity(bt, invoices);
  const pass = sqlRows.length === 2 && JSON.stringify(sqlRows) === JSON.stringify(jsRows);
  return { pass, expected: jsRows, actual: sqlRows };
});

// ── ৪. ভয়েড ইনভয়েসের status='voided' হলে productSales-এ বাদ যাওয়া উচিত ──────
await t("invoiceItems", "status='voided' হলে SQL অ্যাগ্রিগেটে বাদ যায় (App.jsx-এর invAll ফিল্টারের সাথে সামঞ্জস্যপূর্ণ)", async () => {
  const bt = freshBusinessType();
  const inv = { id: "i1", dateKey: "2026-08-10", status: "voided", discount: 0, items: [{ name: "X", price: 10, qty: 5 }] };
  await upsertInvoiceItems(bt, inv, new Map());
  const sqlRows = await getProductSalesRows(bt, CUTOFFS);
  await closeDb(bt);
  return { pass: sqlRows.length === 0, expected: 0, actual: sqlRows.length };
});

// ── ৫. self-use ইনভয়েসের কোনো রো তৈরি হওয়া উচিত না ──────────────────────────
await t("invoiceItems", "isSelfUse=true হলে কোনো লাইন-আইটেম রো তৈরি হয় না", async () => {
  const bt = freshBusinessType();
  const inv = { id: "i1", dateKey: "2026-08-10", isSelfUse: true, discount: 0, items: [{ name: "X", price: 10, qty: 5 }] };
  await upsertInvoiceItems(bt, inv, new Map());
  const sqlRows = await getProductSalesRows(bt, CUTOFFS);
  await closeDb(bt);
  return { pass: sqlRows.length === 0, expected: 0, actual: sqlRows.length };
});

// ── ৬. একই ইনভয়েস পুনরায় upsert (এডিট) — পুরনো লাইন-আইটেম রো replace হওয়া উচিত, ডুপ্লিকেট না ──
await t("invoiceItems", "ইনভয়েস এডিট (qty বদল) হলে পুরনো রো replace হয়, ডুপ্লিকেট জমে না", async () => {
  const bt = freshBusinessType();
  const v1 = { id: "i1", dateKey: "2026-08-10", discount: 0, items: [{ name: "X", price: 10, qty: 2 }] };
  await upsertInvoiceItems(bt, v1, new Map());
  const v2 = { id: "i1", dateKey: "2026-08-10", discount: 0, items: [{ name: "X", price: 10, qty: 9 }] };
  await upsertInvoiceItems(bt, v2, new Map());
  const sqlRows = await getProductSalesRows(bt, CUTOFFS);
  await closeDb(bt);
  const row = sqlRows.find(r => r.name === "X");
  const pass = sqlRows.length === 1 && row?.qty === 9; // ২+৯=১১ না — পুরনো রো মুছে গেছে
  return { pass, expected: 9, actual: row?.qty };
});

// ── ৭. আইটেম কমে যাওয়া (এডিট করে একটা লাইন বাদ দেওয়া) — বাদ-যাওয়া আইটেমের রোও মুছে যাওয়া উচিত ──
await t("invoiceItems", "ইনভয়েস এডিট করে একটা লাইন বাদ দিলে সেই পণ্যের রোও মুছে যায়", async () => {
  const bt = freshBusinessType();
  const v1 = { id: "i1", dateKey: "2026-08-10", discount: 0, items: [
    { name: "A", price: 10, qty: 1 },
    { name: "B", price: 10, qty: 1 },
  ] };
  await upsertInvoiceItems(bt, v1, new Map());
  const v2 = { id: "i1", dateKey: "2026-08-10", discount: 0, items: [{ name: "A", price: 10, qty: 1 }] }; // B বাদ
  await upsertInvoiceItems(bt, v2, new Map());
  const sqlRows = await getProductSalesRows(bt, CUTOFFS);
  await closeDb(bt);
  const pass = sqlRows.length === 1 && sqlRows[0].name === "A";
  return { pass, expected: "শুধু A", actual: sqlRows.map(r => r.name) };
});

// ── ৮. removeInvoiceItems() — ইনভয়েস ডিলিট/আর্কাইভ হলে সংশ্লিষ্ট রো মুছে যাওয়া উচিত ──
await t("invoiceItems", "removeInvoiceItems() ইনভয়েসের সব লাইন-আইটেম রো মুছে দেয়", async () => {
  const bt = freshBusinessType();
  const inv = { id: "i1", dateKey: "2026-08-10", discount: 0, items: [{ name: "X", price: 10, qty: 3 }] };
  await upsertInvoiceItems(bt, inv, new Map());
  await removeInvoiceItems(bt, "i1");
  const sqlRows = await getProductSalesRows(bt, CUTOFFS);
  await closeDb(bt);
  return { pass: sqlRows.length === 0, expected: 0, actual: sqlRows.length };
});

// ── ৯. discount/itemDiscount ধরা রেভিনিউ — calcLineDiscountedRevenue()-এর সাথে SQL মেলে ──
await t("invoiceItems", "discount-adjusted রেভিনিউ SQL ও JS-এ মেলে (একাধিক লাইন, itemDiscount সহ)", async () => {
  const bt = freshBusinessType();
  const invoices = [
    { id: "i1", dateKey: "2026-08-10", discount: 5, items: [
      { name: "A", price: 50, qty: 3, itemDiscount: 10 },
      { name: "B", price: 20, qty: 5, itemDiscount: 0 },
    ] },
  ];
  const { sqlRows, jsRows } = await compareParity(bt, invoices);
  const pass = JSON.stringify(sqlRows) === JSON.stringify(jsRows);
  return { pass, expected: jsRows, actual: sqlRows };
});

// ── ১০. _itemCostPrice fallback — item.costPrice মিসিং হলে prodMap থেকে আসা cost SQL-এ মেলে ──
await t("invoiceItems", "item.costPrice মিসিং হলে prodMap fallback cost SQL ও JS-এ মেলে", async () => {
  const bt = freshBusinessType();
  const prodMap = new Map([["p1", { costPrice: 33 }]]);
  const invoices = [
    { id: "i1", dateKey: "2026-08-10", discount: 0, items: [{ productId: "p1", name: "X", price: 100, qty: 2 }] }, // costPrice নেই
  ];
  const { sqlRows, jsRows } = await compareParity(bt, invoices, prodMap);
  const pass = JSON.stringify(sqlRows) === JSON.stringify(jsRows) && sqlRows[0].cost === 66;
  return { pass, expected: 66, actual: sqlRows[0]?.cost };
});

console.log(`\n invoiceItems (এন্ট্রি ৪৮) টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failCount > 0) {
  console.log(`❌ ${failCount}টি ব্যর্থ, ${passCount}টি পাস\n`);
  failures.forEach(f => console.log(f));
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
}
