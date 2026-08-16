// ─── tests/datastore-supplier-due-tests.mjs ─────────────────────────────────
// এন্ট্রি ৪১ (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ৬, SupplierPaymentModule) —
// getSupplierDueRows() সরাসরি টেস্ট করে: products+purchaseOrders+supplierPayments
// জুড়ে ফাজি সাপ্লায়ার-নাম merge, canonical-name বাছাই, cross-table SUM। এখানে
// আসল logic.js-এর computeSupplierDueMap()+uniqueSupplierRows()-এর সাথে সরাসরি
// প্যারিটি-তুলনা করা হয়েছে (দুটো ভিন্ন ইমপ্লিমেন্টেশন একই ইনপুটে একই আউটপুট
// দিচ্ছে কিনা) — শুধু ইউনিট-লেভেল অ্যাসারশন না।
//
// রান করুন:  node tests/datastore-supplier-due-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { upsertMany, closeDb, getSupplierDueRows } = await import("../src/db/DataStore.js");
const { computeSupplierDueMap, uniqueSupplierRows } = await import("../src/logic.js");

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
  return `suppdue_${++_bt}`;
}

// ── হেল্পার: একই ইনপুট SQL (upsertMany দিয়ে) আর JS (computeSupplierDueMap সরাসরি)
// দুই পথেই চালিয়ে ফলাফল তুলনা করে — সাজানো + rawVariants বাদ দিয়ে ────────────
async function compareParity(bt, { products = [], purchaseOrders = [], supplierPayments = [] }) {
  if (products.length) await upsertMany(bt, "products", products);
  if (purchaseOrders.length) await upsertMany(bt, "purchaseOrders", purchaseOrders);
  if (supplierPayments.length) await upsertMany(bt, "supplierPayments", supplierPayments);

  const sqlRows = (await getSupplierDueRows(bt))
    .map(({ rawVariants, ...r }) => r)
    .sort((a, b) => a.name.localeCompare(b.name));

  const jsMap = computeSupplierDueMap(products, purchaseOrders, supplierPayments);
  const jsRows = uniqueSupplierRows(jsMap).sort((a, b) => a.name.localeCompare(b.name));

  await closeDb(bt);
  return { sqlRows, jsRows };
}

// ── ১. ফাজি নাম-ভ্যারিয়েন্ট merge — লম্বা নামটাই canonical ─────────────────────
await t("supplier due", "৩টা name-ভ্যারিয়েন্ট একটাতে merge হয়, canonical = সবচেয়ে লম্বা raw নাম", async () => {
  const bt = freshBusinessType();
  const { sqlRows, jsRows } = await compareParity(bt, {
    products: [{ id: "p1", name: "A", company: "Square Pharmaceuticals Ltd.", stock: 10 }],
    purchaseOrders: [{ id: "po1", supplier: "Square Pharma", items: [{ qty: 5, costPrice: 20 }] }],
    supplierPayments: [{ id: "sp1", supplierName: "Square", type: "payment", amount: 50, dateKey: "2026-08-01" }],
  });
  const pass = sqlRows.length === 1 && sqlRows[0].name === "Square Pharmaceuticals Ltd." && JSON.stringify(sqlRows) === JSON.stringify(jsRows);
  return { pass, expected: jsRows, actual: sqlRows };
});

// ── ২. একাধিক আলাদা সাপ্লায়ার — একসাথে মিশে যায় না ───────────────────────────
await t("supplier due", "ভিন্ন সাপ্লায়ার আলাদা রো-তে থাকে, একে অন্যের সাথে মিশে যায় না", async () => {
  const bt = freshBusinessType();
  const { sqlRows, jsRows } = await compareParity(bt, {
    products: [
      { id: "p1", name: "A", company: "Square", stock: 10 },
      { id: "p2", name: "B", company: "Beximco", stock: 5 },
    ],
  });
  const pass = sqlRows.length === 2 && JSON.stringify(sqlRows) === JSON.stringify(jsRows);
  return { pass, expected: jsRows, actual: sqlRows };
});

// ── ৩. due হিসাব — paid ঋণাত্মক হলে due ধনাত্মক, paid ধনাত্মক হলে due=0 ────────
await t("supplier due", "due = max(0, -paid) — payment বেশি হলে due 0, due-entry বেশি হলে due ধনাত্মক", async () => {
  const bt = freshBusinessType();
  const { sqlRows, jsRows } = await compareParity(bt, {
    products: [{ id: "p1", name: "A", company: "ABC Traders", stock: 1 }],
    supplierPayments: [
      { id: "sp1", supplierName: "ABC Traders", type: "due", amount: 1000, dateKey: "2026-08-01" },
      { id: "sp2", supplierName: "ABC Traders", type: "payment", amount: 300, dateKey: "2026-08-02" },
    ],
  });
  const pass = sqlRows.length === 1 && sqlRows[0].paid === -700 && sqlRows[0].due === 700 && JSON.stringify(sqlRows) === JSON.stringify(jsRows);
  return { pass, expected: { paid: -700, due: 700 }, actual: sqlRows[0] };
});

// ── ৪. purchase_amount — items reduce থেকে সঠিক টোটাল ────────────────────────
await t("supplier due", "totalPurchased = items-এর qty*costPrice সমষ্টি, একাধিক PO জুড়ে", async () => {
  const bt = freshBusinessType();
  const { sqlRows, jsRows } = await compareParity(bt, {
    purchaseOrders: [
      { id: "po1", supplier: "Fresh Foods Ltd", items: [{ qty: 10, costPrice: 5 }, { qty: 2, price: 15 }] }, // 50+30=80 (costPrice ফলব্যাক price)
      { id: "po2", supplier: "Fresh Foods Ltd", items: [{ qty: 3, costPrice: 10 }] }, // 30
    ],
  });
  const pass = sqlRows.length === 1 && sqlRows[0].totalPurchased === 110 && JSON.stringify(sqlRows) === JSON.stringify(jsRows);
  return { pass, expected: 110, actual: sqlRows[0]?.totalPurchased };
});

// ── ৫. খালি/অজানা সাপ্লায়ার-নাম বাদ যায় ─────────────────────────────────────
await t("supplier due", "খালি company/supplier/supplierName — সম্পূর্ণ বাদ (কোনো ভুতুড়ে সাপ্লায়ার রো তৈরি হয় না)", async () => {
  const bt = freshBusinessType();
  const { sqlRows, jsRows } = await compareParity(bt, {
    products: [
      { id: "p1", name: "A", company: "", stock: 10 },
      { id: "p2", name: "B", stock: 5 }, // company/supplier কিছুই নেই
      { id: "p3", name: "C", company: "সঠিক সাপ্লায়ার", stock: 3 },
    ],
  });
  const pass = sqlRows.length === 1 && sqlRows[0].name === "সঠিক সাপ্লায়ার" && JSON.stringify(sqlRows) === JSON.stringify(jsRows);
  return { pass, expected: jsRows, actual: sqlRows };
});

// ── ৬. raw-name backward-compat — rawVariants-এ সব ভ্যারিয়েন্ট থাকে ───────────
await t("supplier due", "rawVariants-এ সবগুলো raw নাম-ভ্যারিয়েন্ট থাকে (App.jsx-এর map-লুকআপের জন্য)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [{ id: "p1", name: "A", company: "Square Pharmaceuticals Ltd.", stock: 10 }]);
  await upsertMany(bt, "supplierPayments", [{ id: "sp1", supplierName: "Square Pharma", type: "payment", amount: 100, dateKey: "2026-08-01" }]);
  const rows = await getSupplierDueRows(bt);
  await closeDb(bt);
  const row = rows[0];
  const pass = row && row.rawVariants.includes("Square Pharmaceuticals Ltd.") && row.rawVariants.includes("Square Pharma");
  return { pass, expected: "উভয় ভ্যারিয়েন্ট rawVariants-এ", actual: row?.rawVariants };
});

// ── ৭. খালি ডেটাসেট — crash করে না ───────────────────────────────────────────
await t("supplier due", "কোনো সাপ্লায়ার-সংশ্লিষ্ট ডেটাই নেই — খালি অ্যারে রিটার্ন করে, crash না", async () => {
  const bt = freshBusinessType();
  const rows = await getSupplierDueRows(bt);
  await closeDb(bt);
  const pass = Array.isArray(rows) && rows.length === 0;
  return { pass, expected: 0, actual: rows.length };
});

// ── ৮. productCount/totalStock — একাধিক পণ্য একই সাপ্লায়ারের হলে সঠিকভাবে যোগ হয় ──
await t("supplier due", "একই সাপ্লায়ারের একাধিক পণ্য — productCount ও totalStock সঠিকভাবে অ্যাগ্রিগেট হয়", async () => {
  const bt = freshBusinessType();
  const { sqlRows, jsRows } = await compareParity(bt, {
    products: [
      { id: "p1", name: "A", company: "মেডিসিন হাউস", stock: 10 },
      { id: "p2", name: "B", company: "মেডিসিন হাউস", stock: 25 },
      { id: "p3", name: "C", company: "মেডিসিন হাউস", stock: 0 },
    ],
  });
  const pass = sqlRows.length === 1 && sqlRows[0].productCount === 3 && sqlRows[0].totalStock === 35 && JSON.stringify(sqlRows) === JSON.stringify(jsRows);
  return { pass, expected: { productCount: 3, totalStock: 35 }, actual: sqlRows[0] };
});

// ── সারাংশ ───────────────────────────────────────────────────────────────
console.log(`\ndatastore-supplier-due-tests.mjs: ${passCount} পাস, ${failCount} ফেইল\n`);
if (failures.length > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
