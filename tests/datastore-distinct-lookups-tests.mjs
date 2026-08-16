// ─── tests/datastore-distinct-lookups-tests.mjs ────────────────────────────
// এন্ট্রি ৪৪-এ (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ৭.৩-এর ব্লকার, ক্যাটাগরি ③
// FULL-SCAN) লেখা ৪টা DataStore ফাংশন — কিন্তু ওই এন্ট্রির জন্য কোনো টেস্ট ফাইল
// তখন লেখা হয়নি (এন্ট্রি ৩৮-এর "হারানো ফাইল" গ্যাপের মতোই একটা টেস্ট-কভারেজ গ্যাপ,
// এন্ট্রি ৪৯-এ ধরা পড়ে এখানে যোগ করা হলো)। এখানে ৪টা:
//   getDistinctCategories() — SmartInvoiceBuilder ক্যাটাগরি-চিপ লিস্ট
//   getDistinctSuppliers()  — getKnownSuppliers()-এর SQL সমতুল্য
//   getDistinctDosageForms()— getKnownCustomDosageForms()-এর SQL সমতুল্য
//   findProductByNameNorm() — liveDupProduct-এর SQL সমতুল্য (ডুপ্লিকেট-নাম চেক)
//
// App.jsx-এর getKnownSuppliers()/getKnownCustomDosageForms() plain-JS ফাংশন
// (browser-only App.jsx-এর ভেতরে, Node-এ import করা যায় না) — তাই এখানে সরাসরি
// প্যারিটি-তুলনা সম্ভব না (supplier-due/invoiceitems টেস্টের মতো), বরং হাতে-
// হিসাব-করা প্রত্যাশিত মান দিয়ে DataStore ফাংশনগুলো সরাসরি যাচাই করা হয়েছে —
// datastore-inventory-tests.mjs/datastore-pos-browse-tests.mjs-এর একই কনভেনশন।
//
// রান করুন:  node tests/datastore-distinct-lookups-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { upsertMany, closeDb, getDistinctCategories, getDistinctSuppliers, getDistinctDosageForms, findProductByNameNorm } = await import("../src/db/DataStore.js");

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
  return `distlkp_${++_bt}`;
}

// ── getDistinctCategories() ─────────────────────────────────────────────────
await t("getDistinctCategories", "distinct, sorted, service/deleted/খালি বাদ", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    { id: "p1", name: "A", category: "ট্যাবলেট" },
    { id: "p2", name: "B", category: "সিরাপ" },
    { id: "p3", name: "C", category: "ট্যাবলেট" }, // ডুপ্লিকেট ক্যাটাগরি
    { id: "p4", name: "D", category: "সেবা", productType: "service" }, // service বাদ
    { id: "p5", name: "E", category: "মুছে-ফেলা", deleted: true }, // deleted বাদ
    { id: "p6", name: "F", category: "" }, // খালি বাদ
  ]);
  const cats = await getDistinctCategories(bt);
  await closeDb(bt);
  const pass = JSON.stringify(cats) === JSON.stringify(["ট্যাবলেট", "সিরাপ"]);
  return { pass, expected: ["ট্যাবলেট", "সিরাপ"], actual: cats };
});
await t("getDistinctCategories", "কোনো প্রোডাক্ট না থাকলে খালি অ্যারে", async () => {
  const bt = freshBusinessType();
  const cats = await getDistinctCategories(bt);
  await closeDb(bt);
  return { pass: Array.isArray(cats) && cats.length === 0, expected: [], actual: cats };
});

// ── getDistinctSuppliers() ──────────────────────────────────────────────────
// products.supplier_due_raw = (company||supplier).trim(), purchaseOrders.supplier_due_raw = (supplier||company).trim()
await t("getDistinctSuppliers", "products.company + purchaseOrders.supplier দুই সোর্স থেকেই আসে, UNION-এ ডুপ্লিকেট বাদ", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    { id: "p1", name: "A", company: "Square Pharma" },
    { id: "p2", name: "B", supplier: "Beximco" }, // company নেই, supplier ফলব্যাক
    { id: "p3", name: "C", company: "Square Pharma" }, // ডুপ্লিকেট
  ]);
  await upsertMany(bt, "purchaseOrders", [
    { id: "po1", supplier: "Incepta" },
    { id: "po2", supplier: "Square Pharma" }, // products-এও আছে, UNION dedup করবে
  ]);
  const rows = (await getDistinctSuppliers(bt)).sort();
  await closeDb(bt);
  const expected = ["Beximco", "Incepta", "Square Pharma"];
  const pass = JSON.stringify(rows) === JSON.stringify(expected);
  return { pass, expected, actual: rows };
});
await t("getDistinctSuppliers", "কোনো সাপ্লায়ার নাম না থাকলে খালি অ্যারে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [{ id: "p1", name: "A" }]);
  const rows = await getDistinctSuppliers(bt);
  await closeDb(bt);
  return { pass: rows.length === 0, expected: 0, actual: rows.length };
});

// ── getDistinctDosageForms() ────────────────────────────────────────────────
await t("getDistinctDosageForms", "distinct, sorted, deleted/খালি বাদ (DOSAGE_FORM_CHIPS ফিল্টার App.jsx-এই হয়, এখানে না)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    { id: "p1", name: "A", dosageForm: "সাসপেনশন" },
    { id: "p2", name: "B", dosageForm: "ইনজেকশন" },
    { id: "p3", name: "C", dosageForm: "সাসপেনশন" }, // ডুপ্লিকেট
    { id: "p4", name: "D", dosageForm: "মুছে-ফেলা", deleted: true }, // deleted বাদ
    { id: "p5", name: "E", dosageForm: "" }, // খালি বাদ
  ]);
  const forms = await getDistinctDosageForms(bt);
  await closeDb(bt);
  const pass = JSON.stringify(forms) === JSON.stringify(["ইনজেকশন", "সাসপেনশন"]);
  return { pass, expected: ["ইনজেকশন", "সাসপেনশন"], actual: forms };
});

// ── findProductByNameNorm() ─────────────────────────────────────────────────
await t("findProductByNameNorm", "নাম-নরমালাইজড এক্সাক্ট ম্যাচ পাওয়া যায় (case/space-insensitive, normName()-এর সেমান্টিক্স)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [{ id: "p1", name: "Napa Extra" }]);
  const found = await findProductByNameNorm(bt, "napa extra"); // normName() lowercase+trim+collapse-space করে (স্পেস বাদ দেয় না)
  await closeDb(bt);
  const pass = found && found.id === "p1" && found.name === "Napa Extra";
  return { pass, expected: "p1", actual: found };
});
await t("findProductByNameNorm", "না পাওয়া গেলে null", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [{ id: "p1", name: "Napa" }]);
  const found = await findProductByNameNorm(bt, "সম্পূর্ণ-অন্য-নাম");
  await closeDb(bt);
  return { pass: found === null, expected: null, actual: found };
});
await t("findProductByNameNorm", "excludeId দিয়ে এডিট-মোডে নিজের রেকর্ড বাদ যায়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [{ id: "p1", name: "Napa" }]);
  const found = await findProductByNameNorm(bt, "napa", "p1");
  await closeDb(bt);
  return { pass: found === null, expected: null, actual: found };
});
await t("findProductByNameNorm", "excludeId থাকলেও অন্য প্রোডাক্টের সাথে সংঘর্ষ ধরা পড়ে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    { id: "p1", name: "Napa" },
    { id: "p2", name: "Napa" }, // ইচ্ছাকৃত ডুপ্লিকেট (টেস্ট-ফিক্সচার)
  ]);
  const found = await findProductByNameNorm(bt, "napa", "p1");
  await closeDb(bt);
  return { pass: found && found.id === "p2", expected: "p2", actual: found };
});
await t("findProductByNameNorm", "deleted প্রোডাক্ট বাদ যায়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [{ id: "p1", name: "Napa", deleted: true }]);
  const found = await findProductByNameNorm(bt, "napa");
  await closeDb(bt);
  return { pass: found === null, expected: null, actual: found };
});
await t("findProductByNameNorm", "খালি/null nameNorm হলে null (crash না)", async () => {
  const bt = freshBusinessType();
  const found = await findProductByNameNorm(bt, "");
  await closeDb(bt);
  return { pass: found === null, expected: null, actual: found };
});

console.log(`\n distinct-lookups (এন্ট্রি ৪৪, রেট্রোঅ্যাক্টিভ টেস্ট — এন্ট্রি ৪৯) টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failCount > 0) {
  console.log(`❌ ${failCount}টি ব্যর্থ, ${passCount}টি পাস\n`);
  failures.forEach(f => console.log(f));
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
}
