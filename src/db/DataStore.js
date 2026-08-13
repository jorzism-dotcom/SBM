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

// ── Phase ১ (foundation, sync-ready): event device id ───────────────────────
// লাইসেন্স সিস্টেমের deviceId (getOrCreateLicenseDeviceId, async + IndexedDB,
// অ্যাপ রিসেট করলে ইচ্ছাকৃতভাবে বদলে যায়) থেকে ইচ্ছাকৃতভাবে আলাদা — event log-এর
// জন্য শুধু একটা স্থিতিশীল synchronous ট্যাগ দরকার, লাইসেন্স-সিকিউরিটির কড়াকড়ি না।
const EVENT_DEVICE_ID_KEY = "sbm_event_device_id";

function getEventDeviceId() {
  try {
    let id = localStorage.getItem(EVENT_DEVICE_ID_KEY);
    if (id) return id;
    id = (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, "").slice(0, 12);
    localStorage.setItem(EVENT_DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "unknown-device";
  }
}

// ── Phase ১ (foundation): feature_flags মিরর ────────────────────────────────
// isSqliteEnabled()/setSqliteEnabled() ইচ্ছাকৃতভাবে এখনো synchronous
// localStorage-ই পড়ে/লেখে (dualWriteSqlite() fire-and-forget কল সাইটে সরাসরি,
// await ছাড়া কল হয় — সেই সিঙ্ক্রোনাস কনট্র্যাক্ট ভাঙা যাবে না)। এই ফাংশনটা
// শুধু SQLite feature_flags টেবিলে একটা কপি (mirror) রাখে, ব্যর্থ হলেও নীরবে —
// ভবিষ্যতে multi-device sync-এর ভিত্তি, এখন কোনো read path এই টেবিল থেকে পড়ে না।
export async function mirrorFlagToSqlite(businessType, key, value) {
  try {
    const db = await getDb(businessType);
    await db.run(
      `INSERT OR REPLACE INTO feature_flags (key, value, updated_at, device_id) VALUES (?, ?, ?, ?)`,
      [key, String(value), Date.now(), getEventDeviceId()]
    );
  } catch {
    // সাইলেন্ট — flag mirror ব্যর্থ হলেও localStorage-ভিত্তিক আসল ফ্ল্যাগ অপ্রভাবিত
  }
}

// ── Phase ১ (foundation): lightweight event log ─────────────────────────────
// dualWriteSqlite()-এর diffById()-এর ঠিক পাশে বসে — যা upsert/remove হচ্ছে তারই
// একটা সংক্ষিপ্ত রেকর্ড। সম্পূর্ণ fire-and-forget, প্রধান write-path কখনো ব্লক/থ্রো করে না।
export async function logEventsMany(businessType, entityType, entries) {
  // entries: [{ entityId, op, payload }]
  if (!entries || !entries.length) return;
  try {
    const db = await getDb(businessType);
    const deviceId = getEventDeviceId();
    const now = Date.now();
    const set = entries.map((e) => ({
      statement: `INSERT OR REPLACE INTO events (id, entity_type, entity_id, op, payload, device_id, ts, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      values: [
        `${entityType}:${e.entityId}:${now}:${Math.random().toString(36).slice(2, 8)}`,
        entityType,
        String(e.entityId),
        e.op,
        e.payload != null ? JSON.stringify(e.payload) : null,
        deviceId,
        now,
      ],
    }));
    await db.executeSet(set);
  } catch {
    // সাইলেন্ট — event log ব্যর্থ হলেও dual-write/আসল ডেটা-পাথ অপ্রভাবিত (shadow feature)
  }
}

/** ভবিষ্যৎ multi-device sync-এর জন্য — এখনো কোথাও কল হচ্ছে না, রেফারেন্সের জন্য রাখা। */
export async function getUnsyncedEvents(businessType, limit = 500) {
  const db = await getDb(businessType);
  const res = await db.query(`SELECT * FROM events WHERE synced = 0 ORDER BY ts ASC LIMIT ?`, [limit]);
  return res.values || [];
}

export async function markEventsSynced(businessType, ids) {
  if (!ids || !ids.length) return;
  const db = await getDb(businessType);
  const set = ids.map((id) => ({ statement: `UPDATE events SET synced = 1 WHERE id = ?`, values: [id] }));
  await db.executeSet(set);
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

/**
 * SQLite-কে টেবিল/ইনডেক্সের সাম্প্রতিক ডেটা-ডিস্ট্রিবিউশন সম্পর্কে জানায়, যাতে
 * query planner সঠিক ইনডেক্স বেছে নেয় (এন্ট্রি ২-এ ধরা পড়া বাগ: বড় backfill-এর
 * পর ANALYZE না চালালে SQLite ভুল ইনডেক্স বেছে নিতে পারে, dashboard আবার ধীর
 * হয়ে যেতে পারে)। হালকা, দ্রুত অপারেশন — পুরো backfill শেষে একবার চালালেই যথেষ্ট,
 * প্রতি ব্যাচে চালানোর দরকার নেই।
 * @param {string} businessType
 */
export async function analyzeDb(businessType) {
  const db = await getDb(businessType);
  await db.execute(`ANALYZE;`);
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
// টেস্টযোগ্যতার জন্য export (Phase ৩ golden-master, PHASE_3_4_5_FINAL_PLAN_v2.md) —
// এন্ট্রি ২-এ ধরা পড়া টাইমজোন বাগ (BD মধ্যরাত-ভোর ৬টা বাউন্ডারি) আবার যেন
// silent regression না হয়ে ফেরে, সেটা এখন tests/golden-master.mjs-এ pin করা।
export function dateKeyFromTs(ts) {
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
// টেস্টযোগ্যতার জন্য export (Phase ৩ golden-master) — App.jsx-এর normName()-এর
// সাথে বাইট-বাই-বাইট সামঞ্জস্যপূর্ণ থাকতে হবে (উপরের কমেন্ট দ্রষ্টব্য), নাহলে FTS5
// সার্চ রেজাল্ট IndexedDB path-এর সাথে না মেলার ঝুঁকি (আগে একবার ধরা পড়েছিল)।
export function normName(name) {
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

// store-ভিত্তিক ডিফল্ট sort কলাম — HOT_FIELDS-এ যা আসলে আছে তার সাথে মিলিয়ে
// (invoices-এ "updated_at" কলামই নেই, শুধু "created_at" — আগের OFFSET-ভিত্তিক
// queryPage()-এর ডিফল্ট "updated_at DESC" invoices-এ কখনো কল হলে ভুল/এরর দিত,
// কিন্তু এখনো কোথাও লাইভ কল-সাইট না থাকায় এই বাগ ধরাই পড়েনি — keyset রিরাইটের
// সাথেই ঠিক করা হলো)।
const DEFAULT_SORT_COLUMN = {
  products: "updated_at",
  customers: "updated_at",
  invoices: "created_at",
};

/**
 * পেজিনেটেড কোয়েরি — keyset (seek) pagination, OFFSET না।
 *
 * 🔴 কেন OFFSET-এর বদলে keyset (SQLITE_MIGRATION_LOG.md ব্লকার #২): SQLite-এ
 * `OFFSET N` মানে ইঞ্জিন প্রথমে N-টা রো স্ক্যান করে **ফেলে দেয়**, তারপর পরের
 * LIMIT-টা রিটার্ন করে — বড় N (যেমন ১ কোটি ইনভয়েসের মাঝামাঝি একটা পেজ)-এ এই
 * "স্ক্যান-অ্যান্ড-ডিসকার্ড" কাজটাই ধীর হয়ে যায় (রিসার্চ অনুযায়ী keyset-এর তুলনায়
 * ~১৫০× পর্যন্ত ধীর)। Keyset pagination-এ বদলে প্রতিটা পেজের "কার্সার" হলো আগের
 * পেজের শেষ রো-র (sortColumn, id) জোড়া — পরের পেজ সরাসরি ইনডেক্স-সিক (`WHERE
 * (sortColumn, id) < (cursorVal, cursorId)`) দিয়ে শুরু হয়, কোনো রো ফেলে দেওয়ার
 * দরকার হয় না, তাই পেজ যত গভীরেই হোক গতি প্রায় স্থির থাকে।
 *
 * `id`-কে tiebreaker হিসেবে যোগ করা জরুরি কারণ sortColumn (updated_at/created_at)
 * -এ ডুপ্লিকেট ভ্যালু থাকতে পারে (একই মিলিসেকেন্ডে একাধিক রেকর্ড) — শুধু
 * sortColumn দিয়ে কার্সার বানালে সেই ডুপ্লিকেট-ভ্যালু গ্রুপের মাঝখানে রো
 * স্কিপ/রিপিট হয়ে যেতে পারত। (sortColumn, id) কম্পোজিট অর্ডার সবসময় ইউনিক
 * ও ডিটারমিনিস্টিক, তাই কোনো রো মিস/ডুপ্লিকেট হয় না।
 *
 * @param {string} businessType
 * @param {"products"|"customers"|"invoices"} store
 * @param {object} opts
 * @param {string} [opts.where="1=1"] - WHERE ক্লজ (params-এর সাথে মিলিয়ে)
 * @param {Array} [opts.params=[]]
 * @param {string} [opts.sortColumn] - ডিফল্ট store অনুযায়ী DEFAULT_SORT_COLUMN থেকে
 * @param {"ASC"|"DESC"} [opts.sortDir="DESC"]
 * @param {number} [opts.limit=50]
 * @param {{sortValue:*, id:string}|null} [opts.cursor=null] - আগের পেজের nextCursor,
 *   প্রথম পেজে null/undefined দিন
 * @returns {Promise<{rows:Array, nextCursor:{sortValue:*, id:string}|null, hasMore:boolean}>}
 */
export async function queryPage(businessType, store, opts = {}) {
  const {
    where = "1=1",
    params = [],
    sortColumn = DEFAULT_SORT_COLUMN[store] || "id",
    sortDir = "DESC",
    limit = 50,
    cursor = null,
  } = opts;
  const db = await getDb(businessType);
  const dir = String(sortDir).toUpperCase() === "ASC" ? "ASC" : "DESC";
  const cmp = dir === "DESC" ? "<" : ">";

  let sql;
  let sqlParams;
  if (cursor && cursor.sortValue !== undefined && cursor.sortValue !== null && cursor.id != null) {
    // keyset predicate: (sortColumn, id) < (cursorVal, cursorId) [DESC-এ; ASC-এ >]
    // — sortColumn সমান হলে id দিয়ে টাইব্রেক করা হচ্ছে যাতে ডুপ্লিকেট
    // sortColumn ভ্যালুর গ্রুপে কোনো রো স্কিপ/রিপিট না হয়।
    //
    // 🔴 ফিক্স (এই সেশনে ধরা পড়েছে, বেঞ্চমার্ক রি-রানের সময়): আগে এই কন্ডিশন
    // `sortColumn < ? OR (sortColumn = ? AND id < ?)` আকারে OR দিয়ে লেখা ছিল।
    // EXPLAIN QUERY PLAN দেখায় SQLite এই OR-প্যাটার্নকে ইনডেক্স SEEK-এ অপ্টিমাইজ
    // করতে পারে না — পুরো ইনডেক্স SCAN করে প্রতিটা রো-তে OR শর্ত চেক করে, যা
    // ঠিক OFFSET-এর মতোই ধীর (বরং বেশি, extra OR evaluation overhead-এর কারণে)।
    // ১০ লাখ ইনভয়েস স্কেলে বাস্তব বেঞ্চমার্কে ধরা পড়েছে: OR-ভার্সন ~২০ms, নিচের
    // row-value ভার্সন ~0.4ms (SQLite ৩.১৫+ থেকে সমর্থিত `(a, b) < (x, y)` টাপল
    // তুলনা, EXPLAIN QUERY PLAN-এ "SEARCH ... USING INDEX" দেখায়, "SCAN" না)।
    sql = `SELECT data, ${sortColumn} AS _sort_val, id AS _id FROM ${store}
           WHERE (${where}) AND (${sortColumn}, id) ${cmp} (?, ?)
           ORDER BY ${sortColumn} ${dir}, id ${dir}
           LIMIT ?`;
    sqlParams = [...params, cursor.sortValue, String(cursor.id), limit];
  } else {
    sql = `SELECT data, ${sortColumn} AS _sort_val, id AS _id FROM ${store}
           WHERE ${where}
           ORDER BY ${sortColumn} ${dir}, id ${dir}
           LIMIT ?`;
    sqlParams = [...params, limit];
  }

  const res = await db.query(sql, sqlParams);
  const rawRows = res.values || [];
  const rows = rawRows.map((r) => JSON.parse(r.data));
  const last = rawRows[rawRows.length - 1];
  // পুরো limit ভরে গেলে তবেই ধরে নেওয়া হয় আরও রো থাকতে পারে (ঠিক limit-এর কম
  // এলে নিশ্চিতভাবেই এটাই শেষ পেজ — আলাদা COUNT(*) কল লাগে না)
  const nextCursor = rawRows.length === limit && last ? { sortValue: last._sort_val, id: last._id } : null;
  return { rows, nextCursor, hasMore: !!nextCursor };
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

// ── Phase ৪ (হাইব্রিড সার্চ, PHASE_3_4_5_FINAL_PLAN_v2.md) ──────────────────
// 🔴 গুরুত্বপূর্ণ ডিজাইন-সিদ্ধান্ত: FTS5 দিয়ে candidate pool narrow করা শুধুমাত্র
// productMatchScore()-এর চেয়ে কোয়ালিটিতে সমান-বা-ভালো তখনই যখন ডেটাসেট বড়
// (FTS5 শুধু prefix/token ম্যাচ করে — ফাজি/বারকোড-সাবস্ট্রিং ম্যাচ productMatchScore()
// যা করে সেটা করে না, তাই candidate pool-এ না থাকা কোনো ভ্যালিড ম্যাচ বাদ পড়ে
// যাওয়ার ঝুঁকি আছে)। ৩ দোকানের বর্তমান স্কেলে (হাজার-দুয়েক রেকর্ড) এই ঝুঁকি
// নেওয়ার মতো কোনো বাস্তব লাভ নেই — তাই এই ফাংশন শুধু export করা হলো (রেডি,
// টেস্টেবল), কিন্তু কল-সাইটে (App.jsx) একটা size-threshold গেটের পেছনে —
// ছোট ডেটাসেটে সবসময় পুরনো ফুল-array productMatchScore()-ই চলবে (আচরণ
// অপরিবর্তিত), শুধু ডেটা অনেক বড় হয়ে গেলে (>৫০০০ রেকর্ড) narrowing চালু হবে।
export async function hybridSearchCandidateIds(businessType, store, term, limit = 300) {
  const rows = await searchFts(businessType, store, term, limit);
  return new Set(rows.map((r) => String(r.id)));
}

/** Dashboard aggregate — পুরো অ্যারে লোড না করে সরাসরি SQL SUM/COUNT। */
export async function aggregate(businessType, store, { select, where = "1=1", params = [] }) {
  const db = await getDb(businessType);
  const sql = `SELECT ${select} FROM ${store} WHERE ${where}`;
  const res = await db.query(sql, params);
  return res.values?.[0] || null;
}

// ── Phase 2: Resumable migration runner ─────────────────────────────────────
// (SQLITE_MIGRATION_LOG.md এন্ট্রি ৯-এর "যা এখনো বাকি" #১ — schema.sql-এর
// `_migration_state` টেবিল (Phase 0 থেকেই সংজ্ঞায়িত ছিল, এতদিন ব্যবহার হয়নি)
// এখন আসলে ব্যবহার হচ্ছে। এন্ট্রি ৬-৭-এর dev-প্যানেল ম্যানুয়াল ব্যাকফিল
// (`upsertMany()` একবারে পুরো অ্যারে) ছোট দোকানে (হাজার-খানেক রেকর্ড) ঠিক আছে,
// কিন্তু বড় দোকানে (লাখ-কোটি রেকর্ড) মাঝপথে অ্যাপ বন্ধ/kill হলে প্রগ্রেস হারিয়ে
// যেত — আবার প্রথম থেকে শুরু করতে হতো। এই ফাংশন ব্যাচে ব্যাচে (ডিফল্ট ৫০০ রেকর্ড)
// লেখে, প্রতি ব্যাচের পর `_migration_state`-এ progress persist করে, তাই resume
// করা গেলে ঠিক যেখানে থেমেছিল সেখান থেকেই চলবে।

const MIGRATION_BATCH_SIZE = 500; // বাজেট Android ফোনে এক ব্যাচে এর বেশি না — মেমরি/জ্যাঙ্ক কম রাখতে

async function getMigrationState(db, store) {
  const res = await db.query(`SELECT * FROM _migration_state WHERE store_name = ?`, [store]);
  return res.values?.[0] || null;
}

async function upsertMigrationState(db, state) {
  await db.run(
    `INSERT OR REPLACE INTO _migration_state
       (store_name, total_source_rows, migrated_rows, last_migrated_id, status, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      state.store_name,
      state.total_source_rows ?? null,
      state.migrated_rows ?? 0,
      state.last_migrated_id ?? null,
      state.status ?? "pending",
      state.started_at ?? null,
      state.completed_at ?? null,
    ]
  );
}

/** সব store-এর migration state একসাথে পড়া — dev প্যানেলে progress দেখানোর জন্য। */
export async function getAllMigrationStates(businessType) {
  const db = await getDb(businessType);
  const res = await db.query(`SELECT * FROM _migration_state`);
  return res.values || [];
}

/** নির্দিষ্ট store-এর migration state পুরোপুরি রিসেট (force restart) — dev প্যানেলের রিসেট বাটনের জন্য। */
export async function resetMigrationState(businessType, store) {
  const db = await getDb(businessType);
  await db.run(`DELETE FROM _migration_state WHERE store_name = ?`, [store]);
}

/**
 * ব্যাচে ব্যাচে, resumable migration — মাঝপথে অ্যাপ বন্ধ হলে পরের কলে ঠিক যেখানে
 * থেমেছিল সেখান থেকেই আবার শুরু হবে (`_migration_state.last_migrated_id` অনুযায়ী)।
 *
 * @param {string} businessType
 * @param {"products"|"customers"|"invoices"} store
 * @param {Array} sourceRecords - IndexedDB থেকে আসা পুরো অ্যারে (App.jsx-এর products/customers/invoices state)
 * @param {object} [opts]
 * @param {number} [opts.batchSize=500]
 * @param {(p:{done:boolean, migrated:number, total:number}) => void} [opts.onProgress]
 * @param {boolean} [opts.force=false] - true হলে আগের progress উপেক্ষা করে ০ থেকে আবার শুরু করে
 * @param {number} [opts.yieldMs=0] - প্রতি ব্যাচের পর UI থ্রেডকে এত মিলিসেকেন্ড "শ্বাস নেওয়ার" সময় দেয় (বাজেট ফোনে jank কমাতে)
 * @returns {Promise<{alreadyDone:boolean, migrated:number, total:number}>}
 */
export async function migrateStoreResumable(businessType, store, sourceRecords, opts = {}) {
  const { batchSize = MIGRATION_BATCH_SIZE, onProgress, force = false, yieldMs = 0 } = opts;
  if (!HOT_FIELDS[store]) throw new Error(`migrateStoreResumable(): অজানা store "${store}"`);
  const db = await getDb(businessType);

  // id দিয়ে ডিটারমিনিস্টিক ক্রম — resumability-র মূল ভিত্তি। উৎস অ্যারের
  // insertion-order-এর উপর নির্ভর করলে রান থেকে রানে "last_migrated_id-এর পরে
  // কোনটা" পাল্টে যেতে পারত (যেমন IndexedDB লোড অর্ডার বদলালে), তাই sort করে
  // একটা স্থিতিশীল ক্রম বানানো হচ্ছে।
  const sorted = [...sourceRecords].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const totalRows = sorted.length;

  let state = force ? null : await getMigrationState(db, store);
  if (!state) {
    state = {
      store_name: store, total_source_rows: totalRows, migrated_rows: 0,
      last_migrated_id: null, status: "pending", started_at: null, completed_at: null,
    };
    await upsertMigrationState(db, state);
  }

  if (state.status === "done" && !force) {
    onProgress?.({ done: true, migrated: state.migrated_rows, total: state.total_source_rows });
    return { alreadyDone: true, migrated: state.migrated_rows, total: state.total_source_rows };
  }

  // resumability: last_migrated_id-এর ঠিক পরের রেকর্ড থেকে শুরু (আগের ব্যাচগুলো
  // আবার না চালিয়ে, মাঝপথে বন্ধ হওয়ার আগের প্রগ্রেস অক্ষত রেখে)
  let startIdx = 0;
  if (state.last_migrated_id) {
    const idx = sorted.findIndex((r) => String(r.id) === state.last_migrated_id);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }

  if (state.status === "pending" || force) {
    state = { ...state, status: "in_progress", started_at: state.started_at || Date.now(), total_source_rows: totalRows };
    await upsertMigrationState(db, state);
  }

  let migratedSoFar = state.migrated_rows || 0;

  for (let i = startIdx; i < sorted.length; i += batchSize) {
    const batch = sorted.slice(i, i + batchSize);
    if (batch.length === 0) break;
    // upsertMany() ইতিমধ্যে FTS সিঙ্কও একই transaction-এ করে দেয় (এন্ট্রি ৯)
    await upsertMany(businessType, store, batch);
    migratedSoFar += batch.length;
    const lastId = String(batch[batch.length - 1].id);
    state = {
      store_name: store, total_source_rows: totalRows, migrated_rows: migratedSoFar,
      last_migrated_id: lastId, status: "in_progress", started_at: state.started_at, completed_at: null,
    };
    await upsertMigrationState(db, state);
    onProgress?.({ done: false, migrated: migratedSoFar, total: totalRows });
    if (yieldMs > 0) await new Promise((r) => setTimeout(r, yieldMs));
  }

  state = { ...state, migrated_rows: migratedSoFar, status: "done", completed_at: Date.now() };
  await upsertMigrationState(db, state);
  // এন্ট্রি ১৫: backfill সত্যিই এইমাত্র শেষ হলে (already-done শর্টসার্কিট না) একবার
  // ANALYZE চালানো হচ্ছে, যাতে dashboard-এর covering index (এন্ট্রি ২/entry-fix
  // idx_invoices_dashboard) নতুন ডেটার সাথে সঠিকভাবে ব্যবহৃত হয়। ব্যর্থ হলেও
  // migration নিজে ব্যর্থ ধরা হচ্ছে না — ANALYZE শুধু অপ্টিমাইজেশন, ক্রিটিকাল না।
  // এন্ট্রি ১৬ ফিক্স: এই ফাইল framework-agnostic (কোনো React import নেই, ফাইলের
  // শুরুতেই বলা আছে), তাই এখান থেকে সরাসরি showToast() কল করা যায় না। তার বদলে
  // ফলাফল রিটার্ন-অবজেক্টে (analyzeOk) জানানো হচ্ছে — App.jsx (যার showToast আছে)
  // এটা পড়ে ব্যবহারকারীকে toast দেখাবে।
  let analyzeOk = true;
  let analyzeError = null;
  try {
    await analyzeDb(businessType);
  } catch (e) {
    analyzeOk = false;
    analyzeError = e?.message || String(e);
    console.warn(`ANALYZE ব্যর্থ (${store}):`, analyzeError);
  }
  onProgress?.({ done: true, migrated: migratedSoFar, total: totalRows });
  return { alreadyDone: false, migrated: migratedSoFar, total: totalRows, analyzeOk, analyzeError };
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
// // Virtuoso endReached() — keyset pagination (Phase ৬, এখনো wire করা হয়নি):
// const { rows, nextCursor, hasMore } = await queryPage(businessType, "invoices", {
//   sortColumn: "created_at", sortDir: "DESC", limit: 50, cursor: myCursorState, // প্রথম পেজে cursor: null
// });
// setMyCursorState(nextCursor); // পরের endReached()-এ এটাই পাঠাতে হবে
//
// // dashboard "আজকের বিক্রি" (Phase 4):
// const { total } = await aggregate(businessType, "invoices", {
//   select: "SUM(total) as total",
//   where: "date_key = ? AND status != 'voided'",
//   params: [todayEn()],
// });
