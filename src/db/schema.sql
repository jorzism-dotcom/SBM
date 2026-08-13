-- ─── src/db/schema.sql ──────────────────────────────────────────────────────
-- SBM SQLite স্কিমা (Phase 0) — IndexedDB blob-array migration-এর টার্গেট স্কিমা।
--
-- ডিজাইন মূলনীতি: "hot fields" (যেগুলো দিয়ে ফিল্টার/সর্ট/সার্চ হয়) আলাদা কলামে
-- + ইনডেক্স, বাকি সব ফিল্ড একটা `data` JSON কলামে। এতে ৫০০+ জায়গায় ছড়িয়ে থাকা
-- ফিল্ড শেপের সাথে ১০০% মিল বাধ্যতামূলক না রেখেও (schemas.js-এর মতোই loose/
-- passthrough দর্শন) ইনডেক্সড কোয়েরি পারফরম্যান্স পাওয়া যায়।
--
-- প্রতিটা business type (pharmacy/veterinary/semen ইত্যাদি)-এর জন্য এই একই
-- স্কিমা আলাদা DB ফাইলে বসবে (যেমন pharmacy.db, veterinary.db) —
-- সিদ্ধান্ত অনুযায়ী (SQLITE_MIGRATION_LOG.md দ্রষ্টব্য)।
--
-- ⚠️ এই ফাইল এখনো কোনো অ্যাপ কোড থেকে কল হচ্ছে না — শুধু schema definition।
-- DataStore.js এই স্কিমা migration/execute করবে init()-এর সময়।

PRAGMA journal_mode = WAL;      -- write-ahead logging: পড়া আর লেখা একসাথে চলতে পারে, mobile-এ কম lock contention
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;    -- FULL-এর চেয়ে দ্রুত, WAL মোডে যথেষ্ট নিরাপদ (crash-এ সর্বোচ্চ কয়েক ms ডেটা ঝুঁকিতে, পুরো ফাইল করাপশনের ঝুঁকি নেই)

-- ── products ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_norm   TEXT,              -- normName(name) — lowercase/diacritic-normalized, LIKE সার্চের ফলব্যাক হিসেবে
  barcode     TEXT,
  stock       REAL,
  cost_price  REAL,
  price       REAL,
  updated_at  INTEGER NOT NULL,  -- Date.now() — sync/conflict resolution আর "সাম্প্রতিক এডিট" সর্টের জন্য
  deleted     INTEGER NOT NULL DEFAULT 0,  -- soft-delete flag (deletedProducts আলাদা array-এর বদলে)
  data        TEXT NOT NULL      -- পুরো product object JSON (batches, dosageForm, unit, সব বাকি ফিল্ড)
);
CREATE INDEX IF NOT EXISTS idx_products_name_norm ON products(name_norm);
CREATE INDEX IF NOT EXISTS idx_products_barcode   ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_updated   ON products(updated_at);
CREATE INDEX IF NOT EXISTS idx_products_deleted   ON products(deleted);
-- 🆕 keyset pagination কম্পোজিট ইনডেক্স (DataStore.js queryPage(), ব্লকার #২ ফিক্স) —
-- (sortColumn, id) দুটো কলামই একসাথে ইনডেক্সে থাকায় "WHERE (updated_at, id) < (?, ?)
-- ORDER BY updated_at DESC, id DESC LIMIT N" কোয়েরি single covering-index seek-এ
-- সমাধান হয়, কোনো row ফেলে দেওয়ার (OFFSET-এর মতো) দরকার হয় না।
CREATE INDEX IF NOT EXISTS idx_products_updated_id ON products(updated_at, id);

-- FTS5 ভার্চুয়াল টেবিল — প্রোডাক্ট নাম সার্চ (বাংলা/ইংরেজি, কাছাকাছি-বানান সহনশীল)
-- 🔴 ফিক্স (real-device টেস্টে ধরা পড়া ২য় বাগ — এন্ট্রি ৯ দেখুন): আগে এখানে
-- external-content mode (`content='products', content_rowid='rowid'`) + সিঙ্ক
-- ট্রিগার (products_ai/ad/au) ব্যবহার হতো। কিন্তু (ক) @capacitor-community/sqlite
-- Android bridge-এর SQL statement-splitter BEGIN...END-এর ভেতরে ২+ স্টেটমেন্ট
-- থাকা ট্রিগার (products_au) ভুলভাবে ভেঙে ফেলে ("incomplete input" এরর), আর
-- (খ) upsert()/upsertMany() যেহেতু TEXT PRIMARY KEY-তে `INSERT OR REPLACE`
-- ব্যবহার করে — SQLite-এ এটা আসলে DELETE+INSERT (rowid বদলে যায়), তাই
-- products_au (AFTER UPDATE) ট্রিগার আদৌ ফায়ারই হতো না এই write-path-এ, আর
-- content_rowid sync থিওরিগতভাবেই ভঙ্গুর ছিল। এখন standalone FTS5 (কোনো
-- content=/content_rowid= নেই, id দিয়ে ম্যাচ করে) — DataStore.js-এর upsert()/
-- upsertMany()/remove()-এ সরাসরি JS থেকে delete+insert করে সিঙ্ক রাখা হয়,
-- কোনো SQL trigger লাগে না।
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  id UNINDEXED,
  name
);

-- ── customers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  name_norm   TEXT,
  mobile      TEXT,
  balance     REAL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0,
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_mobile     ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_name_norm  ON customers(name_norm);
CREATE INDEX IF NOT EXISTS idx_customers_updated    ON customers(updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_deleted    ON customers(deleted);
-- 🆕 keyset pagination কম্পোজিট ইনডেক্স — products-এর ব্যাখ্যা দ্রষ্টব্য
CREATE INDEX IF NOT EXISTS idx_customers_updated_id ON customers(updated_at, id);

-- FTS5 (customers) — একই কারণে standalone (কোনো content=/content_rowid=/trigger নেই), দেখুন products_fts-এর কমেন্ট
CREATE VIRTUAL TABLE IF NOT EXISTS customers_fts USING fts5(
  id UNINDEXED,
  name,
  mobile
);

-- ── invoices ─────────────────────────────────────────────────────────────
-- নোট: এখানে FTS দরকার নেই (ইনভয়েস নাম্বার/কাস্টমার দিয়ে খোঁজা হয়, ফ্রি-টেক্সট সার্চ না)।
CREATE TABLE IF NOT EXISTS invoices (
  id           TEXT PRIMARY KEY,
  invoice_no   TEXT,
  date_key     TEXT NOT NULL,      -- YYYY-MM-DD, দিন-ভিত্তিক কোয়েরি/ড্যাশবোর্ডের জন্য প্রধান ফিল্টার
  customer_id  TEXT,
  status       TEXT NOT NULL DEFAULT 'active',  -- active | voided
  total        REAL,
  created_at   INTEGER NOT NULL,
  data         TEXT NOT NULL       -- পুরো invoice object JSON (items, discount, payType সব)
);
CREATE INDEX IF NOT EXISTS idx_invoices_date_key    ON invoices(date_key);
CREATE INDEX IF NOT EXISTS idx_invoices_customer    ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status      ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at  ON invoices(created_at);
-- কম্বাইন্ড ইনডেক্স: "নির্দিষ্ট কাস্টমারের, নির্দিষ্ট তারিখ-রেঞ্জের, ভয়েডেড বাদে" — এটাই সবচেয়ে সাধারণ কোয়েরি প্যাটার্ন
CREATE INDEX IF NOT EXISTS idx_invoices_cust_date   ON invoices(customer_id, date_key, status);
-- covering index: Dashboard-এর "আজকের বিক্রি" SUM(total) কোয়েরি (date_key + status ফিল্টার)
-- total-ও ইনডেক্সে থাকায় মূল টেবিলে row lookup ছাড়াই শুধু ইনডেক্স থেকে aggregate বের হয়
-- (১ কোটি স্কেলে বেঞ্চমার্কে ৮,৯৮২ms থেকে ১.৪ms — ~৬,৪০০ গুণ দ্রুত)
CREATE INDEX IF NOT EXISTS idx_invoices_dashboard   ON invoices(date_key, status, total);
-- 🆕 keyset pagination কম্পোজিট ইনডেক্স — invoices-এর ডিফল্ট sort কলাম created_at
-- (products/customers-এর মতো updated_at না — invoices টেবিলে সেই কলামই নেই), দেখুন
-- DataStore.js DEFAULT_SORT_COLUMN আর queryPage()-এর কমেন্ট।
CREATE INDEX IF NOT EXISTS idx_invoices_created_id  ON invoices(created_at, id);

-- ── migration মেটাডেটা (কোন blob key কতদূর ব্যাকফিল হয়েছে, resumability-র জন্য) ──
CREATE TABLE IF NOT EXISTS _migration_state (
  store_name        TEXT PRIMARY KEY,   -- 'products' | 'customers' | 'invoices'
  total_source_rows  INTEGER,
  migrated_rows       INTEGER NOT NULL DEFAULT 0,
  last_migrated_id    TEXT,              -- resumability: এখান থেকে পরের ব্যাচ শুরু হবে
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | verified | done
  started_at          INTEGER,
  completed_at          INTEGER
);

-- ── Phase 3,4,5 প্ল্যানের Phase ১ (foundation): feature_flags ─────────────────
-- localStorage-এর বদলে ফ্ল্যাগ SQLite-এ রাখার কারণ: ভবিষ্যতে multi-device sync
-- চালু হলে বাকি সব টেবিলের মতো এই টেবিলও events-log দিয়ে সিঙ্ক করা যাবে,
-- আলাদা কোনো "flag sync সিস্টেম" বানাতে হবে না। আপাতত DataStore.js-এর
-- isSqliteEnabled()/setSqliteEnabled() এখনো synchronous localStorage-ই পড়ে
-- (zero risk, আচরণ অপরিবর্তিত) — এই টেবিলে শুধু mirror (fire-and-forget) হয়,
-- যাতে future sync-এর ভিত্তি প্রস্তুত থাকে। দেখুন PHASE_3_4_5_FINAL_PLAN_v2.md।
CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  INTEGER,
  device_id   TEXT
);

-- ── events (lightweight append-only log) ─────────────────────────────────────
-- পূর্ণাঙ্গ CDC/Kafka-স্টাইল pipeline না (৩ দোকানের single-device স্কেলে অপ্রয়োজনীয়
-- জটিলতা) — শুধু "কী বদলেছে" তার একটা লগ, দুটো কাজে ব্যবহৃত হবে:
--   ১. এখন: reconciliation/golden-master টেস্টে "কোন রেকর্ড কবে বদলেছে" দ্রুত বের
--      করা, পুরো array রিপ্লে না করে।
--   ২. ভবিষ্যতে: multi-device sync চালু হলে synced=0 রো-গুলো exchange/apply করাই
--      হবে মূল sync mechanism (CRDT-জাতীয় ভারী কিছু বানাতে হবে না)।
CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,     -- 'product' | 'customer' | 'invoice'
  entity_id    TEXT NOT NULL,
  op           TEXT NOT NULL,     -- 'upsert' | 'delete' | 'reconcile_mismatch'
  payload      TEXT,              -- JSON (upsert/delete: সংক্ষিপ্ত সামারি; reconcile_mismatch: diff details)
  device_id    TEXT,
  ts           INTEGER NOT NULL,
  synced       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_synced ON events(synced);
CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_events_ts     ON events(ts);
