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

-- FTS5 ভার্চুয়াল টেবিল — প্রোডাক্ট নাম সার্চ (বাংলা/ইংরেজি, কাছাকাছি-বানান সহনশীল)
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  id UNINDEXED,
  name,
  content='products',
  content_rowid='rowid'
);

-- মূল টেবিল বদলালে FTS ইনডেক্স সিঙ্কে রাখার ট্রিগার (SQLite FTS5 external-content প্যাটার্ন)
CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, id, name) VALUES (new.rowid, new.id, new.name);
END;
CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, id, name) VALUES ('delete', old.rowid, old.id, old.name);
END;
CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, id, name) VALUES ('delete', old.rowid, old.id, old.name);
  INSERT INTO products_fts(rowid, id, name) VALUES (new.rowid, new.id, new.name);
END;

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

CREATE VIRTUAL TABLE IF NOT EXISTS customers_fts USING fts5(
  id UNINDEXED,
  name,
  mobile,
  content='customers',
  content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS customers_ai AFTER INSERT ON customers BEGIN
  INSERT INTO customers_fts(rowid, id, name, mobile) VALUES (new.rowid, new.id, new.name, new.mobile);
END;
CREATE TRIGGER IF NOT EXISTS customers_ad AFTER DELETE ON customers BEGIN
  INSERT INTO customers_fts(customers_fts, rowid, id, name, mobile) VALUES ('delete', old.rowid, old.id, old.name, old.mobile);
END;
CREATE TRIGGER IF NOT EXISTS customers_au AFTER UPDATE ON customers BEGIN
  INSERT INTO customers_fts(customers_fts, rowid, id, name, mobile) VALUES ('delete', old.rowid, old.id, old.name, old.mobile);
  INSERT INTO customers_fts(rowid, id, name, mobile) VALUES (new.rowid, new.id, new.name, new.mobile);
END;

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

-- ── migration মেটাডেটা (কোন blob key কতদূর ব্যাকফিল হয়েছে, resumability-র জন্য) ──
CREATE TABLE IF NOT EXISTS _migration_state (
  store_name        TEXT PRIMARY KEY,   -- 'products' | 'customers' | 'invoices'
  total_source_rows  INTEGER,
  migrated_rows       INTEGER NOT NULL DEFAULT 0,
  last_migrated_id    TEXT,              -- resumability: এখান থেকে পরের ব্যাচ শুরু হবে
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | verified | done
  started_at          INTEGER,
  completed_at        INTEGER
);
