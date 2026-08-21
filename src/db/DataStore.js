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
import { _bdParts, getSellableStock, normalizeSupplierKey, calcLineDiscountedRevenue, _itemCostPrice } from "../logic.js";

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

// ── Feature flag: Products boot-lazy (৭.৩, নিরাপদ/সীমিত সংস্করণ) ───────────
// ⚠️ এটা "সম্পূর্ণ on-demand products" (আসল ৭.৩ ডিজাইন, ৬৭টা কল-সাইট বদলাতে
// হতো) না — সেটা এখনো করা হয়নি, কারণ এক সেশনে নিরাপদে সম্ভব না। এই ফ্ল্যাগ
// শুধু বুট-টাইম *লোডিং* নন-ব্লকিং করে: products এখনো পুরোপুরি মেমরিতে লোড
// হয় (তাই ৬৭টা কল-সাইটের কোনোটাই ভাঙে না), শুধু সেই লোড আর প্রথম রেন্ডারকে
// (লগইন/স্প্ল্যাশ স্ক্রিন) ব্লক করে না — বড় products ব্লব read+JSON-parse
// ব্যাকগ্রাউন্ডে হয়, রেডি হলে state-এ প্যাচ হয়ে যায়। ডিফল্ট বন্ধ — বন্ধ
// থাকলে App.jsx-এর বুট সিকোয়েন্স ১০০% আগের মতোই আচরণ করে।
const PRODUCTS_BOOT_LAZY_FLAG_KEY = "sbm_products_boot_lazy";

export function isProductsBootLazyEnabled() {
  try {
    return localStorage.getItem(PRODUCTS_BOOT_LAZY_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setProductsBootLazyEnabled(v) {
  try {
    localStorage.setItem(PRODUCTS_BOOT_LAZY_FLAG_KEY, v ? "1" : "0");
  } catch {}
}

// ── Feature flag: Products boot "কখনো লোড না করা" (এন্ট্রি ৮০) ─────────────
// ⚠️ এটা `sbm_products_boot_lazy`-এর উপর নির্ভরশীল একটা *আলাদা, উপরের-স্তরের*
// ফ্ল্যাগ — `sbm_pos_ondemand_cart`-এর মতোই প্যাটার্নে। শুধু এই ফ্ল্যাগ চালু
// করলে কিছুই বদলায় না; `sbm_products_boot_lazy` **এবং** `sbm_use_sqlite_store`
// দুটোই চালু থাকা লাগবে, তবেই App.jsx বুট-সিকোয়েন্স পুরনো IndexedDB blob-load
// (`setTimeout(() => loadMany([LK(SK.products)]))`) সম্পূর্ণ স্কিপ করে —
// productsById শুধু SQLite বাল্ক-হাইড্রেট (এন্ট্রি ৭৮) থেকেই আসবে, `products`
// React array চিরকাল খালি [] থাকবে। App.jsx নিজে হাইড্রেট সফল হয়েছে কিনা
// যাচাই করেই তবে blob-load স্কিপ করে — ব্যর্থ হলে নিরাপদে পুরনো delay-only
// আচরণে fallback করে (এই ফ্ল্যাগ চালু থাকলেও)। ডিফল্ট বন্ধ।
const PRODUCTS_NEVER_LOAD_FLAG_KEY = "sbm_products_boot_never";

export function isProductsNeverLoadEnabled() {
  try {
    return localStorage.getItem(PRODUCTS_NEVER_LOAD_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setProductsNeverLoadEnabled(v) {
  try {
    localStorage.setItem(PRODUCTS_NEVER_LOAD_FLAG_KEY, v ? "1" : "0");
  } catch {}
}

// ── Feature flag: Customers boot lazy + never-load (এন্ট্রি ৯৭) ────────────
// ⚠️ products-এর ঠিক একই দুই-স্তরের প্যাটার্ন (PRODUCTS_BOOT_LAZY_FLAG_KEY +
// PRODUCTS_NEVER_LOAD_FLAG_KEY, এন্ট্রি ৭৮/৮০) — customers-এর জন্য। এই দুটো
// ফ্ল্যাগই **ডিফল্ট বন্ধ** এবং একে অপরের উপর নির্ভরশীল
// (customersNeverLoad শুধু customersBootLazy চালু থাকলেই অর্থপূর্ণ)।
// ⚠️⚠️ এই ফ্ল্যাগ চালু করার আগে migration log-এর এন্ট্রি ৯৭ পড়ুন — এখনো
// কয়েকটা call-site (মোবাইল-ডুপ্লিকেট চেক, POS walk-in ফ্লো, SMS reminder
// লিস্ট) `customers` পূর্ণ array-এর উপর নির্ভরশীল, never-load চালু করলে
// এগুলো silently ভাঙতে পারে যতক্ষণ না সেগুলো কনভার্ট হয়।
const CUSTOMERS_BOOT_LAZY_FLAG_KEY = "sbm_customers_boot_lazy";

export function isCustomersBootLazyEnabled() {
  try {
    return localStorage.getItem(CUSTOMERS_BOOT_LAZY_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCustomersBootLazyEnabled(v) {
  try {
    localStorage.setItem(CUSTOMERS_BOOT_LAZY_FLAG_KEY, v ? "1" : "0");
  } catch {}
}

const CUSTOMERS_NEVER_LOAD_FLAG_KEY = "sbm_customers_boot_never";

export function isCustomersNeverLoadEnabled() {
  try {
    return localStorage.getItem(CUSTOMERS_NEVER_LOAD_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCustomersNeverLoadEnabled(v) {
  try {
    localStorage.setItem(CUSTOMERS_NEVER_LOAD_FLAG_KEY, v ? "1" : "0");
  } catch {}
}

// ── Feature flag: POS on-demand cart lookups (এন্ট্রি ৬৮, ৭.৩-এর POS অংশের
// প্রথম real ধাপ) ───────────────────────────────────────────────────────────
// ⚠️ এই ফ্ল্যাগ **ডিফল্ট বন্ধ**, আর `sbm_products_boot_lazy` থেকে সম্পূর্ণ
// স্বাধীন — চালু করলেও `products` এখনো পুরোপুরি মেমরিতেই থাকে (এই ফ্ল্যাগ একাই
// কিছু বদলায় না)। শুধু `sbm_products_boot_lazy` **এবং** এই ফ্ল্যাগ দুটোই চালু
// থাকলে SmartInvoiceBuilder (POS)-এর কার্ট-লুকআপ/ব্যাচ-ম্যাপ `products`-এর
// পুরো অ্যারে স্ক্যান না করে বরং বর্তমানে-দৃশ্যমান/কার্টে-থাকা id-গুলোর জন্যই
// (useProductsByIds()-এর মাধ্যমে) কাজ করবে — products খালি/লেজি থাকা অবস্থাতেও
// সঠিক কাজ করার কথা (ইতিমধ্যে-প্রমাণিত useProductsByIds()/dsGetByIds() পাথ,
// POS ব্রাউজ-গ্রিডে এন্ট্রি ৪০-এ একই প্যাটার্নে চালু আছে)। ⚠️ **real-device
// বিলিং-কার্ট যাচাই ছাড়া কখনো চালু করবেন না** — বন্ধ থাকলে ১০০% আগের আচরণ।
const POS_ONDEMAND_CART_FLAG_KEY = "sbm_pos_ondemand_cart";

export function isPosOndemandCartEnabled() {
  try {
    return localStorage.getItem(POS_ONDEMAND_CART_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPosOndemandCartEnabled(v) {
  try {
    localStorage.setItem(POS_ONDEMAND_CART_FLAG_KEY, v ? "1" : "0");
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
const _dbCache = new Map(); // businessType -> SQLiteDBConnection (resolved)
// 🔴 ফিক্স (এন্ট্রি ৫৭, real-device-এ ধরা পড়া cold-boot race): আগে শুধু
// resolved connection cache হতো (_dbCache), promise না। বুট-এ একই businessType-এর
// জন্য একাধিক হুক (useInventoryData/useKpiStats-এর একাধিক সোর্স/useProductSalesRows
// ইত্যাদি) প্রায় একই সময়ে getDb() কল করলে সবাই একসাথে cache-miss পেত, আর সবাই
// সমান্তরালে db.open()+schema execute()+১২টা ALTER TABLE চালানো শুরু করে দিত —
// একই আন্ডারলাইং SQLite ফাইলে concurrent DDL/connection-open রেস কন্ডিশনে একটা
// কল থ্রো করত, caller-এর catch ব্লকে পড়ে sqlStatus:'error' দেখাত (ব্যবহারকারীর
// রিপোর্ট করা "স্টক ডেটা লোড করা যায়নি (SQL ব্যর্থ)" ব্যানার)। কয়েক সেকেন্ড পরে
// দ্বিতীয়বার কল হলে ততক্ষণে _dbCache পপুলেটেড থাকত বলে সফল হতো — ঠিক যেমনটা
// পর্যবেক্ষণ করা হয়েছে (৫:০২-এ error, ৫:১৬-এ সঠিক সংখ্যা)।
// ফিক্স: in-flight প্রমিজ নিজেই cache করা হচ্ছে (resolve হওয়ার আগেই সিঙ্ক্রোনাসভাবে
// Map-এ বসানো) — যেকোনো সংখ্যক concurrent caller একই init-প্রমিজেই await করবে,
// দ্বিতীয় db.open()/schema-execution কখনো শুরুই হবে না। ব্যর্থ হলে cache থেকে
// entry সরিয়ে দেওয়া হচ্ছে যাতে পরের কল আবার রিট্রাই করতে পারে (স্টাক ব্যর্থ
// promise চিরস্থায়ীভাবে cache-এ আটকে না থাকে)।
const _dbPromiseCache = new Map(); // businessType -> Promise<SQLiteDBConnection>, in-flight

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
  // 🆕 এন্ট্রি ৫৭: ইতিমধ্যে এই businessType-এর জন্য init চলছে (in-flight) —
  // নতুন করে db.open()/schema শুরু না করে একই promise-এ যোগ দাও।
  if (_dbPromiseCache.has(businessType)) return _dbPromiseCache.get(businessType);

  const initPromise = _initDb(businessType).then((db) => {
    _dbCache.set(businessType, db);
    _dbPromiseCache.delete(businessType); // সফল — resolved cache-ই যথেষ্ট এখন থেকে
    return db;
  }).catch((err) => {
    _dbPromiseCache.delete(businessType); // ব্যর্থ — cache-এ আটকে না রেখে পরের কল রিট্রাই করতে দাও
    throw err;
  });
  _dbPromiseCache.set(businessType, initPromise); // সিঙ্ক্রোনাসভাবেই বসানো হলো, যেন কোনো concurrent caller miss না করে
  return initPromise;
}

async function _initDb(businessType) {
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
  // 🔴 ফিক্স (এন্ট্রি ৫৮, real-device-এ ধরা পড়া দ্বিতীয় লেটেন্সি বাগ — flag বন্ধ
  // করে টেস্টে "লেট নেই" কনফার্ম হওয়ায় প্রমাণিত এটা SQL-লেয়ারেরই সমস্যা): আগে
  // এখানে ১৩টা আলাদা ALTER TABLE কল ছিল, প্রতিটা নিজের try/catch-এ ব্লাইন্ডলি
  // চালানো হতো এই ধরে নিয়ে যে বেশিরভাগ ডিভাইসে কলাম আগে থেকেই আছে, তাই
  // "duplicate column" এরর দিয়ে catch-এ ধরা পড়বে। কিন্তু প্রতিটা ALTER —
  // ব্যর্থ হলেও — একটা সম্পূর্ণ JS↔Native bridge round-trip খরচ করত, আর এই
  // ১৩টা কল sequentially await হতো (পরের ALTER আগেরটা শেষ না হওয়া পর্যন্ত শুরু
  // হতো না)। পুরনো ডিভাইসে (মাসের পর মাস dual-write চলছে) সব কলামই আগে থেকে
  // আছে, তাই প্রতি cold-boot-এ পুরো ১৩টা round-trip-ই নিরর্থক খরচ হতো — এটাই
  // ব্যবহারকারীর রিপোর্ট করা "প্রতিবার লেট, তারপর ইনস্ট্যান্ট" প্যাটার্নের root
  // cause (getDb() promise-cache ফিক্সের (এন্ট্রি ৫৭) পরেও persist করছিল, কারণ
  // ওটা শুধু *সমান্তরাল duplicate* init রেস আটকেছিল, প্রতিটা single init-এর
  // ভেতরের এই sequential ALTER খরচ কমায়নি)।
  //
  // ফিক্স: ব্লাইন্ডলি ১৩ বার ALTER চেষ্টা না করে, প্রতিটা টেবিলের জন্য একবার
  // PRAGMA table_info() দিয়ে আসলেই কী কলাম আছে তা পড়ে নিয়ে শুধু সত্যিই
  // অনুপস্থিত কলামের জন্যই ALTER চালানো হচ্ছে। PRAGMA table_info() একটা টেবিল
  // এখনো তৈরি না হলে (একেবারে নতুন DB) খালি রেজাল্ট দেয় (এরর থ্রো করে না) —
  // সেক্ষেত্রে কলাম-সেট খালি থাকবে, needed[] থেকে কিছুই ALTER হবে না (ঠিক
  // আগের try/catch-এর "no such table" নিরাপদ-স্কিপ আচরণের মতোই), কারণ নিচের
  // CREATE TABLE IF NOT EXISTS-এই কলামগুলো থাকবে। পুরনো ইনস্টলে এখন থেকে
  // প্রতিটা বুটে ৩টা fast metadata query (SELECT না, তাই সস্তা) + দরকার হলে
  // শুধু সত্যিকারের অনুপস্থিত কলামের ALTER — সাধারণত ০টা।
  const _existingCols = async (table) => {
    try {
      const res = await db.query(`PRAGMA table_info(${table});`);
      return new Set((res.values || []).map((r) => r.name));
    } catch (_) {
      return new Set(); // টেবিল/কোয়েরি সমস্যা হলে খালি সেট — নিচের CREATE TABLE-ই ভরসা
    }
  };
  const _addMissingCols = async (table, colDefs) => {
    const existing = await _existingCols(table);
    for (const [col, ddlType] of colDefs) {
      if (existing.has(col)) continue;
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddlType};`);
      } catch (_) { /* নিরাপদ — রেস/টেবিল-না-থাকা এজ কেস, CREATE TABLE-ই ভরসা */ }
    }
  };
  // এন্ট্রি ৩০/৩৬/৪০/৪১/৪৪ — products টেবিলের সব incremental কলাম একসাথে চেক
  await _addMissingCols("products", [
    ["demand_type", "TEXT"],
    ["min_stock_alert", "REAL"],
    ["nearest_expiry_date", "TEXT"],
    ["supplier_key", "TEXT"],
    ["product_type", "TEXT"],
    ["category", "TEXT"],
    ["browse_rank", "TEXT"],
    ["supplier_due_key", "TEXT"],
    ["supplier_due_raw", "TEXT"],
    ["dosage_form", "TEXT"],
  ]);
  // এন্ট্রি ৪১ — purchaseOrders টেবিলের supplier due-map কলামগুলো
  await _addMissingCols("purchaseOrders", [
    ["supplier_due_key", "TEXT"],
    ["supplier_due_raw", "TEXT"],
    ["purchase_amount", "REAL"],
  ]);
  // এন্ট্রি ৫৭ — Customers RFM/LTV cutover-এর জন্য txns.customer_id (CREATE
  // INDEX ... (customer_id, ...) নিচের restOfSchema execute()-এ চলে বলে কলাম
  // আগে থাকা আবশ্যক)
  await _addMissingCols("txns", [["customer_id", "TEXT"]]);
  // এন্ট্রি ৬৬ — Invoice history payType ফিল্টার SQL-WHERE-এ পুশ করার জন্য পুরনো ইনস্টলে কলাম-অ্যাড
  await _addMissingCols("invoices", [["pay_type", "TEXT"]]);
  // schema.sql-এ multiple statements আছে — execute() মাল্টি-স্টেটমেন্ট সাপোর্ট করে
  await db.execute(restOfSchema);

  // (cache-সেট এখন getDb() wrapper-এই হয় — এখানে সরাসরি সেট করার দরকার নেই)
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

// 🆕 এন্ট্রি ৩৬ (ধাপ ২) — App.jsx-এর getExpiredBatchesOf()/getSortedActiveBatches()-এর
// সাথে সামঞ্জস্যপূর্ণ: qty>0 এমন সব ব্যাচের (এক্সপায়ার্ড হোক বা না হোক) মধ্যে
// সবচেয়ে কাছের expiryDate বের করা — legacy পণ্যে (batches নেই) top-level
// expiryDate ফলব্যাক। এটা রিড-টাইমে কোনো "এক্সপায়ার্ড কি না" সিদ্ধান্ত নেয় না,
// শুধু raw তারিখ — তাই কখনো stale হয় না (schema.sql-এর কমেন্ট দ্রষ্টব্য)।
function computeNearestExpiryDate(p) {
  if (p.batches && p.batches.length > 0) {
    let soonest = null;
    for (const b of p.batches) {
      if ((b.qty || 0) <= 0 || !b.expiryDate) continue;
      if (soonest === null || new Date(b.expiryDate).getTime() < new Date(soonest).getTime()) soonest = b.expiryDate;
    }
    return soonest;
  }
  if (p.expiryDate && (p.stock || 0) > 0) return p.expiryDate;
  return null;
}

// 🆕 এন্ট্রি ৪০ (ধাপ ৫, POS picker) — App.jsx SmartInvoiceBuilder-এর
// isProductUnavailable() + demandType-এর দুই-ধাপের stable sort-এর ঠিক একই
// ফলাফল দেয় এমন একটা single tier digit (schema.sql-এর browse_rank কমেন্ট
// দ্রষ্টব্য) — App.jsx-এর isProductUnavailable() ফাংশনের সাথে বাইট-বাই-বাইট
// মিলিয়ে রাখা জরুরি (দুই জায়গায় ভিন্ন হলে picker-এর ক্রম আসল availability-র
// সাথে না মেলার ঝুঁকি — যদিও নিচে ব্যাখ্যা করা হয়েছে যে ক্রম ভুল হলেও আসল
// বিক্রি-ব্লকিং লজিক প্রভাবিত হয় না, কারণ সেটা সবসময় live product data থেকে চলে)।
export function computeBrowseTier(p) {
  const unavailable = p.productType !== "service" && p.stock !== undefined && getSellableStock(p) <= 0;
  const uncommon = (p.demandType || "common") === "uncommon";
  return (unavailable ? 2 : 0) + (uncommon ? 1 : 0);
}

// browse_rank = tier digit + name — একক TEXT কলাম, lexicographic sort দিয়েই
// টিয়ার-তারপর-নাম অর্ডার পাওয়া যায় (schema.sql-এর কমেন্ট দ্রষ্টব্য)।
export function computeBrowseRank(p) {
  return `${computeBrowseTier(p)}${p.name ?? ""}`;
}

// 🆕 এন্ট্রি ৪১ (ধাপ ৬, computeSupplierDueMap) — logic.js-এর computeSupplierDueMap()-এর
// ঠিক একই raw-name resolution + amount গণনা, শুধু extract() টাইমে JS-এ প্রিকম্পিউট
// করে ফ্ল্যাট কলামে বসানো হচ্ছে (schema.sql-এর "supplier due-map" কমেন্ট দ্রষ্টব্য)।
// প্রতিটা হেল্পার নিজে থেকেই null/"" রিটার্ন করে raw name খালি হলে (JS-এর
// "if (!name) return;" early-return-এর সাথে মিলিয়ে — SQL WHERE ক্লজে
// supplier_due_key IS NOT NULL AND supplier_due_key != '' দিয়ে বাদ দেওয়া হয়)।
function productSupplierDueRaw(p) {
  return (p.company || p.supplier || "").trim();
}
function poSupplierDueRaw(po) {
  return (po.supplier || po.company || "").trim();
}
function paymentSupplierDueRaw(pay) {
  return (pay.supplierName || "").trim();
}
function supplierDueKeyOf(raw) {
  return raw ? (normalizeSupplierKey(raw) || raw.toLowerCase()) : null;
}
// (po.items||[]).reduce((s,it)=>s+(it.qty||0)*(it.costPrice||it.price||0),0) —
// logic.js-এর computeSupplierDueMap()-এর ঠিক একই এক্সপ্রেশন
function poPurchaseAmount(po) {
  return (po.items || []).reduce((s, it) => s + (it.qty || 0) * (it.costPrice || it.price || 0), 0);
}

const HOT_FIELDS = {
  products: {
    columns: [
      "id", "name", "name_norm", "barcode", "stock", "cost_price", "price", "updated_at", "deleted", "demand_type",
      "min_stock_alert", "nearest_expiry_date", "supplier_key", // 🆕 এন্ট্রি ৩৬ (ধাপ ২)
      "product_type", "category", "browse_rank", // 🆕 এন্ট্রি ৪০ (ধাপ ৫)
      "supplier_due_key", "supplier_due_raw", // 🆕 এন্ট্রি ৪১ (ধাপ ৬)
      "dosage_form", // 🆕 এন্ট্রি ৪৪ (৭.৩-এর ব্লকার)
    ],
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
      p.demandType ?? null, // 🆕 এন্ট্রি ৩০ — NULL হলে queryPage()-এর WHERE ক্লজে "common" হিসেবে ট্রিট হয় (JS p.demandType||"common" ডিফল্টের সাথে মিলিয়ে)
      numOrNull(p.minStockAlert), // 🆕 এন্ট্রি ৩৬ — NULL হলে কোয়েরিতে COALESCE(min_stock_alert, 5) (JS p.minStockAlert||5-এর সাথে মিলিয়ে)
      computeNearestExpiryDate(p), // 🆕 এন্ট্রি ৩৬
      p.company || p.category || "অজ্ঞাত", // 🆕 এন্ট্রি ৩৬ — App.jsx-এর productsBySupplier/supplierMap-এর ঠিক একই key logic
      p.productType ?? null, // 🆕 এন্ট্রি ৪০
      p.category ?? null, // 🆕 এন্ট্রি ৪০
      computeBrowseRank(p), // 🆕 এন্ট্রি ৪০
      (() => { const r = productSupplierDueRaw(p); return supplierDueKeyOf(r); })(), // 🆕 এন্ট্রি ৪১
      productSupplierDueRaw(p) || null, // 🆕 এন্ট্রি ৪১
      (p.dosageForm || "").trim() || null, // 🆕 এন্ট্রি ৪৪
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
    columns: ["id", "invoice_no", "date_key", "customer_id", "status", "total", "created_at", "pay_type"], // 🆕 এন্ট্রি ৬৬
    extract: (inv) => [
      String(inv.id),
      inv.invoiceNo ?? null,
      inv.dateKey ?? dateKeyFromTs(inv.createdAt),
      inv.customerId ? String(inv.customerId) : null,
      inv.status ?? "active",
      numOrNull(inv.total),
      inv.createdAt ?? Date.now(),
      inv.payType ?? null, // 🆕 এন্ট্রি ৬৬
    ],
  },
  // 🆕 এন্ট্রি ৩৭ — useKpiStats-এর ৫টা ডেটা-সোর্সের প্রথমটা (schema.sql-এর কমেন্ট দ্রষ্টব্য)
  expenses: {
    columns: ["id", "category", "amount", "date_key", "updated_at"],
    extract: (e) => [
      String(e.id),
      e.category ?? null,
      numOrNull(e.amount),
      e.dateKey ?? e.date ?? null,
      e.updatedAt ?? null,
    ],
  },
  // 🆕 এন্ট্রি ৩৮ — বাকি ৪টা ডেটা-সোর্স (schema.sql-এর কমেন্ট দ্রষ্টব্য)
  cashLogs: {
    columns: ["id", "type", "amount", "date_key", "updated_at"],
    extract: (c) => [
      String(c.id),
      c.type ?? null,
      numOrNull(c.amount),
      c.dateKey ?? null,
      c.createdAt ?? null,
    ],
  },
  purchaseOrders: {
    columns: ["id", "entry_type", "total_cost", "date_key", "updated_at", "supplier_due_key", "supplier_due_raw", "purchase_amount"],
    extract: (p) => [
      String(p.id),
      p._type ?? null,
      numOrNull(p.totalCost),
      // App.jsx-এর "p.dateKey === todayKey || (p.createdAt && p.createdAt.startsWith(todayKey))"
      // ফলব্যাক লজিকের সাথে সামঞ্জস্যপূর্ণ — dateKey না থাকলে createdAt-এর প্রথম ১০ ক্যারেক্টার
      // (YYYY-MM-DD অংশ) date_key কলামে বসানো হচ্ছে, যাতে পরে শুধু exact-match WHERE দিয়েই
      // দুটো ক্ষেত্রই কভার হয়।
      p.dateKey ?? (p.createdAt ? String(p.createdAt).slice(0, 10) : null),
      p.at ?? p.createdAt ?? null,
      (() => { const r = poSupplierDueRaw(p); return supplierDueKeyOf(r); })(), // 🆕 এন্ট্রি ৪১
      poSupplierDueRaw(p) || null, // 🆕 এন্ট্রি ৪১
      poPurchaseAmount(p), // 🆕 এন্ট্রি ৪১
    ],
  },
  txns: {
    columns: ["id", "type", "source", "amount", "invoice_id", "customer_id", "date_key", "updated_at"],
    extract: (t) => [
      String(t.id),
      t.type ?? null,
      t.source ?? null,
      numOrNull(t.amount),
      t.invoiceId != null ? String(t.invoiceId) : null,
      t.customerId != null ? String(t.customerId) : null, // 🆕 এন্ট্রি ৫৭ — RFM/LTV cutover
      t.dateKey ?? null,
      t.time ?? null,
    ],
  },
  returns: {
    columns: ["id", "invoice_id", "refund_amount", "cost_price", "qty", "refund_mode", "date_key", "updated_at"],
    extract: (r) => [
      String(r.id),
      r.invoiceId != null ? String(r.invoiceId) : null,
      numOrNull(r.refundAmount),
      numOrNull(r.costPrice),
      numOrNull(r.qty),
      r.refundMode ?? null,
      r.dateKey ?? null,
      r.createdAt ?? null,
    ],
  },
  // 🆕 এন্ট্রি ৩৯ — useKpiStats-এর monthExpiredValue/monthExpiredCount-এর জন্য
  // (schema.sql-এর কমেন্ট দ্রষ্টব্য — শুধু source='expired_removal' প্রাসঙ্গিক)
  stockMovements: {
    columns: ["id", "source", "month_key", "value", "updated_at"],
    extract: (mv) => [
      String(mv.id),
      mv.source ?? null,
      mv.monthKey ?? (mv.dateKey ? String(mv.dateKey).slice(0, 7) : null),
      numOrNull(mv.value),
      mv.at ?? null,
    ],
  },
  // 🆕 এন্ট্রি ৪১ (ধাপ ৬, SupplierPaymentModule) — schema.sql-এর "supplier due-map" কমেন্ট দ্রষ্টব্য
  supplierPayments: {
    columns: ["id", "supplier_due_key", "supplier_due_raw", "type", "amount", "signed_amount", "date_key", "updated_at"],
    extract: (pay) => [
      String(pay.id),
      (() => { const r = paymentSupplierDueRaw(pay); return supplierDueKeyOf(r); })(),
      paymentSupplierDueRaw(pay) || null,
      pay.type ?? null,
      numOrNull(pay.amount),
      // logic.js-এর computeSupplierDueMap()-এর ঠিক একই sign convention: due → ঋণাত্মক, payment → ধনাত্মক
      pay.type === "due" ? -(pay.amount || 0) : (pay.amount || 0),
      pay.dateKey ?? null,
      pay.createdAt ?? null,
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

// 🆕 এন্ট্রি ৯৮ (Phase ৩ রোডম্যাপ ধাপ ৩ প্রিরিকুইজিট — never-load bulk-scan
// কল-সাইট কনভার্সন, টাকা-সংশ্লিষ্ট ২টা সাইটের ১ম) — নতুন কাস্টমার তৈরি/এডিটে
// ডুপ্লিকেট-মোবাইল চেক আগে `customers.find(c => c.mobile === mobile)` দিয়ে
// হতো — raw in-memory array-নির্ভর, never-load ফ্ল্যাগ চালু হলে (customers
// array চিরস্থায়ী খালি) এই চেক নীরবে সবসময় "না পাওয়া" রিটার্ন করত, ফলে
// ডুপ্লিকেট কাস্টমার রেকর্ড তৈরি হতে পারত। `mobile` কলামে indexed
// (`idx_customers_mobile`) — SQL lookup সস্তা। excludeId (এডিট-মোডে নিজের
// id বাদ দিতে) JS-সাইডে ফিল্টার হয়, কারণ মোবাইল নম্বরে সাধারণত ডুপ্লিকেট ১-২টার
// বেশি হয় না বলে row-level ফিল্টারের প্রয়োজন নেই, deleted=0 চেক SQL-সাইডেই।
// রিটার্ন করে প্রথম ম্যাচ (বা null) — কলার শুধু "আছে কিনা + কার নাম" জানতে চায়,
// আসল UI (customers.find) যেমন করত ঠিক তেমনই।
// 🆕 এন্ট্রি ৯৮ (Phase ৩ ধাপ ৩ প্রিরিকুইজিট, বাকি ৯টা সাইটের বাকি অংশ) — Dashboard/
// SmsLog/বাল্ক-SMS রিমাইন্ডার লিস্টের `customers.filter(c => c.balance > 0)`
// সাইটগুলো raw array-নির্ভর ছিল। `balance` কলাম আগে থেকেই আছে (schema.sql),
// তাই সরাসরি ইনডেক্সড WHERE — getInventoryList()-এর প্যাটার্নে। `deleted = 0`
// চেক করা হয় (আসল JS filter ডিলিটেড কাস্টমার দেখাতো না, কারণ ডিলিটেড
// কাস্টমার `customers` array-তেই থাকে না)।
export async function getBakiCustomers(businessType) {
  const db = await getDb(businessType);
  const res = await db.query(`SELECT data FROM customers WHERE deleted = 0 AND balance > 0`, []);
  return (res.values || []).map((r) => JSON.parse(r.data));
}

export async function getCustomerByMobile(businessType, mobile, excludeId = null) {
  const db = await getDb(businessType);
  const res = await db.query(
    `SELECT data FROM customers WHERE mobile = ? AND deleted = 0`,
    [String(mobile)]
  );
  for (const row of res.values || []) {
    const rec = JSON.parse(row.data);
    if (excludeId != null && String(rec.id) === String(excludeId)) continue;
    return rec; // প্রথম ম্যাচ যথেষ্ট — আসল customers.find() আচরণ
  }
  return null;
}

// 🆕 এন্ট্রি ৭৩ (রিকনসিলিয়েশন অডিট, বহু-সেশন "products SQLite-primary" ফেজের
// ধাপ ১) — SQLite dual-write টেবিল বনাম বর্তমান in-memory অ্যারে (IndexedDB
// blob-array থেকে আসা, এখনো একমাত্র সোর্স-অফ-ট্রুথ)-এর মধ্যে content-level
// পার্থক্য খুঁজে বের করে। সম্পূর্ণ read-only — কোনো write করে না, ১০০% নিরাপদ,
// প্রোডাকশন ডেটার কোনো ঝুঁকি নেই।
//
// কী তুলনা করে: প্রতিটা id-এর জন্য SQLite row-এর `data` কলাম (JSON) বনাম
// in-memory রেকর্ডের JSON.stringify() — upsert()/upsertMany() ঠিক এই একই
// JSON.stringify(record) SQLite-এ লেখে, তাই সফলভাবে সিঙ্কড রেকর্ডে এই দুটো
// স্ট্রিং বিট-বাই-বিট মিলে যাওয়ার কথা।
//
// রিটার্ন করে { totalArr, totalSql, missingInSql, extraInSql, mismatched, matched }:
// - missingInSql: array-তে আছে (deleted না), SQLite-এ নেই/deleted=1 — dualWriteSqlite()-এর
//   আগের (এন্ট্রি ৭৩-এ ফিক্সড) বাগের ঠিক এই সিম্পটম, ব্যর্থ upsert চিরস্থায়ী ড্রিফট
// - extraInSql: SQLite-এ আছে (deleted না), array-তে নেই — সাধারণত ব্যর্থ delete-sync
// - mismatched: দুই জায়গাতেই আছে কিন্তু JSON কনটেন্ট আলাদা
// প্রতিটা ক্যাটাগরিতে সর্বোচ্চ ২০টা id sample ফেরত (পুরো তালিকা না — বড় দোকানে
// হাজার হাজার id UI-তে দেখানো ভারী/অর্থহীন)।
// ⚠️ পুরো টেবিল স্ক্যান করে — products-এর (~১ লাখ টার্গেট স্কেল) জন্য ডিজাইন করা,
// invoices/txns-এর মতো কোটি-স্কেল টেবিলে সরাসরি ব্যবহার করা উচিত না।
export async function reconcileStore(businessType, store, currentArr) {
  const db = await getDb(businessType);
  const res = await db.query(`SELECT id, deleted, data FROM ${store}`, []);
  const sqlRows = res.values || [];
  const sqlById = new Map(sqlRows.map((r) => [String(r.id), r]));

  const arrById = new Map();
  for (const item of (currentArr || [])) {
    if (!item || item.id == null) continue;
    arrById.set(String(item.id), item);
  }

  const missingInSql = [];
  const mismatched = [];
  let matched = 0;
  for (const [id, item] of arrById) {
    const row = sqlById.get(id);
    if (!row || row.deleted) { missingInSql.push(id); continue; }
    if (row.data !== JSON.stringify(item)) { mismatched.push(id); } else { matched++; }
  }

  const extraInSql = [];
  for (const [id, row] of sqlById) {
    if (row.deleted) continue;
    if (!arrById.has(id)) extraInSql.push(id);
  }

  const cap = (list) => list.slice(0, 20);
  return {
    totalArr: arrById.size,
    totalSql: sqlRows.filter((r) => !r.deleted).length,
    missingInSql: { count: missingInSql.length, sample: cap(missingInSql) },
    extraInSql: { count: extraInSql.length, sample: cap(extraInSql) },
    mismatched: { count: mismatched.length, sample: cap(mismatched) },
    matched,
  };
}

// ── এন্ট্রি ৪২ (ধাপ ৭ প্রস্তুতি) — ব্যাচ id-লুকআপ ──────────────────────────
// কেন দরকার: getById() একবারে ১টা রেকর্ডই আনে — POS পিকার/Products লিস্ট
// পেজিনেটেড ভিউতে (queryPage()) প্রতি পেজে ৫০-১০০টা id ফেরত আসে, সেই id-গুলোর
// জন্য পূর্ণ product অবজেক্ট রেন্ডার করতে হলে getById() ৫০-১০০ বার আলাদা query()
// কল করলে (n+1 প্যাটার্ন) real device-এ (limited I/O) স্লো হতে পারে। এই ফাংশন
// একটাই `WHERE id IN (...)` কোয়েরিতে সবগুলো রেকর্ড আনে।
//
// ⚠️ SQLite-এ একটাই statement-এ প্যারামিটারাইজড `IN (...)`-এর ডিফল্ট সীমা আছে
// (SQLITE_MAX_VARIABLE_NUMBER, সাধারণত ৯৯৯-৩২৭৬৬ বিল্ড-নির্ভর) — বড় id-লিস্টে
// নিরাপদ থাকতে CHUNK_SIZE-এ ভেঙে একাধিক কোয়েরি চালানো হচ্ছে, ফলাফল একসাথে
// জোড়া লাগানো হচ্ছে।  রিটার্ন-অর্ডার ইনপুট id-লিস্টের অর্ডারের সাথে মিলিয়ে
// দেওয়া হয় (কলার সাধারণত queryPage()-এর id-অর্ডার বজায় রাখতে চাইবে)।
const GET_BY_IDS_CHUNK_SIZE = 500;

export async function getByIds(businessType, store, ids) {
  const uniqueIds = [...new Set((ids || []).map(String))];
  if (uniqueIds.length === 0) return [];

  const db = await getDb(businessType);
  const byId = new Map();

  for (let i = 0; i < uniqueIds.length; i += GET_BY_IDS_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + GET_BY_IDS_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const res = await db.query(`SELECT data FROM ${store} WHERE id IN (${placeholders})`, chunk);
    for (const row of res.values || []) {
      const rec = JSON.parse(row.data);
      byId.set(String(rec.id), rec);
    }
  }

  // ইনপুট অর্ডার বজায় রাখা হচ্ছে (কলার-এক্সপেক্টেশন), না-পাওয়া id চুপচাপ বাদ
  return uniqueIds.map((id) => byId.get(id)).filter(Boolean);
}

// 🆕 এন্ট্রি ৭৫ (products SQLite-primary, ধাপ ৪ প্রস্তুতি — ব্যাকআপ পাথ redesign) —
// পুরো টেবিলের সব (non-deleted) রেকর্ড একসাথে ফেরত দেয়, `getByIds()`-এর মতোই
// chunked (মেমরিতে সব রেজাল্ট জমা করেই রিটার্ন, কিন্তু SQL কোয়েরি নিজে batch-এ
// চলে, খুব বড় টেবিলেও একটামাত্র statement-এ আটকে থাকে না)।
//
// **কেন দরকার**: `buildBackupData()` (App.jsx) IndexedDB/Drive/snapshot ব্যাকআপের
// জন্য এতদিন সরাসরি in-memory `products` React state থেকে পড়ত। `sbm_products_boot_lazy`
// ফ্ল্যাগ ভবিষ্যতে "সত্যিকারভাবে কখনো পুরোপুরি লোড না করা"-য় আপগ্রেড হলে সেই
// state আর কখনো সম্পূর্ণ নাও থাকতে পারে — তখন backup নীরবে অসম্পূর্ণ/খালি হয়ে
// যেত। এই ফাংশন backup-কে products state-নির্ভরতা থেকে মুক্ত করে — SQLite-ই
// (dual-write reconcile করে ইতিমধ্যে প্রমাণিত সোর্স, দেখুন entry ৭৩) সরাসরি সোর্স
// হিসেবে ব্যবহার করা যায়, products in-memory-তে যতটুকুই থাকুক না কেন।
const GET_ALL_ROWS_CHUNK_SIZE = 2000;

export async function getAllRows(businessType, store) {
  const db = await getDb(businessType);
  const rows = [];
  let lastId = "";
  // 🔴 কেন id-cursor keyset (OFFSET না): queryPage()-এর ঠিক একই কারণ — বড়
  // টেবিলে (১ লাখ+ products) OFFSET স্ক্যান-অ্যান্ড-ডিসকার্ড ধীর হয়ে যায়।
  // id-তে ইতিমধ্যে PRIMARY KEY ইনডেক্স আছে (schema.sql), তাই এক্সট্রা ইনডেক্স
  // লাগে না।
  for (;;) {
    const res = await db.query(
      `SELECT data, id FROM ${store} WHERE deleted = 0 AND id > ? ORDER BY id ASC LIMIT ?`,
      [lastId, GET_ALL_ROWS_CHUNK_SIZE]
    );
    const batch = res.values || [];
    if (batch.length === 0) break;
    for (const row of batch) rows.push(JSON.parse(row.data));
    lastId = String(batch[batch.length - 1].id);
    if (batch.length < GET_ALL_ROWS_CHUNK_SIZE) break;
  }
  return rows;
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

// ── এন্ট্রি ৩৬ (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ২) ──────────────────
// InventorySection-এর KPI কাউন্ট + ডিটেইল লিস্ট + সাপ্লায়ার-গ্রুপিং — এখন সরাসরি
// SQL থেকে। ⚠️ এই সব ফাংশন `deleted = 0` ধরে নেয় (App.jsx-এর মূল products state
// আসলে soft-deleted রেকর্ড বাদ দিয়েই পাস হয়, তাই এখানে explicit ফিল্টার মিলিয়ে
// রাখা হলো — dual-write ফেজে দুই পাথে ফলাফল না মেলার ঝুঁকি এড়াতে)।

// exception-list (কম-স্টক/স্টক-আউট/মেয়াদোত্তীর্ণ) সাধারণত ছোট হয় বাস্তব দোকানে,
// কিন্তু নিরাপত্তার জন্য একটা ক্যাপ — এর বেশি হলে শুধু প্রথম N-টা রিটার্ন হবে।
const INVENTORY_LIST_LIMIT = 5000;

/**
 * ৩টা KPI কার্ডের কাউন্ট + স্টক মূল্য — একটা কোয়েরিতে conditional SUM, ৩টা
 * আলাদা COUNT() না। 🆕 এন্ট্রি ৩৯ — stock_value যোগ হলো (useKpiStats-এর
 * stockValue-এর জন্য, App.jsx-এর "p.costPrice || p.price || 0) * (p.stock || 0)"
 * ফলব্যাক লজিকের CASE-WHEN সমতুল্য — costPrice শূন্য/NULL হলে price, সেটাও না
 * থাকলে ০)। critical কাউন্টই useKpiStats-এর lowStockItems.length-এর সমতুল্য
 * (একই "stock>0 AND stock<=minStockAlert" শর্ত — তাই আলাদা কোনো নতুন কাউন্ট
 * লাগেনি)। 🆕 এন্ট্রি ৪৬ — total_count যোগ হলো (AIPage_-এর prodAll.length-এর
 * SQL সমতুল্য, allStock+stockOut যোগ করেও বের করা যেত কিন্তু এক্সপ্লিসিট
 * COUNT(*) স্পষ্ট এবং ভবিষ্যতে soft-delete/deleted শর্ত বদলালেও নিরাপদ)।
 */
export async function getInventoryCounts(businessType) {
  const db = await getDb(businessType);
  const sql = `
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) AS all_stock_count,
      SUM(CASE WHEN stock > 0 AND stock <= COALESCE(min_stock_alert, 5) THEN 1 ELSE 0 END) AS critical_count,
      SUM(CASE WHEN stock IS NULL OR stock = 0 THEN 1 ELSE 0 END) AS stock_out_count,
      SUM(COALESCE(NULLIF(cost_price, 0), NULLIF(price, 0), 0) * COALESCE(stock, 0)) AS stock_value
    FROM products WHERE deleted = 0
  `;
  const res = await db.query(sql);
  const row = res.values?.[0] || {};
  return {
    totalCount: row.total_count || 0,
    allStock: row.all_stock_count || 0,
    critical: row.critical_count || 0,
    stockOut: row.stock_out_count || 0,
    stockValue: row.stock_value || 0,
  };
}

/**
 * 🆕 এন্ট্রি ৯৪ (Phase ৩ রোডম্যাপ ধাপ ১, Category B — customers aggregate
 * cutover)। getInventoryCounts()-এর ঠিক একই COUNT/SUM-CASE প্যাটার্ন —
 * totalBaki, bakiCount, clearCount তিনটাই এক কোয়েরিতে। `balance` কলাম
 * ইতিমধ্যে সরাসরি ইনডেক্সড না হলেও `deleted`-এ ইনডেক্স আছে, আর টেবিলে
 * customer সংখ্যা products-এর তুলনায় ছোট (~১০-২০ হাজার টার্গেট), তাই
 * সরাসরি WHERE deleted=0 স্ক্যানই যথেষ্ট দ্রুত।
 * ⚠️ total_baki আসল App.jsx কল-সাইটের সাথে মিলিয়ে RAW sum (নেগেটিভ
 * ব্যালেন্স/অগ্রিম পেমেন্টও অন্তর্ভুক্ত) — শুধু পজিটিভ-only sum না, কারণ
 * বর্তমান dashboard-এর totalBaki ঠিক এই আচরণই দেখায় (`customers.reduce((s,c)
 * => s + (c.balance||0), 0)`)। bakiCount/clearCount অবশ্য >０/≤０ শর্তেই।
 */
export async function getCustomerBakiSummary(businessType) {
  const db = await getDb(businessType);
  const sql = `
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END) AS baki_count,
      SUM(CASE WHEN balance <= 0 THEN 1 ELSE 0 END) AS clear_count,
      SUM(COALESCE(balance, 0)) AS total_baki
    FROM customers WHERE deleted = 0
  `;
  const res = await db.query(sql);
  const row = res.values?.[0] || {};
  return {
    totalCount: row.total_count || 0,
    bakiCount: row.baki_count || 0,
    clearCount: row.clear_count || 0,
    totalBaki: row.total_baki || 0,
  };
}


/**
 * ডিটেইল লিস্ট — 'all' | 'critical' | 'out'। allStock App.jsx-এর মূল আচরণ
 * (stock DESC সর্ট) বজায় রাখে; critical/out আগের মতোই আনসর্টেড।
 */
export async function getInventoryList(businessType, kind, opts = {}) {
  const { limit = INVENTORY_LIST_LIMIT } = opts;
  const db = await getDb(businessType);
  let where, orderBy = "";
  if (kind === "all") { where = "deleted = 0 AND stock > 0"; orderBy = "ORDER BY stock DESC"; }
  else if (kind === "critical") { where = "deleted = 0 AND stock > 0 AND stock <= COALESCE(min_stock_alert, 5)"; }
  else if (kind === "out") { where = "deleted = 0 AND (stock IS NULL OR stock = 0)"; }
  else throw new Error(`getInventoryList(): অজানা kind "${kind}"`);
  const sql = `SELECT data FROM products WHERE ${where} ${orderBy} LIMIT ?`;
  const res = await db.query(sql, [limit]);
  return (res.values || []).map((r) => JSON.parse(r.data));
}

/**
 * 🆕 এন্ট্রি ৭২ (৭.৩, POS-বহির্ভূত) — BatchSyncTool-এর "লস-ঝুঁকি পণ্য" ট্যাবের
 * জন্য: বিক্রয়মূল্য ≤ ক্রয়মূল্য এমন পণ্য (নেগেটিভ/শূন্য মার্জিন)। এটা genuine
 * FULL-SCAN (কোন পণ্যগুলো ঝুঁকিপূর্ণ তা *খুঁজে বের করতে হয়*, বাউন্ডেড id-সেট
 * দিয়ে সম্ভব না) — তাই getInventoryList()-এর মতোই SQL WHERE + margin অনুযায়ী
 * ORDER BY। App.jsx-এর JS ফলব্যাক লজিকের সাথে শর্ত হুবহু মিলিয়ে রাখা হয়েছে:
 * productType !== "service" && costPrice > 0 && price > 0 && price <= costPrice,
 * sort by margin ascending (সবচেয়ে খারাপ মার্জিন আগে)।
 */
export async function getRiskProducts(businessType, opts = {}) {
  const { limit = INVENTORY_LIST_LIMIT } = opts;
  const db = await getDb(businessType);
  const sql = `
    SELECT data FROM products
    WHERE deleted = 0 AND (product_type IS NULL OR product_type != 'service')
      AND cost_price > 0 AND price > 0 AND price <= cost_price
    ORDER BY (price - cost_price) ASC
    LIMIT ?
  `;
  const res = await db.query(sql, [limit]);
  return (res.values || []).map((r) => JSON.parse(r.data));
}

/**
 * মেয়াদোত্তীর্ণ/মেয়াদ-শেষের-কাছাকাছি ব্যাচের জন্য candidate সেট — শুধু
 * `nearest_expiry_date` কলামে ইনডেক্স-সিক করে narrow করা, আসল ব্যাচ-লেভেল
 * এক্সপায়ার্ড/near-expiry বিভাজন App.jsx-এর বিদ্যমান JS লজিকেই (getExpiredBatchesOf
 * ইত্যাদি) হবে — এই ছোট candidate অ্যারের উপর, পুরো products-এর উপর না।
 * @param {number} [opts.monthsAhead=3] - near-expiry উইন্ডো (App.jsx-এর threeMonthsLater-এর সাথে মিলিয়ে)
 */
export async function getExpiryCandidates(businessType, opts = {}) {
  const { monthsAhead = 3, limit = INVENTORY_LIST_LIMIT } = opts;
  const db = await getDb(businessType);
  const bound = new Date();
  bound.setMonth(bound.getMonth() + monthsAhead);
  const boundStr = bound.toISOString().slice(0, 10);
  const sql = `SELECT data FROM products WHERE deleted = 0 AND nearest_expiry_date IS NOT NULL AND nearest_expiry_date <= ? LIMIT ?`;
  const res = await db.query(sql, [boundStr, limit]);
  return (res.values || []).map((r) => JSON.parse(r.data));
}

/** 'supplier' পেজ — প্রতি সাপ্লায়ারের count/stock/out/low, GROUP BY supplier_key। */
export async function getSupplierSummary(businessType) {
  const db = await getDb(businessType);
  const sql = `
    SELECT
      supplier_key AS name,
      COUNT(*) AS count,
      SUM(COALESCE(stock, 0)) AS stock,
      SUM(CASE WHEN stock IS NULL OR stock = 0 THEN 1 ELSE 0 END) AS out_count,
      SUM(CASE WHEN stock > 0 AND stock <= COALESCE(min_stock_alert, 5) THEN 1 ELSE 0 END) AS low_count
    FROM products
    WHERE deleted = 0
    GROUP BY supplier_key
    ORDER BY count DESC
  `;
  const res = await db.query(sql);
  return res.values || [];
}

/** 'supplier-detail' পেজ — একটা নির্দিষ্ট সাপ্লায়ারের সব পণ্য। */
export async function getProductsBySupplierKey(businessType, supplierKey, opts = {}) {
  const { limit = INVENTORY_LIST_LIMIT } = opts;
  const db = await getDb(businessType);
  const sql = `SELECT data FROM products WHERE deleted = 0 AND supplier_key = ? LIMIT ?`;
  const res = await db.query(sql, [supplierKey, limit]);
  return (res.values || []).map((r) => JSON.parse(r.data));
}

// ── এন্ট্রি ৩৭ (useKpiStats windowing-দরকার-নেই ডেটা-সোর্সগুলোর SQL cutover) ──
/**
 * date_key কলাম-ভিত্তিক জেনেরিক SUM+COUNT — আপাতত শুধু 'expenses'-এ প্রযোজ্য,
 * কিন্তু store প্যারামিটার নিয়ে ডিজাইন করা হয়েছে যাতে ভবিষ্যতে cashLogs/
 * purchaseOrders ইত্যাদি টেবিল যোগ হলে (একই date_key প্যাটার্ন থাকলে) এই একই
 * ফাংশন পুনর্ব্যবহার করা যায় — নতুন করে লিখতে না হয়।
 * @param {object} opts
 * @param {string} [opts.dateKeyExact] - ঠিক এই date_key (যেমন "আজ")
 * @param {string} [opts.dateKeyGte] - এই date_key থেকে (>=) — App.jsx-এর
 *   `monthExpense` ফিল্টার আসলে ">= monthStartKey" (মাস-প্রেফিক্স ম্যাচ না!),
 *   তাই এটা dateKeyPrefix থেকে আলাদা অপশন — নেভিগেট করা অতীত মাসের জন্য
 *   dateKeyPrefix ভুল ফলাফল দিত (শুধু ওই একমাসেই সীমাবদ্ধ করে ফেলত, যেখানে
 *   আসল JS আচরণ ওই মাস থেকে আজ পর্যন্ত সবকিছু ধরে)।
 * @param {string} [opts.dateKeyPrefix] - এই দিয়ে শুরু (LIKE 'YYYY-MM%') — শুধু
 *   তখনই ব্যবহার করুন যখন সত্যিই এক-মাসে সীমাবদ্ধ রাখা দরকার (dateKeyGte-এর
 *   থেকে ভিন্ন সিমান্টিক্স, উপরের নোট দ্রষ্টব্য)
 * @param {string} [opts.amountColumn="amount"]
 */
export async function getDateRangeAggregate(businessType, store, opts = {}) {
  const { dateKeyExact, dateKeyGte, dateKeyPrefix, amountColumn = "amount" } = opts;
  const db = await getDb(businessType);
  let where = "1=1";
  const params = [];
  if (dateKeyExact) { where += " AND date_key = ?"; params.push(dateKeyExact); }
  if (dateKeyGte) { where += " AND date_key >= ?"; params.push(dateKeyGte); }
  if (dateKeyPrefix) { where += " AND date_key LIKE ?"; params.push(dateKeyPrefix + "%"); }
  const sql = `SELECT COUNT(*) AS cnt, SUM(COALESCE(${amountColumn}, 0)) AS total FROM ${store} WHERE ${where}`;
  const res = await db.query(sql, params);
  const row = res.values?.[0] || {};
  return { count: row.cnt || 0, total: row.total || 0 };
}

// ── এন্ট্রি ৩৮ (useKpiStats-এর বাকি ৪টা ডেটা-সোর্স) ──────────────────────────
// এখানে expenses-এর জেনেরিক getDateRangeAggregate() পুনর্ব্যবহার করা হয়নি —
// এই চারটার প্রতিটাতেই একটা অতিরিক্ত type/source শর্ত বা invoices-এর সাথে
// voided-বাদ NOT EXISTS সাব-কোয়েরি লাগে, যা জেনেরিক ফাংশনটাকে অপ্রয়োজনীয়
// জটিল করে ফেলত (getInventoryCounts/getSupplierSummary-এর মতোই ডোমেইন-স্পেসিফিক
// আলাদা ফাংশন প্যাটার্ন অনুসরণ করা হলো)।

/** cashLogs — নির্দিষ্ট date_key + type-এর SUM(amount)। */
export async function getCashLogTotal(businessType, { dateKey, type }) {
  const db = await getDb(businessType);
  const res = await db.query(
    `SELECT SUM(COALESCE(amount, 0)) AS total FROM cashLogs WHERE date_key = ? AND type = ?`,
    [dateKey, type]
  );
  return res.values?.[0]?.total || 0;
}

/** purchaseOrders — 'pe' এন্ট্রির আজকের cost/count + এই মাসের cost। */
export async function getPurchaseOrderTotals(businessType, { todayKey, monthStartKey }) {
  const db = await getDb(businessType);
  const [todayRes, monthRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS cnt, SUM(COALESCE(total_cost, 0)) AS total FROM purchaseOrders WHERE entry_type = 'pe' AND date_key = ?`,
      [todayKey]
    ),
    db.query(
      `SELECT SUM(COALESCE(total_cost, 0)) AS total FROM purchaseOrders WHERE entry_type = 'pe' AND date_key >= ?`,
      [monthStartKey]
    ),
  ]);
  return {
    todayCost: todayRes.values?.[0]?.total || 0,
    todayCount: todayRes.values?.[0]?.cnt || 0,
    monthCost: monthRes.values?.[0]?.total || 0,
  };
}

/**
 * txns — todayBakiIncurred (invoice_id থাকা লাগবে, ওই ইনভয়েস voided হলে বাদ) +
 * todayJoma (source নির্দিষ্ট কিছু ভ্যালুর একটা হলে বাদ) — App.jsx-এর useKpiStats-এর
 * ঠিক একই দুই ফিল্টারের SQL সমতুল্য।
 */
export async function getTxnTotals(businessType, todayKey) {
  const db = await getDb(businessType);
  const [bakiRes, jomaRes] = await Promise.all([
    db.query(
      `SELECT SUM(COALESCE(t.amount, 0)) AS total FROM txns t
       WHERE t.date_key = ? AND t.type = 'baki' AND t.invoice_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = t.invoice_id AND i.status = 'voided')`,
      [todayKey]
    ),
    db.query(
      `SELECT SUM(COALESCE(t.amount, 0)) AS total FROM txns t
       WHERE t.date_key = ? AND t.type = 'joma'
         AND (t.source IS NULL OR t.source NOT IN ('partial-sale', 'void-reversal', 'cash-sale', 'return-adjust'))`,
      [todayKey]
    ),
  ]);
  return {
    todayBakiIncurred: bakiRes.values?.[0]?.total || 0,
    todayJoma: jomaRes.values?.[0]?.total || 0,
  };
}

/**
 * returns — today/month refund + profit-impact + today cash-refund, voided
 * ইনভয়েসের সাথে যুক্ত রিটার্ন বাদ (getVoidedInvoiceIds/filterReturnsExcludingVoided-এর
 * SQL সমতুল্য — NOT EXISTS সাব-কোয়েরি, invoice_id NULL হলে সবসময় active ধরা হয়)।
 */
export async function getReturnsTotals(businessType, { todayKey, monthStartKey }) {
  const db = await getDb(businessType);
  const activeWhere = `(r.invoice_id IS NULL OR NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = r.invoice_id AND i.status = 'voided'))`;
  const [todayRes, monthRes] = await Promise.all([
    db.query(
      `SELECT
         SUM(COALESCE(r.refund_amount, 0)) AS refund,
         SUM(COALESCE(r.refund_amount, 0) - COALESCE(r.cost_price, 0) * COALESCE(r.qty, 0)) AS profit_impact,
         SUM(CASE WHEN r.refund_mode = 'cash' THEN COALESCE(r.refund_amount, 0) ELSE 0 END) AS cash_refund
       FROM returns r WHERE r.date_key = ? AND ${activeWhere}`,
      [todayKey]
    ),
    db.query(
      `SELECT
         SUM(COALESCE(r.refund_amount, 0)) AS refund,
         SUM(COALESCE(r.refund_amount, 0) - COALESCE(r.cost_price, 0) * COALESCE(r.qty, 0)) AS profit_impact
       FROM returns r WHERE r.date_key >= ? AND ${activeWhere}`,
      [monthStartKey]
    ),
  ]);
  const t = todayRes.values?.[0] || {};
  const m = monthRes.values?.[0] || {};
  return {
    todayRefund: t.refund || 0,
    todayProfitImpact: t.profit_impact || 0,
    todayCashRefund: t.cash_refund || 0,
    monthRefund: m.refund || 0,
    monthProfitImpact: m.profit_impact || 0,
  };
}

// ── এন্ট্রি ৩৯ (useKpiStats-এর products-নির্ভর অবশিষ্ট অংশ: monthExpiredValue/Count) ──
/** stockMovements — নির্দিষ্ট মাসে সরানো মেয়াদোত্তীর্ণ ব্যাচের মোট মূল্য + সংখ্যা। */
export async function getExpiredRemovalTotals(businessType, monthKey) {
  const db = await getDb(businessType);
  const res = await db.query(
    `SELECT COUNT(*) AS cnt, SUM(COALESCE(value, 0)) AS total FROM stockMovements WHERE source = 'expired_removal' AND month_key = ?`,
    [monthKey]
  );
  const row = res.values?.[0] || {};
  return { value: row.total || 0, count: row.cnt || 0 };
}

// ── এন্ট্রি ৪৮ (AIPage_-এর ৪র্থ সাব-প্যাটার্ন, forecastData/productSales জয়েন) ──
// schema.sql-এর invoiceItems কমেন্ট-ব্লকে ডিজাইন বিস্তারিত। এখানে দুটো অংশ:
// (১) ইনভয়েস dual-write-এর পাশাপাশি লাইন-আইটেম রো লেখা/মোছা, (২) SQL অ্যাগ্রিগেট
// (productSales-এর সমতুল্য, src/logic.js-এর computeProductSales()-এর SQL সংস্করণ)।

const INVOICE_ITEM_COLS = ["id", "invoice_id", "product_name", "qty", "revenue", "cost", "date_key", "status", "updated_at"];

/**
 * একটা ইনভয়েসের সব লাইন-আইটেম রো বানায়। self-use ইনভয়েসের কোনো রো তৈরি হয় না
 * (App.jsx-এর invAll ফিল্টারের সাথে মিলিয়ে — dsRemoveInvoiceItems() দিয়ে পুরনো
 * রো (যদি থাকে, যেমন কোনো ইনভয়েস পরে self-use হিসেবে মার্ক হলে) মুছে ফেলা হয়)।
 */
function extractInvoiceItemRows(inv, prodMap) {
  if (inv.isSelfUse) return [];
  const items = inv.items || [];
  // 🔴 বাগ ফিক্স নোট (এন্ট্রি ৪৮, logic.js computeProductSales()-এর কমেন্ট দ্রষ্টব্য):
  // inv.date (M/D/YYYY ডিসপ্লে-স্ট্রিং) না, inv.dateKey (YYYY-MM-DD) ব্যবহার করা
  // হচ্ছে — cutoff তুলনার সাথে ফরম্যাট মিলিয়ে।
  const dateKey = inv.dateKey || dateKeyFromTs(inv.createdAt);
  const status = inv.status ?? "active";
  const updatedAt = inv.createdAt ?? Date.now();
  return items.map((it, idx) => ({
    id: `${inv.id}#${idx}`,
    invoice_id: String(inv.id),
    product_name: it.name ?? "",
    qty: it.qty || 1,
    revenue: calcLineDiscountedRevenue(it, items, inv.discount || 0),
    cost: (it.qty || 1) * _itemCostPrice(it, prodMap),
    date_key: dateKey,
    status,
    updated_at: updatedAt,
  }));
}

/**
 * একটা ইনভয়েসের পুরনো সব invoiceItems রো মুছে নতুন করে বসায় (full replace) —
 * এডিট/আইটেম-বদল/qty-বদল/ভয়েড — সব কেস একই পাথে কভার হয়, আলাদা partial-diff
 * লজিক লাগে না (একটা ইনভয়েসে সাধারণত অল্প কয়েকটা লাইন-আইটেম থাকে)।
 * dual-write ফেজে App.jsx-এর dualWriteInvoiceItems() থেকে কল হবে, invoices
 * dual-write-এর ঠিক পাশাপাশি (স্বাধীন, invoices টেবিলের upsert()-কে ছোঁয় না)।
 */
export async function upsertInvoiceItems(businessType, inv, prodMap) {
  const db = await getDb(businessType);
  const invoiceId = String(inv.id);
  const rows = extractInvoiceItemRows(inv, prodMap);
  const set = [{ statement: `DELETE FROM invoiceItems WHERE invoice_id = ?`, values: [invoiceId] }];
  if (rows.length) {
    const placeholders = `(${INVOICE_ITEM_COLS.map(() => "?").join(", ")})`;
    for (const r of rows) {
      set.push({
        statement: `INSERT OR REPLACE INTO invoiceItems (${INVOICE_ITEM_COLS.join(", ")}) VALUES ${placeholders}`,
        values: INVOICE_ITEM_COLS.map((c) => r[c] ?? null),
      });
    }
  }
  await db.executeSet(set);
}

/** ইনভয়েস মুছে গেলে (archiveOldInvoices() বা অন্য কোনো removal পাথ) সংশ্লিষ্ট সব লাইন-আইটেম রোও মুছে যায়। */
export async function removeInvoiceItems(businessType, invoiceId) {
  const db = await getDb(businessType);
  await db.run(`DELETE FROM invoiceItems WHERE invoice_id = ?`, [String(invoiceId)]);
}

/**
 * logic.js-এর computeProductSales()-এর SQL সমতুল্য — m1/m2/m3 (৩০/৬০/৯০-দিনের
 * রোলিং বাকেট) + rev/cost/qty (৯০-দিনের টোটাল), একই সেমান্টিক্স। cutoff
 * (d30/d60/d90, YYYY-MM-DD) কলার থেকে আসে — DataStore.js framework-agnostic
 * রাখতে "আজ কোন তারিখ" লজিক এখানে ডুপ্লিকেট করা হয়নি।
 * @returns {Promise<Array<{name, m1, m2, m3, rev, cost, qty}>>}
 */
export async function getProductSalesRows(businessType, { d30, d60, d90 }) {
  const db = await getDb(businessType);
  const sql = `
    SELECT
      product_name AS name,
      SUM(CASE WHEN date_key >= ? THEN qty ELSE 0 END) AS m1,
      SUM(CASE WHEN date_key >= ? AND date_key < ? THEN qty ELSE 0 END) AS m2,
      SUM(CASE WHEN date_key >= ? AND date_key < ? THEN qty ELSE 0 END) AS m3,
      SUM(revenue) AS rev,
      SUM(cost) AS cost,
      SUM(qty) AS qty
    FROM invoiceItems
    WHERE status = 'active' AND date_key >= ?
    GROUP BY product_name
    HAVING SUM(qty) > 0
  `;
  const res = await db.query(sql, [d30, d60, d30, d90, d60, d90]);
  return (res.values || []).map((r) => ({
    name: r.name,
    m1: r.m1 || 0,
    m2: r.m2 || 0,
    m3: r.m3 || 0,
    rev: r.rev || 0,
    cost: r.cost || 0,
    qty: r.qty || 0,
  }));
}

/**
 * worker.js-এর PREDICT_REORDER হ্যান্ডলারের SQL অংশের সমতুল্য (এন্ট্রি ৬২,
 * Phase ৩ শেষ বাকি আইটেম — reorderAlerts sales-velocity)।
 * getProductSalesRows()-এর মতোই invoiceItems-এর প্রি-কম্পিউটেড লাইন-আইটেম রো
 * থেকে ৩০-দিনের রোলিং SUM(qty), product_name-কী করে গ্রুপড — ইচ্ছাকৃতভাবে SQL-এ
 * products-এর সাথে জয়েন করা হয়নি। কারণ: invoiceItems-এ product_id নেই, শুধু
 * raw product_name (schema.sql-এর কমেন্ট, ইচ্ছাকৃত সিদ্ধান্ত), আর SQLite-এ
 * normName()-এর multi-space-collapse রেপ্লিকেট করার নির্ভরযোগ্য উপায় নেই (ঠিক
 * এই ক্লাসের bug আগে একবার FTS5 সিঙ্কে ধরা পড়েছিল, উপরের normName()-এর কমেন্ট
 * দ্রষ্টব্য) — SQL-সাইড LOWER(TRIM())-ভিত্তিক আনুমানিক ম্যাচ stale/মিসড alert
 * তৈরি করতে পারত, যা inventory-critical। তাই এখানে শুধু নাম-কী aggregate
 * ফেরত, আসল products জয়েন কলার (App.jsx হুক)-এ normName() দিয়ে হয় — এতে
 * getProductSalesRows()-এর ব্যবহারকারীদের সাথেও কনভেনশন এক থাকে।
 *
 * @returns {Promise<Array<{name, sold30}>>}
 */
export async function getReorderSalesRows(businessType, d30) {
  const db = await getDb(businessType);
  const sql = `
    SELECT product_name AS name, SUM(qty) AS sold30
    FROM invoiceItems
    WHERE status = 'active' AND date_key >= ?
    GROUP BY product_name
    HAVING SUM(qty) > 0
  `;
  const res = await db.query(sql, [d30]);
  return (res.values || []).map((r) => ({ name: r.name, sold30: r.sold30 || 0 }));
}

// ── এন্ট্রি ৪১ (ধাপ ৬, computeSupplierDueMap SQL cutover) ────────────────────
/**
 * products+purchaseOrders+supplierPayments জুড়ে ফাজি-নাম-merge সাপ্লায়ার
 * due-map — logic.js-এর computeSupplierDueMap()+uniqueSupplierRows()-এর SQL
 * সমতুল্য। schema.sql-এর "supplier due-map" কমেন্ট-ব্লকে ডিজাইন বিস্তারিত।
 *
 * রিটার্ন: [{ name, productCount, totalStock, totalPurchased, paid, due }, ...]
 * (canonical নাম অনুযায়ী ইতিমধ্যে ডিডুপ্লিকেটেড — আলাদা uniqueSupplierRows()
 * লাগে না, প্রতিটা normalized key-এর জন্য একটাই রো)।
 */
export async function getSupplierDueRows(businessType) {
  const db = await getDb(businessType);
  const sql = `
    WITH raw_names AS (
      SELECT DISTINCT supplier_due_key AS key, supplier_due_raw AS raw FROM products
        WHERE deleted = 0 AND supplier_due_key IS NOT NULL AND supplier_due_key != ''
      UNION
      SELECT DISTINCT supplier_due_key, supplier_due_raw FROM purchaseOrders
        WHERE supplier_due_key IS NOT NULL AND supplier_due_key != ''
      UNION
      SELECT DISTINCT supplier_due_key, supplier_due_raw FROM supplierPayments
        WHERE supplier_due_key IS NOT NULL AND supplier_due_key != ''
    ),
    canonical AS (
      -- প্রতিটা key-এর সবচেয়ে লম্বা raw ভ্যারিয়েন্ট বাছাই (টাই হলে SQLite যেটা
      -- আগে পায় সেটা — schema.sql-এর কমেন্টে ব্যাখ্যা করা non-financial edge-case)
      SELECT key, raw AS canonical_name
      FROM raw_names r1
      WHERE LENGTH(raw) = (SELECT MAX(LENGTH(raw)) FROM raw_names r2 WHERE r2.key = r1.key)
      GROUP BY key
    ),
    raw_variants AS (
      -- প্রতিটা key-এর সবগুলো raw নাম-ভ্যারিয়েন্ট \u001F (unit separator) দিয়ে জোড়া —
      -- JS-এর backward-compat "প্রতিটা raw নামও merged রো পয়েন্ট করে" আচরণের জন্য
      -- (computeSupplierDueMap()-এর finalMap[raw] = ... লজিকের সমতুল্য, নিচে
      -- App.jsx-এর useSupplierDueRows()-এ split করে map বানানো হয়)
      SELECT key, group_concat(raw, char(31)) AS raws FROM raw_names GROUP BY key
    ),
    prod_agg AS (
      SELECT supplier_due_key AS key, COUNT(*) AS product_count, SUM(COALESCE(stock, 0)) AS total_stock
      FROM products WHERE deleted = 0 AND supplier_due_key IS NOT NULL AND supplier_due_key != ''
      GROUP BY supplier_due_key
    ),
    po_agg AS (
      SELECT supplier_due_key AS key, SUM(COALESCE(purchase_amount, 0)) AS total_purchased
      FROM purchaseOrders WHERE supplier_due_key IS NOT NULL AND supplier_due_key != ''
      GROUP BY supplier_due_key
    ),
    pay_agg AS (
      SELECT supplier_due_key AS key, SUM(COALESCE(signed_amount, 0)) AS paid
      FROM supplierPayments WHERE supplier_due_key IS NOT NULL AND supplier_due_key != ''
      GROUP BY supplier_due_key
    )
    SELECT
      c.canonical_name AS name,
      COALESCE(pr.product_count, 0) AS product_count,
      COALESCE(pr.total_stock, 0) AS total_stock,
      COALESCE(po.total_purchased, 0) AS total_purchased,
      COALESCE(pay.paid, 0) AS paid,
      MAX(0, -COALESCE(pay.paid, 0)) AS due,
      rv.raws AS raw_variants
    FROM canonical c
    LEFT JOIN prod_agg pr ON pr.key = c.key
    LEFT JOIN po_agg   po ON po.key = c.key
    LEFT JOIN pay_agg  pay ON pay.key = c.key
    LEFT JOIN raw_variants rv ON rv.key = c.key
  `;
  const res = await db.query(sql);
  return (res.values || []).map(r => ({
    name: r.name,
    productCount: r.product_count || 0,
    totalStock: r.total_stock || 0,
    totalPurchased: r.total_purchased || 0,
    paid: r.paid || 0,
    due: r.due || 0,
    // backward-compat raw-নাম ভ্যারিয়েন্ট তালিকা (App.jsx-এর useSupplierDueRows()-এ
    // ব্যবহৃত — computeSupplierDueMap()-এর finalMap[raw]=... আচরণের সমতুল্য)
    rawVariants: r.raw_variants ? r.raw_variants.split("\u001F") : [r.name],
  }));
}

// 🆕 এন্ট্রি ৪৪ (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ৭.৩-এর ব্লকার, ক্যাটাগরি ③
// FULL-SCAN — ৪টার মধ্যে ৩টা এখানে, dup-name check নিচে আলাদা কারণ ওটা লিস্ট না
// একক-রেকর্ড lookup)। প্রতিটাই পুরো `products` অ্যারে JS-স্ক্যানের বদলে DISTINCT
// কোয়েরি — dup-name-এর মতোই SupplierPicker/dosage-chip/ক্যাটাগরি-ফিল্টারের
// অটো-সাজেশন লিস্ট, প্রতিবার re-render-এ রিকম্পিউট করার দরকার নেই।

/** SmartInvoiceBuilder-এর ক্যাটাগরি-ফিল্টার চিপ লিস্টের জন্য — service বাদে distinct category।
 * 🔴 বাগ ফিক্স (এন্ট্রি ৪৯, টেস্ট লেখার সময় ধরা পড়ল): `product_type != 'service'`
 * SQL-এর three-valued logic-এ `product_type IS NULL` রো-গুলো বাদ দিয়ে দেয় (NULL != 'service'
 * SQL-এ UNKNOWN, WHERE-এ true না) — আর বেশিরভাগ প্রোডাক্টেরই productType সেট করা থাকে না
 * (শুধু service আইটেমে explicit "service" বসে)। ফলে আগের কোয়েরিতে প্রায় সব প্রোডাক্টই
 * বাদ পড়ে যেত — production-এ SQL চালু থাকলে ক্যাটাগরি-চিপ লিস্ট প্রায় খালি দেখাত।
 * JS ফলব্যাক (`p.productType !== "service"`) ঠিকই ছিল, undefined !== "service" জাভাস্ক্রিপ্টে
 * true — তাই এই বাগ শুধু SQL পাথে ছিল, JS ফলব্যাকে ছিল না। */
export async function getDistinctCategories(businessType) {
  const db = await getDb(businessType);
  const sql = `
    SELECT DISTINCT category FROM products
    WHERE deleted = 0 AND (product_type IS NULL OR product_type != 'service') AND category IS NOT NULL AND category != ''
    ORDER BY category ASC
  `;
  const res = await db.query(sql);
  return (res.values || []).map((r) => r.category);
}

/** getKnownSuppliers()-এর SQL সমতুল্য — products.supplier_due_raw (এন্ট্রি ৪১-এ প্রি-কম্পিউটেড,
 * (p.company||p.supplier).trim()) UNION purchaseOrders.supplier_due_raw ((po.supplier||po.company).trim()) —
 * দুটোই আগে থেকে বিদ্যমান কলাম, নতুন কোনো কলাম/write-time কাজ লাগেনি। */
export async function getDistinctSuppliers(businessType) {
  const db = await getDb(businessType);
  const sql = `
    SELECT DISTINCT supplier_due_raw AS raw FROM products
      WHERE supplier_due_raw IS NOT NULL AND supplier_due_raw != ''
    UNION
    SELECT DISTINCT supplier_due_raw FROM purchaseOrders
      WHERE supplier_due_raw IS NOT NULL AND supplier_due_raw != ''
  `;
  const res = await db.query(sql);
  return (res.values || []).map((r) => r.raw);
}

/** getKnownCustomDosageForms()-এর SQL সমতুল্য — DOSAGE_FORM_CHIPS-এ নেই এমন ফিল্টার App.jsx-এই হয় (JS constant,
 * SQL-এ আনার দরকার নেই), এখানে শুধু distinct raw dosage_form ভ্যালু ফেরত। */
export async function getDistinctDosageForms(businessType) {
  const db = await getDb(businessType);
  const sql = `
    SELECT DISTINCT dosage_form FROM products
    WHERE deleted = 0 AND dosage_form IS NOT NULL AND dosage_form != ''
    ORDER BY dosage_form ASC
  `;
  const res = await db.query(sql);
  return (res.values || []).map((r) => r.dosage_form);
}

// ── এন্ট্রি ৫৭ (Customers RFM/LTV cutover, App.jsx-এর Customers কম্পোনেন্টের
// rfmData-এর SQL সমতুল্য) ──────────────────────────────────────────────────
/**
 * customer_id দিয়ে GROUP BY করে ৩টা আলাদা aggregate কোয়েরি — invoices থেকে
 * ltv/frequency/lastDateKey, txns থেকে recentPaid, আর গ্লোবাল totalSales/monthSale
 * (সেগমেন্ট-থ্রেশহোল্ডে ব্যবহার হয়)। ⚠️ ইচ্ছাকৃতভাবে দুটো আলাদা GROUP BY কোয়েরি —
 * invoices আর txns-কে সরাসরি JOIN করলে প্রতি কাস্টমারের প্রতিটা invoice-row ×
 * প্রতিটা txn-row মিলে cross-product হয়ে SUM ভুল (গুণিতক) হয়ে যেত। App.jsx-এ
 * customerId দিয়ে দুটো ফলাফল Map-এ মার্জ হয় (O(customers), rfmData-এর আগের
 * O(customers×invoices) স্ক্যানের বদলে)। txns.customer_id কলাম নতুন (দেখুন
 * schema.sql-এর txns কমেন্ট — কেন invoice_id-নির্ভর JOIN যথেষ্ট ছিল না)।
 *
 * রিটার্ন: { byCustomer: [{id,ltv,frequency,lastDateKey}], recentPaidByCustomer:
 * [{id,recentPaid}], totals: {totalSales, monthSale} }
 */
export async function getCustomerRfmAggregates(businessType, { d30 }) {
  const db = await getDb(businessType);
  const [invRes, txnRes, totalsRes] = await Promise.all([
    db.query(`
      SELECT customer_id AS id, SUM(total) AS ltv, COUNT(*) AS frequency, MAX(date_key) AS lastDateKey
      FROM invoices WHERE status = 'active' AND customer_id IS NOT NULL
      GROUP BY customer_id
    `),
    db.query(`
      SELECT customer_id AS id, SUM(amount) AS recentPaid
      FROM txns WHERE type = 'joma' AND customer_id IS NOT NULL AND date_key >= ?
      GROUP BY customer_id
    `, [d30]),
    db.query(`
      SELECT SUM(total) AS totalSales,
             SUM(CASE WHEN date_key >= ? THEN total ELSE 0 END) AS monthSale
      FROM invoices WHERE status = 'active'
    `, [d30]),
  ]);
  const t = totalsRes.values?.[0] || {};
  return {
    byCustomer: (invRes.values || []).map((r) => ({ id: r.id, ltv: r.ltv || 0, frequency: r.frequency || 0, lastDateKey: r.lastDateKey || null })),
    recentPaidByCustomer: (txnRes.values || []).map((r) => ({ id: r.id, recentPaid: r.recentPaid || 0 })),
    totals: { totalSales: t.totalSales || 0, monthSale: t.monthSale || 0 },
  };
}

/** liveDupProduct-এর SQL সমতুল্য — name_norm ইনডেক্সড কলামে exact lookup (schema-তে এন্ট্রি ৯ থেকেই
 * বিদ্যমান, তাই এই ৪টার মধ্যে সবচেয়ে সহজ কনভার্শন)। excludeId এডিট-মোডে নিজের রেকর্ড বাদ দিতে
 * (App.jsx-এর "if (editId) return null" আচরণের সমতুল্য, তবে এখানে বাদ দিয়ে বাকি সব চেক করা — ভবিষ্যতে
 * এডিট-মোডেও অন্য পণ্যের সাথে নাম-সংঘর্ষ ধরতে চাইলে কাজে লাগবে)। */
export async function findProductByNameNorm(businessType, nameNorm, excludeId = null) {
  if (!nameNorm) return null;
  const db = await getDb(businessType);
  const sql = excludeId
    ? `SELECT id, name FROM products WHERE name_norm = ? AND deleted = 0 AND id != ? LIMIT 1`
    : `SELECT id, name FROM products WHERE name_norm = ? AND deleted = 0 LIMIT 1`;
  const params = excludeId ? [nameNorm, String(excludeId)] : [nameNorm];
  const res = await db.query(sql, params);
  const row = (res.values || [])[0];
  return row ? { id: row.id, name: row.name } : null;
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
