// ─── tests/golden-master.mjs ─────────────────────────────────────────────
// Phase ৩ (PHASE_3_4_5_FINAL_PLAN_v2.md) — golden-master consistency টেস্ট।
//
// ⚠️ সততার সাথে একটা সীমাবদ্ধতা স্পষ্ট করে বলা দরকার: @capacitor-community/
// sqlite প্লাগিন একটা native Android bridge-নির্ভর — plain Node.js CI
// পরিবেশে আসল SQLite connection খোলা/query করা সম্ভব না (কোনো mock/stub
// এখানে ব্যবহার করা হয়নি, কারণ mock দিয়ে "verify" করলে সেটা মিথ্যা
// নিরাপত্তাবোধ দেবে)। তাই এই ফাইল real device-এ dev panel-এর
// "Verify (array vs SQLite)" বাটনের বিকল্প না — সেটা এখনো আসল যাচাই।
//
// এই ফাইল যা করে: DataStore.js-এর সেই pure transformation ফাংশনগুলো
// (normName, dateKeyFromTs) — যেগুলোর উপর dual-write-এর সঠিকতা নির্ভর করে,
// আর যেগুলোতে অতীতে সাইলেন্ট বাগ ধরা পড়েছিল (এন্ট্রি ২: BD টাইমজোন বাউন্ডারি,
// এন্ট্রি ৯: ডাবল-স্পেস normalize মিসম্যাচ) — সেই নির্দিষ্ট known-good
// input/output জোড়াগুলোর বিপরীতে pin করে রাখে, যাতে ভবিষ্যতে কেউ
// অসাবধানে এই ফাংশন এডিট করলে সাথে সাথে `npm test`-এই ধরা পড়ে,
// প্রোডাকশনে গিয়ে না।
//
// আসল array-vs-SQLite ডেটা রিকনসিলিয়েশন (রিয়েল রেকর্ড দিয়ে) এখনো শুধু
// dev panel-এর মধ্য দিয়ে, ডিভাইসে করতে হবে — Phase ৭ (Scientist pattern)
// চালু হলে এটা রানটাইমেও স্বয়ংক্রিয় হবে।

import { normName, dateKeyFromTs } from "../src/db/DataStore.js";

let passCount = 0, failCount = 0;
const failures = [];

function t(name, fn) {
  try {
    const { pass, detail } = fn();
    if (pass) passCount++;
    else { failCount++; failures.push(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
  } catch (err) {
    failCount++;
    failures.push(`  ✗ ${name} — এরর/ক্র্যাশ: ${err?.message || err}`);
  }
}

console.log("\n🗄️  Golden-master consistency টেস্ট সুইট (DataStore.js pure ফাংশন)\n");

// ── normName — এন্ট্রি ৯-এর ডাবল-স্পেস বাগ আবার যেন না ফেরে ────────────────
t("normName — একাধিক স্পেস একটা স্পেসে normalize হয়", () => {
  const r = normName("প্যারাসিটামল  ৫০০"); // ডাবল স্পেস
  return { pass: r === "প্যারাসিটামল ৫০০", detail: JSON.stringify(r) };
});

t("normName — trailing/leading স্পেস trim হয়", () => {
  const r = normName("  Napa Extra  ");
  return { pass: r === "napa extra", detail: JSON.stringify(r) };
});

t("normName — null/undefined crash করায় না, খালি স্ট্রিং রিটার্ন করে", () => {
  return { pass: normName(null) === "" && normName(undefined) === "" };
});

t("normName — case-insensitive (lowercase হয়)", () => {
  const r = normName("NAPA Extend");
  return { pass: r === "napa extend", detail: JSON.stringify(r) };
});

// ── dateKeyFromTs — এন্ট্রি ২-এর BD টাইমজোন বাউন্ডারি বাগ আবার যেন না ফেরে ──
// UTC মধ্যরাত থেকে ভোর ৬টা (BD সময়ে সকাল ৬টা-দুপুর ১২টা) — এই রেঞ্জে আগে
// UTC-ভিত্তিক date key ভুল দিন দেখাত। fixed GMT+6 (_bdParts) দিয়ে ফিক্স।
t("dateKeyFromTs — UTC রাত ১১:৫৯ PM (BD ভোর ৫:৫৯ AM পরদিন) সঠিক BD তারিখ দেয়", () => {
  // 2026-01-15 23:59 UTC = 2026-01-16 05:59 BD (পরের দিন BD-তে)
  const ts = Date.UTC(2026, 0, 15, 23, 59, 0);
  const r = dateKeyFromTs(ts);
  return { pass: r === "2026-01-16", detail: `পেলাম: ${r}` };
});

t("dateKeyFromTs — UTC দুপুর ১২টা (BD সন্ধ্যা ৬টা, একই দিন) সঠিক তারিখ দেয়", () => {
  const ts = Date.UTC(2026, 0, 15, 12, 0, 0);
  const r = dateKeyFromTs(ts);
  return { pass: r === "2026-01-15", detail: `পেলাম: ${r}` };
});

t("dateKeyFromTs — মাস/দিন সবসময় ২-ডিজিট zero-padded (YYYY-MM-DD ফরম্যাট)", () => {
  const ts = Date.UTC(2026, 2, 5, 0, 0, 0); // মার্চ ৫ (single-digit month/day)
  const r = dateKeyFromTs(ts);
  return { pass: /^\d{4}-\d{2}-\d{2}$/.test(r), detail: `পেলাম: ${r}` };
});

// ── ফলাফল ──────────────────────────────────────────────────────────────────
if (failCount > 0) {
  console.log(`\n❌ ${failCount}টা টেস্ট ব্যর্থ হয়েছে (${passCount} পাস):\n`);
  failures.forEach((f) => console.log(f));
  process.exitCode = 1;
} else {
  console.log(`\n✅ সবগুলো golden-master টেস্ট পাস (${passCount}টা)\n`);
  console.log("⚠️  মনে রাখবেন: এটা শুধু pure-function-লেভেল গার্ড। আসল array-vs-");
  console.log("   SQLite ডেটা রিকনসিলিয়েশন এখনো dev panel দিয়ে ডিভাইসে করতে হবে।\n");
}
