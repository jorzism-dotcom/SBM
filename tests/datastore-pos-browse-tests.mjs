// ─── tests/datastore-pos-browse-tests.mjs ──────────────────────────────────
// DataStore.js-এর computeBrowseTier()/computeBrowseRank() (এন্ট্রি ৪০, ধাপ ৫ —
// POS picker) সরাসরি টেস্ট করে — আসল, অপরিবর্তিত প্রোডাকশন কোড ব্যবহার করে
// (কোনো লজিক এখানে কপি-পেস্ট করা হয়নি)। @capacitor-community/sqlite প্লাগইন
// native bridge-নির্ভর বলে plain Node-এ চলে না — tests/helpers/vite-node-
// loader.mjs একটা node:sqlite-ব্যাকড শিম দিয়ে সেটা রিপ্লেস করে, যাতে ঠিক এই
// ফাইলটাই আসল App-এ যেভাবে চলবে সেভাবে টেস্ট করা যায়।
//
// কেন এই টেস্ট জরুরি: computeBrowseTier()/computeBrowseRank() App.jsx-এর
// SmartInvoiceBuilder-এর isProductUnavailable() + demandType দুই-ধাপের stable
// sort-এর ঠিক একই ফলাফল দেওয়ার কথা — এই দুই ফাংশন App.jsx-এর যুক্তির সাথে
// বাইট-বাই-বাইট মিলিয়ে না রাখলে POS picker-এর ক্রম আসল availability-র সাথে
// না মেলার ঝুঁকি আছে (DataStore.js-এর এন্ট্রি ৪০ কমেন্ট দ্রষ্টব্য)। এই সুইট
// tier গণনা (unavailable/uncommon) আর browse_rank কলাম দিয়ে queryPage()-এর
// আসল সর্ট-অর্ডার — দুটোই যাচাই করে।
//
// রান করুন:  node tests/datastore-pos-browse-tests.mjs

import { register } from "node:module";
register("./helpers/vite-node-loader.mjs", import.meta.url);

const { computeBrowseTier, computeBrowseRank, queryPage, upsertMany, closeDb } = await import("../src/db/DataStore.js");

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
  return `browsetest_${++_bt}`;
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

// ── ১. computeBrowseTier — unavailable/uncommon বিট-ফ্ল্যাগ ─────────────────
await t("computeBrowseTier", "স্টকে-আছে + common প্রোডাক্ট → tier 0", async () => {
  const p = mkProduct("p1", { stock: 5, demandType: "common" });
  const pass = computeBrowseTier(p) === 0;
  return { pass, expected: 0, actual: computeBrowseTier(p) };
});

await t("computeBrowseTier", "স্টক-আউট প্রোডাক্ট → tier 2 (unavailable)", async () => {
  const p = mkProduct("p1", { stock: 0, demandType: "common" });
  const pass = computeBrowseTier(p) === 2;
  return { pass, expected: 2, actual: computeBrowseTier(p) };
});

await t("computeBrowseTier", "স্টকে-আছে + uncommon প্রোডাক্ট → tier 1", async () => {
  const p = mkProduct("p1", { stock: 5, demandType: "uncommon" });
  const pass = computeBrowseTier(p) === 1;
  return { pass, expected: 1, actual: computeBrowseTier(p) };
});

await t("computeBrowseTier", "স্টক-আউট + uncommon → tier 3 (দুটো ফ্ল্যাগই)", async () => {
  const p = mkProduct("p1", { stock: 0, demandType: "uncommon" });
  const pass = computeBrowseTier(p) === 3;
  return { pass, expected: 3, actual: computeBrowseTier(p) };
});

await t("computeBrowseTier", "demandType না থাকলে ডিফল্ট 'common' ধরা হয়", async () => {
  const p = mkProduct("p1", { stock: 5, demandType: undefined });
  const pass = computeBrowseTier(p) === 0;
  return { pass, expected: 0, actual: computeBrowseTier(p) };
});

await t("computeBrowseTier", "productType='service' হলে stock যাই থাকুক unavailable হয় না", async () => {
  const p = mkProduct("p1", { stock: 0, productType: "service", demandType: "common" });
  const pass = computeBrowseTier(p) === 0;
  return { pass, expected: 0, actual: computeBrowseTier(p) };
});

await t("computeBrowseTier", "stock undefined (কখনো ট্র্যাক হয়নি) হলে unavailable ধরা হয় না", async () => {
  const p = mkProduct("p1", { stock: undefined, demandType: "common" });
  const pass = computeBrowseTier(p) === 0;
  return { pass, expected: 0, actual: computeBrowseTier(p) };
});

// ── ২. computeBrowseRank — tier digit + name, lexicographic sort-যোগ্য ──────
await t("computeBrowseRank", "ফরম্যাট হলো '<tier><name>'", async () => {
  const p = mkProduct("p1", { stock: 5, demandType: "common", name: "নাপা" });
  const rank = computeBrowseRank(p);
  const pass = rank === "0নাপা";
  return { pass, expected: "0নাপা", actual: rank };
});

await t("computeBrowseRank", "name না থাকলে খালি স্ট্রিং ফলব্যাক (ক্র্যাশ করে না)", async () => {
  const p = mkProduct("p1", { stock: 5, demandType: "common", name: undefined });
  const rank = computeBrowseRank(p);
  const pass = rank === "0";
  return { pass, expected: "0", actual: rank };
});

// ── ৩. browse_rank কলাম দিয়ে queryPage()-এ আসল সর্ট-অর্ডার — tier আগে, তারপর নাম ──
await t("browse_rank queryPage সর্ট", "উপলব্ধ (tier 0) প্রোডাক্ট সবার আগে, তারপর স্টক-আউট", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("out1", { stock: 0, name: "ক-আউট", demandType: "common" }),
    mkProduct("avail1", { stock: 5, name: "খ-অ্যাভেইল", demandType: "common" }),
    mkProduct("avail2", { stock: 5, name: "গ-অ্যাভেইল", demandType: "common" }),
  ]);
  const page = await queryPage(bt, "products", { sortColumn: "browse_rank", sortDir: "ASC", limit: 10 });
  await closeDb(bt);
  const ids = page.rows.map((r) => r.id);
  // ASC lexicographic: tier "0..." সব tier "2..."-এর আগে আসবে
  const pass = ids.length === 3 && ids[0] === "avail1" && ids[1] === "avail2" && ids[2] === "out1";
  return { pass, expected: "[avail1,avail2,out1] (উপলব্ধ আগে)", actual: ids };
});

await t("browse_rank queryPage সর্ট", "একই tier-এর মধ্যে নাম অনুযায়ী সর্ট হয়", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("p1", { stock: 5, name: "গামা", demandType: "common" }),
    mkProduct("p2", { stock: 5, name: "আলফা", demandType: "common" }),
    mkProduct("p3", { stock: 5, name: "বেটা", demandType: "common" }),
  ]);
  const page = await queryPage(bt, "products", { sortColumn: "browse_rank", sortDir: "ASC", limit: 10 });
  await closeDb(bt);
  const ids = page.rows.map((r) => r.id);
  // বাংলা ইউনিকোড কোড-পয়েন্ট অর্ডার স্বরবর্ণ-প্রথম (আ) তারপর ব্যঞ্জনবর্ণ (গ, তারপর ব)
  const pass = ids.length === 3 && ids[0] === "p2" && ids[1] === "p1" && ids[2] === "p3";
  return { pass, expected: "[p2(আলফা),p1(গামা),p3(বেটা)]", actual: ids };
});

await t("browse_rank queryPage সর্ট", "uncommon-কিন্তু-উপলব্ধ প্রোডাক্ট unavailable প্রোডাক্টের আগে আসে", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("out1", { stock: 0, name: "ক", demandType: "common" }), // tier 2
    mkProduct("uncommon1", { stock: 5, name: "খ", demandType: "uncommon" }), // tier 1
  ]);
  const page = await queryPage(bt, "products", { sortColumn: "browse_rank", sortDir: "ASC", limit: 10 });
  await closeDb(bt);
  const ids = page.rows.map((r) => r.id);
  const pass = ids.length === 2 && ids[0] === "uncommon1" && ids[1] === "out1";
  return { pass, expected: "[uncommon1,out1]", actual: ids };
});

await t("browse_rank queryPage সর্ট", "keyset পেজিনেশনেও tier-অর্ডার ভাঙে না (২ পেজ জুড়ে)", async () => {
  const bt = freshBusinessType();
  await upsertMany(bt, "products", [
    mkProduct("avail1", { stock: 5, name: "ক", demandType: "common" }),
    mkProduct("avail2", { stock: 5, name: "খ", demandType: "common" }),
    mkProduct("out1", { stock: 0, name: "গ", demandType: "common" }),
    mkProduct("out2", { stock: 0, name: "ঘ", demandType: "common" }),
  ]);
  const page1 = await queryPage(bt, "products", { sortColumn: "browse_rank", sortDir: "ASC", limit: 2 });
  const page2 = await queryPage(bt, "products", {
    sortColumn: "browse_rank",
    sortDir: "ASC",
    limit: 2,
    cursor: page1.nextCursor,
  });
  await closeDb(bt);
  const idsPage1 = page1.rows.map((r) => r.id);
  const idsPage2 = page2.rows.map((r) => r.id);
  const pass = idsPage1.join() === "avail1,avail2" && idsPage2.join() === "out1,out2";
  return { pass, expected: { page1: "avail1,avail2", page2: "out1,out2" }, actual: { page1: idsPage1, page2: idsPage2 } };
});

// ── ফলাফল ────────────────────────────────────────────────────────────────────
console.log(`\n POS-ব্রাউজ DataStore টেস্ট সুইট — ${passCount + failCount}টি কেস\n`);
if (failures.length > 0) {
  console.log(`❌ ${failCount}টি ফেল, ${passCount}টি পাস\n`);
  console.log(failures.join("\n"));
  console.log("");
  process.exit(1);
} else {
  console.log(`✅ সবগুলো (${passCount}টি) পাস হয়েছে\n`);
  process.exit(0);
}
