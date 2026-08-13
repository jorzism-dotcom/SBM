#!/usr/bin/env node
// ─── scripts/generate-synthetic-dataset.mjs ────────────────────────────────
// Phase 0 বেঞ্চমার্ক স্ক্রিপ্ট — src/db/schema.sql ব্যবহার করে সিন্থেটিক
// প্রোডাক্ট/কাস্টমার/ইনভয়েস ডেটা জেনারেট করে, ইনসার্ট টাইমিং আর কয়েকটা রিয়েল
// কোয়েরির স্পিড মাপে। উদ্দেশ্য: Android ডিভাইসে বিল্ড করার আগেই লোকাল মেশিনে
// (বা এই sandbox-এ) দেখা যে স্কিমা/ইনডেক্স ডিজাইন আসলে টার্গেট স্কেলে কাজ করে কিনা।
//
// ⚠️ এটা Node.js-এর বিল্ট-ইন `node:sqlite` মডিউল ব্যবহার করে (Node 22+,
// experimental) — Capacitor অ্যাপে আসলে `@capacitor-community/sqlite` চলবে,
// কিন্তু SQL schema/query একই থাকায় এখানকার timing একটা reasonable
// approximation দেয় (আসল ডিভাইসে সাধারণত কিছুটা স্লো হবে, বাজেট ফোনের CPU-র
// কারণে — তাই এখানকার নাম্বারগুলোকে "best case" ধরে রাখুন)।
//
// চালানোর নিয়ম:
//   node scripts/generate-synthetic-dataset.mjs --products=1000 --customers=200 --invoices=5000
//   (ফুল স্কেল টেস্ট করতে — অনেক সময়/RAM লাগবে, ভালো মেশিনে চালান):
//   node scripts/generate-synthetic-dataset.mjs --products=100000 --customers=10000 --invoices=10000000

import { DatabaseSync } from "node:sqlite";
import { readFileSync, unlinkSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, "..", "src", "db", "schema.sql");
const DB_PATH = path.join(__dirname, "bench.db");

// ── CLI args পার্স ───────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const N_PRODUCTS = parseInt(args.products ?? "1000", 10);
const N_CUSTOMERS = parseInt(args.customers ?? "200", 10);
const N_INVOICES = parseInt(args.invoices ?? "5000", 10);
const BATCH_SIZE = 1000;

console.log(`── SBM SQLite বেঞ্চমার্ক ──`);
console.log(`প্রোডাক্ট: ${N_PRODUCTS.toLocaleString()}, কাস্টমার: ${N_CUSTOMERS.toLocaleString()}, ইনভয়েস: ${N_INVOICES.toLocaleString()}\n`);

if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);

// schema.sql-এ multi-statement আছে — node:sqlite-তে .exec() মাল্টি-স্টেটমেন্ট সাপোর্ট করে
const schemaSql = readFileSync(SCHEMA_PATH, "utf-8");
db.exec(schemaSql);

// ── হেল্পার ──────────────────────────────────────────────────────────────
const BN_MED_NAMES = ["নাপা", "প্যারাসিটামল", "এমোক্সিসিলিন", "ওমিপ্রাজল", "সেফ্রাডিন", "ফ্লাজিল", "এজিথ্রোমাইসিন", "লোসেকটিল"];
const BN_FORMS = ["ট্যাবলেট", "সিরাপ", "ক্যাপসুল", "ইনজেকশন"];
function randName(arr, i) {
  return `${arr[i % arr.length]} ${BN_FORMS[i % BN_FORMS.length]} ${Math.floor(i / arr.length) + 1}mg`;
}
function randMobile(i) {
  return `01${(700000000 + i).toString().slice(0, 9)}`;
}
function timeIt(label, fn) {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  console.log(`${label}: ${ms.toFixed(1)}ms`);
  return { result, ms };
}

// ── ১. প্রোডাক্ট ইনসার্ট (ব্যাচে, transaction-সহ) ──────────────────────────
timeIt(`প্রোডাক্ট ইনসার্ট (${N_PRODUCTS.toLocaleString()} রো, ব্যাচ ${BATCH_SIZE})`, () => {
  const stmt = db.prepare(
    `INSERT INTO products (id, name, name_norm, barcode, stock, cost_price, price, updated_at, deleted, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  );
  db.exec("BEGIN");
  for (let i = 0; i < N_PRODUCTS; i++) {
    const name = randName(BN_MED_NAMES, i);
    const record = { id: `p${i}`, name, stock: 100 + (i % 500), costPrice: 5 + (i % 50), price: 8 + (i % 60) };
    stmt.run(`p${i}`, name, name.toLowerCase(), `BAR${i}`, record.stock, record.costPrice, record.price, Date.now(), JSON.stringify(record));
    if (i % 10000 === 0 && i > 0) { db.exec("COMMIT"); db.exec("BEGIN"); }
  }
  db.exec("COMMIT");
});

// ── ২. কাস্টমার ইনসার্ট ───────────────────────────────────────────────────
timeIt(`কাস্টমার ইনসার্ট (${N_CUSTOMERS.toLocaleString()} রো)`, () => {
  const stmt = db.prepare(
    `INSERT INTO customers (id, name, name_norm, mobile, balance, updated_at, deleted, data)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  );
  db.exec("BEGIN");
  for (let i = 0; i < N_CUSTOMERS; i++) {
    const name = `কাস্টমার ${i}`;
    const mobile = randMobile(i);
    const record = { id: `c${i}`, name, mobile, balance: (i % 20) * 100 };
    stmt.run(`c${i}`, name, name.toLowerCase(), mobile, record.balance, Date.now(), JSON.stringify(record));
    if (i % 10000 === 0 && i > 0) { db.exec("COMMIT"); db.exec("BEGIN"); }
  }
  db.exec("COMMIT");
});

// ── ৩. ইনভয়েস ইনসার্ট (বড় স্কেল — এটাই আসল স্ট্রেস টেস্ট) ──────────────────
timeIt(`ইনভয়েস ইনসার্ট (${N_INVOICES.toLocaleString()} রো)`, () => {
  const stmt = db.prepare(
    `INSERT INTO invoices (id, invoice_no, date_key, customer_id, status, total, created_at, data)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
  );
  db.exec("BEGIN");
  const dayMs = 24 * 60 * 60 * 1000;
  for (let i = 0; i < N_INVOICES; i++) {
    const ts = Date.now() - (i % 1825) * dayMs; // ৫ বছরের রেঞ্জ জুড়ে ছড়ানো
    const dateKey = new Date(ts).toISOString().slice(0, 10);
    const custId = `c${i % Math.max(N_CUSTOMERS, 1)}`;
    const total = 100 + (i % 5000);
    const record = { id: `inv${i}`, invoiceNo: `INV-${i}`, customerId: custId, total, createdAt: ts };
    stmt.run(`inv${i}`, `INV-${i}`, dateKey, custId, total, ts, JSON.stringify(record));
    if (i % 20000 === 0 && i > 0) { db.exec("COMMIT"); db.exec("BEGIN"); }
  }
  db.exec("COMMIT");
});

console.log(`\nDB ফাইল সাইজ: ${(readFileSyncSize(DB_PATH) / (1024 * 1024)).toFixed(1)} MB\n`);
console.log(`── কোয়েরি বেঞ্চমার্ক ──`);

// ── কোয়েরি টেস্ট: প্রোডাক্ট নাম LIKE সার্চ ──────────────────────────────────
timeIt(`প্রোডাক্ট নাম সার্চ (LIKE, "নাপা")`, () => {
  return db.prepare(`SELECT * FROM products WHERE name_norm LIKE ? LIMIT 30`).all("%নাপা%");
});

// ── কোয়েরি টেস্ট: FTS5 প্রোডাক্ট সার্চ ──────────────────────────────────────
timeIt(`প্রোডাক্ট নাম সার্চ (FTS5, "নাপা*")`, () => {
  return db.prepare(`
    SELECT t.* FROM products t JOIN products_fts f ON f.id = t.id
    WHERE products_fts MATCH ? LIMIT 30
  `).all("নাপা*");
});

// ── কোয়েরি টেস্ট: কাস্টমার মোবাইল লুকআপ ─────────────────────────────────────
timeIt(`কাস্টমার লুকআপ (মোবাইল, ইনডেক্সড)`, () => {
  return db.prepare(`SELECT * FROM customers WHERE mobile = ?`).all(randMobile(N_CUSTOMERS >> 1));
});

// ── কোয়েরি টেস্ট: আজকের ইনভয়েস লিস্ট (পেজিনেটেড) ───────────────────────────
const today = new Date().toISOString().slice(0, 10);
timeIt(`আজকের ইনভয়েস লিস্ট (date_key ইনডেক্স, পেজ ৫০)`, () => {
  return db.prepare(`SELECT * FROM invoices WHERE date_key = ? ORDER BY created_at DESC LIMIT 50`).all(today);
});

// ── কোয়েরি টেস্ট: Dashboard aggregate (আজকের মোট বিক্রি) ───────────────────
timeIt(`Dashboard SUM(total) aggregate (আজকের বিক্রি)`, () => {
  return db.prepare(`SELECT SUM(total) as total, COUNT(*) as cnt FROM invoices WHERE date_key = ? AND status = 'active'`).get(today);
});

// ── কোয়েরি টেস্ট: নির্দিষ্ট কাস্টমারের ইনভয়েস হিস্ট্রি ───────────────────────
timeIt(`নির্দিষ্ট কাস্টমারের ইনভয়েস হিস্ট্রি (কম্বাইন্ড ইনডেক্স)`, () => {
  return db.prepare(`
    SELECT * FROM invoices WHERE customer_id = ? AND status != 'voided'
    ORDER BY date_key DESC LIMIT 50
  `).all("c1");
});

// ── কোয়েরি টেস্ট: পেজিনেশন — OFFSET (পুরনো) বনাম keyset (নতুন, ব্লকার #২ ফিক্স) ──
// দুটোই একই "গভীর পেজ" (মাঝামাঝি কোথাও, শুরু থেকে না) সিমুলেট করে — এটাই আসল
// পার্থক্য দেখায়, কারণ প্রথম কয়েকটা পেজে OFFSET আর keyset প্রায় সমান দ্রুত।
{
  const DEEP_OFFSET = Math.floor(N_INVOICES * 0.5); // ডেটাসেটের মাঝামাঝি একটা পেজ
  console.log(`\n── পেজিনেশন বেঞ্চমার্ক (গভীর পেজ, OFFSET ${DEEP_OFFSET.toLocaleString()} বনাম keyset) ──`);

  const { ms: offsetMs } = timeIt(`OFFSET পেজিনেশন (offset=${DEEP_OFFSET.toLocaleString()}, LIMIT 50)`, () => {
    return db.prepare(`SELECT * FROM invoices ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET ?`).all(DEEP_OFFSET);
  });

  // keyset cursor বানাতে আগে সেই একই পজিশনের (created_at, id) জোড়াটা বের করা হচ্ছে
  // (বাস্তবে এটা আগের পেজের শেষ রো থেকেই পাওয়া যেত, এখানে শুধু বেঞ্চমার্কের জন্য সিমুলেট করা হলো)
  const cursorRow = db.prepare(`SELECT created_at, id FROM invoices ORDER BY created_at DESC, id DESC LIMIT 1 OFFSET ?`).get(DEEP_OFFSET - 1);
  const { ms: keysetMs } = timeIt(`Keyset পেজিনেশন (একই গভীরতা, LIMIT 50)`, () => {
    return db.prepare(`
      SELECT * FROM invoices
      WHERE (created_at < ? OR (created_at = ? AND id < ?))
      ORDER BY created_at DESC, id DESC LIMIT 50
    `).all(cursorRow.created_at, cursorRow.created_at, cursorRow.id);
  });

  const speedup = offsetMs / keysetMs;
  console.log(`⚡ keyset প্রায় ${speedup.toFixed(1)}× দ্রুত (গভীর পেজে)`);
}

db.close();
console.log(`\n✅ শেষ — DB ফাইল: ${DB_PATH} (ম্যানুয়ালি চেক করতে চাইলে sqlite3 CLI দিয়ে খুলুন, শেষে ডিলিট করে দিতে পারেন)`);

function readFileSyncSize(p) {
  // 🔴 ফিক্স (এই সেশনে পুনরায় ধরা পড়েছে — SQLITE_MIGRATION_LOG.md এন্ট্রি ৪-এ আগে
  // একবার ফিক্স হয়েছিল বলে লেখা ছিল, কিন্তু আসল আপলোড করা zip-এ readFileSync()-ভিত্তিক
  // পুরনো/বাগযুক্ত ভার্সনই ছিল — সম্ভবত সেই ফিক্স কোনো কারণে zip-এ অন্তর্ভুক্ত হয়নি)।
  // readFileSync(p).length পুরো ফাইল RAM-এ Buffer করে লোড করার চেষ্টা করে — ১ কোটি
  // ইনভয়েস স্কেলে (কয়েক GB DB ফাইল) silently ব্যর্থ হয়ে catch ব্লকে পড়ে "0.0 MB"
  // রিপোর্ট করেছিল (এই সেশনের বেঞ্চমার্ক রানেই আবার দেখা গেছে)। statSync().size
  // ফাইল কনটেন্ট লোড না করে শুধু ফাইলসিস্টেম মেটাডেটা পড়ে — নির্ভরযোগ্য, যেকোনো সাইজে।
  try { return statSync(p).size; } catch { return 0; }
}
