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
  demand_type TEXT,              -- 🆕 এন্ট্রি ৩০ (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ৪): "common"/"uncommon"/NULL
                                  -- (NULL = "common" ট্রিট হয়, JS p.demandType||"common" ডিফল্টের সাথে মিলিয়ে)
  min_stock_alert     REAL,      -- 🆕 এন্ট্রি ৩৬ (ধাপ ২, InventorySection): NULL হলে JS-এর p.minStockAlert||5
                                  -- ডিফল্টের সাথে মিলিয়ে কোয়েরিতে COALESCE(min_stock_alert, 5) ব্যবহার হয়
  nearest_expiry_date TEXT,      -- 🆕 এন্ট্রি ৩৬: qty>0 এমন সব ব্যাচের (এক্সপায়ার্ড হোক বা না হোক) মধ্যে
                                  -- সবচেয়ে কাছের expiryDate (legacy পণ্যে top-level expiryDate)। এটা একটা
                                  -- raw ক্যালেন্ডার-তারিখ fact — ব্যাচ বদলালে (write-time) রিফ্রেশ হয়, কিন্তু
                                  -- নিজে কোনো "এক্সপায়ার্ড কি না" স্ট্যাটাস স্টোর করে না (তাই সময় পার হলেও
                                  -- stale হয় না) — শুধু SQL-এ candidate narrow করতে (WHERE <= cutoff) ব্যবহার
                                  -- হয়, আসল expired/near-expiry বিভাজন App.jsx-এ read-time new Date() দিয়েই
                                  -- হয় (আগের মতোই, কোনো staleness ঝুঁকি নেই — এন্ট্রি ৩৩-৩৫-এর POS availability
                                  -- সমস্যা থেকে ইচ্ছাকৃতভাবে ভিন্ন ডিজাইন)
  supplier_key        TEXT,      -- 🆕 এন্ট্রি ৩৬: company || category || "অজ্ঞাত" — সাপ্লায়ার গ্রুপিং/ফিল্টারের জন্য
  -- 🆕 এন্ট্রি ৪০ (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ৫, POS product picker) —
  -- নিচের ৩টা কলাম দেখুন schema-র নিচের কমেন্টে (browse_rank-এর ব্যাখ্যা বিস্তারিত)
  product_type        TEXT,      -- p.productType ("service" হলে সবসময় উপলব্ধ ধরা হয়) — ক্যাটাগরি WHERE-ফিল্টারের জন্য
  category             TEXT,     -- p.category — নির্দিষ্ট ক্যাটাগরি ফিল্টারের জন্য (supplier_key-এর company||category থেকে আলাদা কলাম, ভিন্ন উদ্দেশ্য)
  browse_rank          TEXT,     -- 🆕 এন্ট্রি ৪০ — নিচের কমেন্ট দ্রষ্টব্য
  -- 🆕 এন্ট্রি ৪১ (ধাপ ৬, computeSupplierDueMap) — নিচের "supplier due-map"
  -- কমেন্ট-ব্লকে বিস্তারিত ব্যাখ্যা। supplier_key (এন্ট্রি ৩৬, company||category
  -- ফলব্যাক) থেকে সম্পূর্ণ আলাদা উদ্দেশ্য — এটা শুধু company/supplier (ক্যাটাগরি
  -- ফলব্যাক নেই) দিয়ে normalizeSupplierKey()-এর ফলাফল।
  supplier_due_key      TEXT,    -- normalizeSupplierKey(p.company || p.supplier || "") — খালি হলে NULL
  supplier_due_raw      TEXT,    -- (p.company || p.supplier || "").trim() — canonical নাম বাছাইয়ের জন্য raw ভ্যারিয়েন্ট
  -- 🆕 এন্ট্রি ৪৪ (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ৭.৩-এর ব্লকার, ক্যাটাগরি ③)
  -- p.dosageForm — getKnownCustomDosageForms()-এর DISTINCT কোয়েরির জন্য (আগে
  -- এই ফিল্ড শুধু data JSON-এর ভেতরে ছিল, কোনো ফ্ল্যাট কলাম ছিল না)
  dosage_form           TEXT,
  data        TEXT NOT NULL      -- পুরো product object JSON (batches, dosageForm, unit, সব বাকি ফিল্ড)
);
CREATE INDEX IF NOT EXISTS idx_products_name_norm ON products(name_norm);
CREATE INDEX IF NOT EXISTS idx_products_barcode   ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_updated   ON products(updated_at);
CREATE INDEX IF NOT EXISTS idx_products_deleted   ON products(deleted);
-- 🆕 এন্ট্রি ৩৬ (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ২) — InventorySection
-- KPI কাউন্ট + ডিটেইল লিস্ট + সাপ্লায়ার-গ্রুপিং SQL cutover-এর ইনডেক্স
CREATE INDEX IF NOT EXISTS idx_products_stock            ON products(stock);
CREATE INDEX IF NOT EXISTS idx_products_stock_minalert    ON products(stock, min_stock_alert);
CREATE INDEX IF NOT EXISTS idx_products_nearest_expiry    ON products(nearest_expiry_date);
CREATE INDEX IF NOT EXISTS idx_products_supplier_key      ON products(supplier_key);
-- 🆕 এন্ট্রি ৪৪ — getKnownCustomDosageForms()-এর DISTINCT dosage_form কোয়েরির জন্য
CREATE INDEX IF NOT EXISTS idx_products_dosage_form       ON products(dosage_form);
-- 🆕 keyset pagination কম্পোজিট ইনডেক্স (DataStore.js queryPage(), ব্লকার #২ ফিক্স) —
-- (sortColumn, id) দুটো কলামই একসাথে ইনডেক্সে থাকায় "WHERE (updated_at, id) < (?, ?)
-- ORDER BY updated_at DESC, id DESC LIMIT N" কোয়েরি single covering-index seek-এ
-- সমাধান হয়, কোনো row ফেলে দেওয়ার (OFFSET-এর মতো) দরকার হয় না।
CREATE INDEX IF NOT EXISTS idx_products_updated_id ON products(updated_at, id);
-- 🆕 এন্ট্রি ৩০ — Products main list ডিফল্ট-ব্রাউজ pagination: demand_type বাকেট
-- (common আগে, uncommon পরে — দুটো আলাদা queryPage() কল, কোনো মাল্টি-কলাম
-- কার্সার লাগে না) + প্রতি বাকেটের ভেতরে name ASC সর্ট। এই কম্পোজিট ইনডেক্স
-- "WHERE demand_type = ? ORDER BY name ASC" কোয়েরিকে ইনডেক্স-সিকে নিয়ে যায়।
CREATE INDEX IF NOT EXISTS idx_products_demand_name ON products(demand_type, name);
CREATE INDEX IF NOT EXISTS idx_products_demand_name_id ON products(demand_type, name, id);

-- 🆕 এন্ট্রি ৪০ (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ৫) — POS product picker
-- (SmartInvoiceBuilder) ডিফল্ট-ব্রাউজ (সার্চ নেই) মোডের pagination।
--
-- 🔴 এন্ট্রি ৩২-এ ধরা পড়া সমস্যা: এখানে দরকার effectively ৩-স্তরের অর্ডার
-- (unavailable-status → demand_type → name), কিন্তু DataStore.queryPage() শুধু
-- single-column keyset সাপোর্ট করে (এন্ট্রি ২৫)। এন্ট্রি ৩২-এ দুটো বিকল্প ছিল:
-- (ক) queryPage() কোর ফাংশন বদলানো (shared, ৪+ কল-সাইট, বেশি ঝুঁকি), অথবা
-- (খ) একটা precomputed combined sort-key কলাম। এখানে (খ) বাছা হলো।
--
-- browse_rank = "<tier_digit><name>" — একটা একক TEXT কলাম যেখানে প্রথম ক্যারেক্টার
-- ('０'-'৩'-এর মতো না, প্লেইন ASCII '0'-'3') প্রায়োরিটি-টিয়ার আর বাকি অংশ নাম —
-- তাই সাধারণ lexicographic "ORDER BY browse_rank ASC" স্বয়ংক্রিয়ভাবেই আগে টিয়ার
-- দিয়ে গ্রুপ করে, তারপর প্রতি গ্রুপের ভেতরে নাম দিয়ে সর্ট করে — কোনো multi-column
-- keyset বা queryPage() পরিবর্তন ছাড়াই। টিয়ার হিসাব (DataStore.js-এ, App.jsx-এর
-- isProductUnavailable()+demandType লজিকের সাথে বাইট-বাই-বাইট মিলিয়ে):
--   0 = available + common       1 = available + uncommon
--   2 = unavailable + common     3 = unavailable + uncommon
-- (App.jsx-এর দুই-ধাপের stable sort-এর সমতুল্য — দেখুন DataStore.js computeBrowseTier())
--
-- ⚠️ স্টেলনেস নোট (এন্ট্রি ৩২-এর "বিলিং কাউন্টার" উদ্বেগ): এই কলাম শুধু SQL
-- pagination-এর *অর্ডার* ঠিক করতে ব্যবহৃত হয় — App.jsx-এ SQL রো থেকে সরাসরি
-- কোনো stock/price/availability রেন্ডার হয় না। প্রতিটা কার্ড এখনো live `products`
-- state (invProdMap-এর মতো) থেকে রিয়েল-টাইম ডেটা পড়ে, তাই dual-write lag থাকলেও
-- ভুল স্টক-আউট পণ্য বিক্রির ঝুঁকি নেই — সর্বোচ্চ ঝুঁকি হলো একটা আইটেম কয়েক
-- মিলিসেকেন্ডের জন্য "ভুল বাকেটে" (যেমন available বাকেটে অস্থায়ীভাবে) দেখাতে
-- পারে, যা পরের dual-write cycle-এ (একই cadence-এ যেখানে stock কলাম নিজেই
-- আপডেট হয়) স্বয়ংক্রিয়ভাবে ঠিক হয়ে যায়।
CREATE INDEX IF NOT EXISTS idx_products_browse ON products(deleted, browse_rank);
CREATE INDEX IF NOT EXISTS idx_products_browse_id ON products(deleted, browse_rank, id);
CREATE INDEX IF NOT EXISTS idx_products_browse_category ON products(deleted, product_type, category, browse_rank);
CREATE INDEX IF NOT EXISTS idx_products_browse_category_id ON products(deleted, product_type, category, browse_rank, id);

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

-- ── expenses ─────────────────────────────────────────────────────────────
-- 🆕 এন্ট্রি ৩৭ (useKpiStats-এর ৫টা এখনো-SQL-না-হওয়া ডেটা-সোর্সের প্রথমটা)।
-- expenses সবচেয়ে সরল শেপ (batches/nested আইটেম নেই) বলে প্রথমে বেছে নেওয়া হলো।
-- deleteExpense() হার্ড-ডিলিট করে (কোনো soft-delete ফ্ল্যাগ নেই), তাই
-- products/customers-এর মতো `deleted` কলাম দরকার নেই — dualWriteSqlite()-এর
-- removedIds → remove() পাথ (আসল SQL DELETE) সরাসরি প্রযোজ্য।
CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  category    TEXT,
  amount      REAL,
  date_key    TEXT,      -- YYYY-MM-DD (e.dateKey||e.date) — todayAmt/monthAmt ফিল্টারের জন্য
  updated_at  TEXT,       -- e.updatedAt (ISO string — products-এর epoch-ms থেকে ভিন্ন ফরম্যাট, শুধু bookkeeping, sort/pagination-এ ব্যবহার হয় না)
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_date_key ON expenses(date_key);

-- ── cashLogs ─────────────────────────────────────────────────────────────
-- 🆕 এন্ট্রি ৩৮ (useKpiStats-এর ৫টা ডেটা-সোর্সের ২য়টা)। expenses-এর মতোই হার্ড-
-- ডিলিট হয় (addCashLog/সম্পাদনার মুছে ফেলা সরাসরি অ্যারে থেকে বাদ, কোনো soft-
-- delete ফ্ল্যাগ নেই) — dualWriteSqlite()-এর removedIds → remove() পাথ প্রযোজ্য।
CREATE TABLE IF NOT EXISTS cashLogs (
  id          TEXT PRIMARY KEY,
  type        TEXT,       -- opening | withdrawal | return_refund | return_refund_reversal ...
  amount      REAL,
  date_key    TEXT,        -- c.dateKey (YYYY-MM-DD)
  updated_at  TEXT,        -- c.createdAt (ISO string — bookkeeping only)
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cashlogs_type_date ON cashLogs(type, date_key);

-- ── purchaseOrders ───────────────────────────────────────────────────────
-- 🆕 এন্ট্রি ৩৮। শুধু `_type === "pe"` এন্ট্রিই useKpiStats-এ ব্যবহৃত হয় (entry_type
-- কলাম — "type" SQL কীওয়ার্ডের সাথে বিভ্রান্তি এড়াতে)। ⚠️ windowed না (invoices-এর
-- মতো ৬-মাস আর্কাইভ কাটঅফ নেই) — ভবিষ্যতে গ্রোথ-ঝুঁকি হিসেবে চিহ্নিত (স্ক্রিনশট নোট),
-- কিন্তু এই ধাপের স্কোপ শুধু SQL cutover, windowing আলাদা ভবিষ্যৎ আইটেম।
CREATE TABLE IF NOT EXISTS purchaseOrders (
  id          TEXT PRIMARY KEY,
  entry_type  TEXT,       -- p._type ("pe" ইত্যাদি)
  total_cost  REAL,
  date_key    TEXT,        -- p.dateKey, না থাকলে p.createdAt-এর প্রথম ১০ ক্যারেক্টার
                            -- (JS-এর "dateKey === todayKey || createdAt.startsWith(todayKey)"
                            -- ফলব্যাক লজিকের সাথে সামঞ্জস্যপূর্ণ, দেখুন DataStore.js HOT_FIELDS)
  updated_at  TEXT,        -- p.at ইত্যাদি (ISO — bookkeeping only)
  -- 🆕 এন্ট্রি ৪১ (ধাপ ৬, computeSupplierDueMap) — নিচের "supplier due-map" কমেন্ট-
  -- ব্লক দ্রষ্টব্য। _type নির্বিশেষে (সব purchaseOrders এন্ট্রি, শুধু "pe" না — JS
  -- computeSupplierDueMap()-এর ঠিক একই স্কোপ, entry_type='pe' ফিল্টার এখানে নেই)।
  supplier_due_key      TEXT,   -- normalizeSupplierKey(po.supplier || po.company || "")
  supplier_due_raw      TEXT,   -- (po.supplier || po.company || "").trim()
  purchase_amount       REAL,   -- (po.items||[]).reduce((s,it)=>s+(it.qty||0)*(it.costPrice||it.price||0),0)
                                 -- — items-এর নেস্টেড গঠন JS-এই পার্স হয় (batches-এর
                                 -- মতোই, JSON1 ছাড়াই এক্সট্র্যাক্ট-টাইমে JS reduce)
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchaseorders_type_date ON purchaseOrders(entry_type, date_key);
CREATE INDEX IF NOT EXISTS idx_purchaseorders_supplier_key ON purchaseOrders(supplier_due_key);

-- ── supplierPayments ─────────────────────────────────────────────────────
-- 🆕 এন্ট্রি ৪১ (ধাপ ৬, SupplierPaymentModule) — নিচের "supplier due-map" কমেন্ট-
-- ব্লক দ্রষ্টব্য।
CREATE TABLE IF NOT EXISTS supplierPayments (
  id                TEXT PRIMARY KEY,
  supplier_due_key  TEXT,      -- normalizeSupplierKey(p.supplierName || "")
  supplier_due_raw  TEXT,      -- (p.supplierName || "").trim()
  type              TEXT,      -- payment | due
  amount            REAL,
  signed_amount     REAL,      -- type==='due' ? -amount : amount — SUM(signed_amount) সরাসরি "paid" দেয়
  date_key          TEXT,
  updated_at        TEXT,      -- p.createdAt (bookkeeping only)
  data              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplierpayments_key ON supplierPayments(supplier_due_key);

-- ── supplier due-map — ধাপ ৬ (এন্ট্রি ৪১) ডিজাইন নোট ────────────────────────
-- src/logic.js-এর computeSupplierDueMap() ৩টা কালেকশন (products, purchaseOrders,
-- supplierPayments) জুড়ে ফাজি সাপ্লায়ার-নাম merge করে — normalizeSupplierKey()
-- (lowercase + suffix-strip regex + typo-alias lookup) দিয়ে normalize, তারপর
-- একই normalized key-এর সবচেয়ে লম্বা raw নামকে canonical ডিসপ্লে-নাম বাছাই করে।
--
-- এই normalize+regex+alias লজিক SQLite-এ (কোনো regex এক্সটেনশন ছাড়া) নির্ভরযোগ্যভাবে
-- রেপ্লিকেট করা কঠিন/ঝুঁকিপূর্ণ — তাই এখানেও (browse_rank/stockValue-এর মতোই)
-- "যা নেস্টেড/স্ট্রিং-প্রসেসিং-নির্ভর তা extract()-এ JS দিয়ে প্রিকম্পিউট করে ফ্ল্যাট
-- কলামে বসানো, শুধু GROUP BY/SUM-এর মতো সেট-বেসড অ্যাগ্রিগেশন SQL-এ" — এই নীতি
-- অনুসরণ করা হয়েছে। normalizeSupplierKey() নিজেই SQL-এ কখনো চলে না — শুধু
-- JS extract()-এ চলে, ঠিক যেভাবে live JS ফাংশনটাও চলে (behavioral parity by
-- construction, দুই জায়গায় আলাদা কোড পাথ কপি-পেস্ট করে মেলানোর ঝুঁকি নেই)।
--
-- ⚠️ একটা ছোট, স্বীকৃত (non-financial) বিচ্যুতি: canonical ডিসপ্লে-নাম বাছাইয়ে
-- JS ঠিক Set-ইনসার্শন-অর্ডারে প্রথম সর্বোচ্চ-length ভ্যারিয়েন্ট রাখে (products →
-- purchaseOrders → supplierPayments ক্রমে), SQL সংস্করণ (DataStore.js-এর
-- getSupplierDueRows()) একই-length টাই হলে ভিন্ন ভ্যারিয়েন্ট বাছাই করতে পারে।
-- এটা শুধু *ডিসপ্লে নামের* একটা প্রান্তিক এজ-কেস (দুটো ভিন্ন raw-নাম ভ্যারিয়েন্ট
-- ঠিক একই ক্যারেক্টার-length হলেই) — টাকার হিসাব (productCount/totalStock/
-- totalPurchased/paid/due) কোনোভাবেই এতে প্রভাবিত হয় না, কারণ সেগুলো normalized
-- key দিয়েই গ্রুপ হয়, ডিসপ্লে-নামের সাথে সম্পর্কহীন।

-- ── txns ─────────────────────────────────────────────────────────────────
-- 🆕 এন্ট্রি ৩৮। todayBakiIncurred/todayJoma অ্যাগ্রিগেটে invoice_id দিয়ে
-- invoices.status='voided' চেক করতে হয় (invoices টেবিলের সাথে সাব-কোয়েরি) —
-- তাই invoice_id প্রমোট করা হলো।
CREATE TABLE IF NOT EXISTS txns (
  id          TEXT PRIMARY KEY,
  type        TEXT,        -- baki | joma
  source      TEXT,
  amount      REAL,
  invoice_id  TEXT,
  date_key    TEXT,
  updated_at  TEXT,        -- t.time (bookkeeping only)
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_txns_type_date ON txns(type, date_key);
CREATE INDEX IF NOT EXISTS idx_txns_invoice   ON txns(invoice_id);

-- ── returns ──────────────────────────────────────────────────────────────
-- 🆕 এন্ট্রি ৩৮। todayReturnsRefund/profit-impact-এও invoice_id দিয়ে ভয়েডেড
-- ইনভয়েসের রিটার্ন বাদ দিতে হয় (getVoidedInvoiceIds/filterReturnsExcludingVoided-এর
-- SQL সমতুল্য, invoices-এর সাথে NOT EXISTS সাব-কোয়েরি)।
CREATE TABLE IF NOT EXISTS returns (
  id             TEXT PRIMARY KEY,
  invoice_id     TEXT,
  refund_amount  REAL,
  cost_price     REAL,
  qty            REAL,
  refund_mode    TEXT,      -- cash | baki ...
  date_key       TEXT,
  updated_at     TEXT,      -- r.createdAt (bookkeeping only)
  data           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_returns_date    ON returns(date_key);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON returns(invoice_id);

-- ── stockMovements ───────────────────────────────────────────────────────
-- 🆕 এন্ট্রি ৩৯। useKpiStats-এর monthExpiredValue/monthExpiredCount-এর জন্য —
-- শুধু source='expired_removal' এন্ট্রি প্রাসঙ্গিক (অন্যান্য source যেমন "quick"/
-- "sale" এই KPI-তে ব্যবহৃত হয় না, তাই এখানে ইনডেক্স করা হয়নি)। month_key কলাম
-- mv.monthKey, না থাকলে mv.dateKey-এর প্রথম ৭ ক্যারেক্টার (App.jsx-এর
-- "mv.monthKey || mv.dateKey.slice(0,7)" ফলব্যাকের সমতুল্য)।
CREATE TABLE IF NOT EXISTS stockMovements (
  id          TEXT PRIMARY KEY,
  source      TEXT,
  month_key   TEXT,
  value       REAL,
  updated_at  TEXT,      -- mv.at (bookkeeping only)
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stockmovements_source_month ON stockMovements(source, month_key);

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
