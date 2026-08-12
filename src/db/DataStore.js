// ─── src/db/DataStore.js ────────────────────────────────────────────────────
// SBM SQLite abstraction layer (Phase 0)।
//
// ⚠️ এই মুহূর্তে App.jsx-এর কোনো কোড এই ফাইল import/কল করে না। এটা একটা
// স্ট্যান্ডঅ্যালোন মডিউল — dual-write ওয়্যারিং (Phase 1) শুরু হলে তখন App.jsx-এর
// setProducts/setCustomers/setInvoices-এর পাশে এই মডিউলের upsert() কল যোগ হবে।
//
// ডিজাইন সিদ্ধান্ত (SQLITE_MIGRATION_LOG.md-এর সিদ্ধান্ত অনুযায়ী):
//   ১. প্রতি business type-এর জন্য আলাদা DB ফাইল (pharmacy.db, veterinary.db...)
//   ২. FTS5 দিয়ে products/customers নাম সার্চ
//   ৩. Firebase নেই — এটা একমুখী local migration (IndexedDB blob → SQLite)
//
// এই ফাইল ইচ্ছাকৃতভাবে framework-agnostic — কোনো React import নেই, যাতে
// synthetic dataset script (Node.js) আর App.jsx দুই জায়গা থেকেই ব্যবহারযোগ্য হয়।

import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
// src/logic.js পুরোপুরি pure/framework-agnostic — এখান থেকেই fixed GMT+6
// dateKey লজিক আনা হচ্ছে, App.jsx-এর _dateKeyOf()/scripts/generate-synthetic-
// dataset.mjs-এর bdDateKey()-এর সাথে ১০০% সিঙ্কড রাখতে (SQLITE_MIGRATION_LOG.md
// এন্ট্রি ২-এ ধরা পড়া টাইমজোন বাগের ফিক্স)।
import { _bdParts } from "../logic.js";

// ── Feature flag ─────────────────────────────────────────────────────────
// এই ফ্ল্যাগ বন্ধ থাকলে (ডিফল্ট) পুরো অ্যাপ আগের মতোই IndexedDB blob-array
// দিয়ে চলবে — DataStore-এর কোনো ফাংশন কল না করাই App.jsx-এর নিজের দায়িত্ব,
// এই ফাইল শুধু একটা on/off পড়ার হেল্পার দিচ্ছে।
const FLAG_KEY = "sbm_use_sqlite_store";

export function isSqliteEnabled() {
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSqliteEnabled(v) {
  try {
    localStorage.setItem(FLAG_KEY, v ? "1" : "0");
  } catch {}
}

// ── Connection cache — প্রতি business type-এর জন্য আলাদা DB, একবার খুলে রাখি ──
const sqlite = new SQLiteConnection(CapacitorSQLite);
const _dbCache = new Map(); // businessType -> SQLiteDBConnection

let _schemaSql = null; // schema.sql-এর কনটেন্ট lazy-load হয়ে এখানে ক্যাশ হবে

async function loadSchemaSql() {
  if (_schemaSql) return _schemaSql;
  // Vite ?raw import — schema.sql-কে প্লেইন স্ট্রিং হিসেবে বান্ডেল করবে
  const mod = await import("./schema.sql?raw");
  _schemaSql = mod.default;
  return _schemaSql;
}

/**
 * নির্দিষ্ট business type-এর DB কানেকশন খোলে (না থাকলে তৈরি করে + স্কিমা রান করে)।
 * @param {string} businessType - যেমন "pharmacy", "veterinary", "semen"
 * @returns {Promise<import("@capacitor-community/sqlite").SQLiteDBConnection>}
 */
export async function getDb(businessType) {
  if (!businessType) throw new Error("getDb(): businessType আবশ্যক");
  if (_dbCache.has(businessType)) return _dbCache.get(businessType);

  const dbName = `sbm_${businessType}`; // ফাইল হবে sbm_pharmacy SQLite.db ইত্যাদি
  const isConn = (await sqlite.isConnection(dbName, false)).result;
  const consistent = (await sqlite.checkConnectionsConsistency()).result;

  const db =
    consistent && isConn
      ? await sqlite.retrieveConnection(dbName, false)
      : await sqlite.createConnection(dbName, false, "no-encryption", 1, false);

  await db.open();

  // 🔴 ফিক্স (real-device টেস্টে ধরা পড়া বাগ, স্ক্রিনশট: "Queries cannot be
  // performed using execSQL(), use query() instead."): schema.sql-এর
  // `PRAGMA journal_mode = WAL;` Android-এ execSQL()-এর জন্য অবৈধ, কারণ এটা
  // journal mode-এর নতুন ভ্যালু রিটার্ন করে (query-টাইপ statement হিসেবে গণ্য
  // হয়), আর @capacitor-community/sqlite-এর execute() শুধু non-query DDL/DML
  // (CREATE TABLE, INSERT ইত্যাদি) চালানোর জন্য। তাই এখন সব PRAGMA লাইন
  // schema.sql থেকে আলাদা করে db.query() দিয়ে (এক এক করে) চালানো হচ্ছে, আর
  // বাকি স্কিমা (CREATE TABLE/INDEX/TRIGGER) আগের মতোই db.execute()-এ।
  const schema = await loadSchemaSql();
  const pragmaLines = schema.match(/^\s*PRAGMA\s[^;]*;/gim) || [];
  const restOfSchema = schema.replace(/^\s*PRAGMA\s[^;]*;/gim, "");
  for (const pragma of pragmaLines) {
    await db.query(pragma.trim());
  }
  // schema.sql-এ multiple statements আছে — execute() মাল্টি-স্টেটমেন্ট সাপোর্ট করে
  await db.execute(restOfSchema);

  _dbCache.set(businessType, db);
  return db;
}

export async function closeDb(businessType) {
  if (!_dbCache.has(businessType)) return;
  await sqlite.closeConnection(`sbm_${businessType}`, false);
  _dbCache.delete(businessType);
}

// ── Generic CRUD হেল্পার ─────────────────────────────────────────────────
// store: "products" | "customers" | "invoices"
// প্রতিটা রেকর্ডের "hot fields" আলাদা, বাকিটা JSON — কলাম ম্যাপিং নিচে।

const HOT_FIELDS = {
  products: {
    columns: ["id", "name", "name_norm", "barcode", "stock", "cost_price", "price", "updated_at", "deleted"],
    extract: (p) => [
      String(p.id),
      p.name ?? "",
      normName(p.name),
      p.barcode ?? null,
      numOrNull(p.stock),
      numOrNull(p.costPrice),
      numOrNull(p.price),
      p.updatedAt ?? Date.now(),
      p.deleted ? 1 : 0,
    ],
  },
  customers: {
    columns: ["id", "name", "name_norm", "mobile", "balance", "updated_at", "deleted"],
    extract: (c) => [
      String(c.id),
      c.name ?? "",
      normName(c.name),
      c.mobile ?? null,
      numOrNull(c.balance),
      c.updatedAt ?? Date.now(),
      c.deleted ? 1 : 0,
    ],
  },
  invoices: {
    columns: ["id", "invoice_no", "date_key", "customer_id", "status", "total", "created_at"],
    extract: (inv) => [
      String(inv.id),
      inv.invoiceNo ?? null,
      inv.dateKey ?? dateKeyFromTs(inv.createdAt),
      inv.customerId ? String(inv.customerId) : null,
      inv.status ?? "active",
      numOrNull(inv.total),
      inv.createdAt ?? Date.now(),
    ],
  },
};

function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// 🔴 ফিক্স (SQLITE_MIGRATION_LOG.md এন্ট্রি ২-এ flagged টাইমজোন বাগ): আগে এখানে
// `new Date().toISOString().slice(0,10)` ব্যবহার হতো — সেটা UTC তারিখ দেয়,
// বাংলাদেশ লোকাল (UTC+6) না। রাত ১২টা–ভোর ৬টা এই ৬ ঘণ্টায় date_key ভুল (আগের
// দিনের) হয়ে যেত। এখন App.jsx-এর `_dateKeyOf()`-এর মতোই `_bdParts()`
// (src/logic.js, fixed GMT+6) থেকে বের করা হচ্ছে — dual-write ফেজে দুই সিস্টেমে
// "আজ"-এর সংজ্ঞা এখন ১০০% সিঙ্কড।
function dateKeyFromTs(ts) {
  const d = ts ? new Date(ts) : new Date();
  const { y, m, day } = _bdParts(d);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// normName(): App.jsx-এর normName() ফাংশনের সাথে বাইট-বাই-বাইট সামঞ্জস্যপূর্ণ
// (দেখুন src/App.jsx লাইন ~27194, ~27243 — দুই জায়গায় লোকাল ফাংশন হিসেবে
// সংজ্ঞায়িত, module-level export নেই বলে সরাসরি import করা যায়নি, তাই এখানে
// ঠিক একই implementation কপি করা হলো)।
// 🔴 ফিক্স: আগের placeholder-এ `.replace(/\s+/g," ")` (একাধিক স্পেস → একটা
// স্পেস) অংশটা মিসিং ছিল — ফলে "প্যারাসিটামল  ৫০০" (ডাবল স্পেস) দুই সিস্টেমে
// আলাদাভাবে normalize হতো, FTS5 সার্চ রেজাল্ট IndexedDB path-এর সাথে না মেলার
// ঝুঁকি ছিল। এখন App.jsx-এর সাথে identical।
function normName(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// products/customers-এর জন্য FTS সিঙ্ক দরকার, invoices-এর জন্য না (দেখুন schema.sql-এর কমেন্ট — এন্ট্রি ৯)
const FTS_STORES = {
  products: { cols: ["name"], extract: (r) => [r.name ?? ""] },
  customers: { cols: ["name", "mobile"], extract: (r) => [r.name ?? "", r.mobile ?? ""] },
};

/** একটা রেকর্ডের FTS ইনডেক্স এন্ট্রি রিফ্রেশ করে (delete + insert, id দিয়ে ম্যাচ) — trigger-এর বদলে। */
async function syncFtsRow(db, store, record) {
  const def = FTS_STORES[store];
  if (!def) return; // invoices ইত্যাদির জন্য FTS নেই
  const ftsTable = `${store}_fts`;
  const id = String(record.id);
  await db.run(`DELETE FROM ${ftsTable} WHERE id = ?`, [id]);
  const cols = def.cols;
  const placeholders = cols.map(() => "?").join(", ");
  await db.run(
    `INSERT INTO ${ftsTable} (id, ${cols.join(", ")}) VALUES (?, ${placeholders})`,
    [id, ...def.extract(record)]
  );
}

/** ব্যাচে একাধিক রেকর্ডের FTS এন্ট্রি রিফ্রেশ — upsertMany()-এর সাথে ব্যবহারের জন্য। */
function buildFtsStatements(store, records) {
  const def = FTS_STORES[store];
  if (!def) return [];
  const ftsTable = `${store}_fts`;
  const cols = def.cols;
  const placeholders = cols.map(() => "?").join(", ");
  const statements = [];
  for (const r of records) {
    const id = String(r.id);
    statements.push({ statement: `DELETE FROM ${ftsTable} WHERE id = ?`, values: [id] });
    statements.push({
      statement: `INSERT INTO ${ftsTable} (id, ${cols.join(", ")}) VALUES (?, ${placeholders})`,
      values: [id, ...def.extract(r)],
    });
  }
  return statements;
}

/**
 * একটা রেকর্ড insert/replace করে (upsert)। dual-write ফেজে App.jsx-এর
 * setProducts/setCustomers/setInvoices-এর পাশাপাশি এটা কল হবে।
 */
export async function upsert(businessType, store, record) {
  const def = HOT_FIELDS[store];
  if (!def) throw new Error(`upsert(): অজানা store "${store}"`);
  const db = await getDb(businessType);
  const cols = def.columns;
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${store} (${cols.join(", ")}, data) VALUES (${placeholders}, ?)`;
  const values = [...def.extract(record), JSON.stringify(record)];
  await db.run(sql, values);
  // 🔴 এন্ট্রি ৯: আগে এটা SQL trigger দিয়ে হতো, এখন JS থেকে ম্যানুয়ালি (দেখুন schema.sql-এর কমেন্ট)
  await syncFtsRow(db, store, record);
}

/** একসাথে অনেকগুলো রেকর্ড upsert — backfill migration-এর সময় ব্যবহার হবে। */
export async function upsertMany(businessType, store, records) {
  const def = HOT_FIELDS[store];
  if (!def) throw new Error(`upsertMany(): অজানা store "${store}"`);
  const db = await getDb(businessType);
  const cols = def.columns;
  const placeholders = `(${cols.map(() => "?").join(", ")}, ?)`;
  const set = records.map((r) => ({
    statement: `INSERT OR REPLACE INTO ${store} (${cols.join(", ")}, data) VALUES ${placeholders}`,
    values: [...def.extract(r), JSON.stringify(r)],
  }));
  // 🔴 এন্ট্রি ৯: FTS সিঙ্ক (delete+insert per record) একই ব্যাচ-transaction-এ যোগ করা হচ্ছে
  set.push(...buildFtsStatements(store, records));
  // executeSet — একটা transaction-এ multiple parameterized statement, বড় ব্যাচের জন্য
  await db.executeSet(set);
}

export async function getById(businessType, store, id) {
  const db = await getDb(businessType);
  const res = await db.query(`SELECT data FROM ${store} WHERE id = ?`, [String(id)]);
  const row = res.values?.[0];
  return row ? JSON.parse(row.data) : null;
}

export async function remove(businessType, store, id) {
  const db = await getDb(businessType);
  await db.run(`DELETE FROM ${store} WHERE id = ?`, [String(id)]);
  // 🔴 এন্ট্রি ৯: আগে ON DELETE trigger দিয়ে হতো, এখন সরাসরি
  if (FTS_STORES[store]) {
    await db.run(`DELETE FROM ${store}_fts WHERE id = ?`, [String(id)]);
  }
}

/**
 * পেজিনেটেড কোয়েরি — Virtuoso-র endReached-এ কল হওয়ার জন্য।
 * @param {object} opts { where, params, orderBy, limit, offset }
 */
export async function queryPage(businessType, store, opts = {}) {
  const { where = "1=1", params = [], orderBy = "updated_at DESC", limit = 50, offset = 0 } = opts;
  const db = await getDb(businessType);
  const sql = `SELECT data FROM ${store} WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const res = await db.query(sql, [...params, limit, offset]);
  return (res.values || []).map((r) => JSON.parse(r.data));
}

/** FTS5 সার্চ — প্রোডাক্ট/কাস্টমার নাম দিয়ে খোঁজার জন্য। */
export async function searchFts(businessType, store, term, limit = 30) {
  if (!["products", "customers"].includes(store)) {
    throw new Error(`searchFts(): "${store}"-এর জন্য FTS টেবিল নেই`);
  }
  const db = await getDb(businessType);
  const ftsTable = `${store}_fts`;
  const sql = `
    SELECT t.data FROM ${store} t
    JOIN ${ftsTable} f ON f.id = t.id
    WHERE ${ftsTable} MATCH ?
    LIMIT ?
  `;
  // FTS5 MATCH-এর জন্য prefix সার্চ (যেমন "নাপা" লিখলেই "নাপা এক্সটেন্ড" মিলবে)
  const matchTerm = `${term.trim()}*`;
  const res = await db.query(sql, [matchTerm, limit]);
  return (res.values || []).map((r) => JSON.parse(r.data));
}

/** Dashboard aggregate — পুরো অ্যারে লোড না করে সরাসরি SQL SUM/COUNT। */
export async function aggregate(businessType, store, { select, where = "1=1", params = [] }) {
  const db = await getDb(businessType);
  const sql = `SELECT ${select} FROM ${store} WHERE ${where}`;
  const res = await db.query(sql, params);
  return res.values?.[0] || null;
}

// ── উদাহরণ ব্যবহার (Phase 1-এ App.jsx-এ যেভাবে বসবে, রেফারেন্সের জন্য) ──────
//
// import { upsert, queryPage, searchFts, aggregate, isSqliteEnabled } from "./db/DataStore";
//
// // dual-write (Phase 1):
// const newInv = { ...invoice, id: uid() };
// setInvoices(prev => [...prev, newInv]);              // পুরনো path (অপরিবর্তিত)
// if (isSqliteEnabled()) await upsert(businessType, "invoices", newInv); // নতুন path (সাইলেন্ট, extra)
//
// // dashboard "আজকের বিক্রি" (Phase 4):
// const { total } = await aggregate(businessType, "invoices", {
//   select: "SUM(total) as total",
//   where: "date_key = ? AND status != 'voided'",
//   params: [todayEn()],
// });
