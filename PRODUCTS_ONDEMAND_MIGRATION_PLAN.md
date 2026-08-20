# Products On-Demand Migration — বহু-সেশন প্ল্যান

> ## 🗄️ ARCHIVED / STALE (SQLITE_MIGRATION_LOG.md-এর এন্ট্রি ৯০-এ কনফার্মড, এন্ট্রি ৯১-এ নোট করা)
>
> **এই ডকুমেন্টটা এন্ট্রি ৪৪ পর্যন্তই আপডেটেড — তারপরের never-load-ভিত্তিক অগ্রগতি (মূল লগের
> এন্ট্রি ৭৮-৯১) কখনো এতে merge হয়নি।** নিচের প্ল্যান (ধাপ ১-৭, ৭.১-৭.৩) মূলত ধরে নিয়েছিল `products`
> boot-এ পুরো অ্যারে লোড হতেই থাকবে, আর প্রতিটা রিড-প্যাটার্ন আলাদাভাবে SQL-এ কনভার্ট করে ধীরে ধীরে
> lazy-boot-এর দিকে যাওয়া হবে। বাস্তবে মূল লগে একটা ভিন্ন, দ্রুততর পথ (`sbm_products_boot_never`
> ফ্ল্যাগ — "never-load" মোড) নেওয়া হয়েছে, যেখানে `products` React state boot-এই সরাসরি খালি রাখা
> হয় আর সবকিছু global `productsById` Map (SQLite-হাইড্রেটেড) + on-demand browse/cart map থেকে চলে —
> এটাই কার্যত এই প্ল্যানের ধাপ ৭-এর লক্ষ্য, কিন্তু সম্পূর্ণ আলাদা মেকানিজমে অর্জিত।
>
> **নিচের ক্যাটাগরি ③ (FULL-SCAN) আইটেমগুলোর আপডেটেড স্ট্যাটাস (এন্ট্রি ৯০-এ ভেরিফাইড, সবগুলো ✅ কোড-সম্পূর্ণ)**:
> - `getKnownSuppliers()` → `useKnownSuppliers()` (SQL distinct) — ✅
> - `getKnownCustomDosageForms()` → `useKnownDosageForms()` (SQL distinct) — ✅
> - SmartInvoiceBuilder ক্যাটাগরি-লিস্ট → `useKnownCategories()` (SQL distinct) — ✅
> - Products ডুপ্লিকেট-নাম চেক → `name_norm` ইনডেক্সড SQL lookup — ✅
> - (বোনাস) `AIPage_`-এর outOfStock/expiry স্ক্যান → `useOutOfStockCount()`/`useExpiryCandidates()` — ✅
>
> **এই ডকুমেন্ট এখন শুধু ঐতিহাসিক রেফারেন্স হিসেবে রাখা হলো** (কল-সাইট ইনভেন্টরি হিসেবে এখনো কিছুটা
> কাজে লাগতে পারে) — **নতুন সেশনে এটা আর আপলোড করার দরকার নেই, শুধু `SQLITE_MIGRATION_LOG.md`
> (মাস্টার স্ট্যাটাস সেকশন) যথেষ্ট।**

---

> **উদ্দেশ্য (মূল, আর্কাইভড প্ল্যান)**: `products` টপ-লেভেল React state (এখন সবসময় পুরো অ্যারে মেমরিতে, boot-এই লোড হয়) থেকে
> বেরিয়ে, ১ লাখ পণ্য/দোকান টার্গেটে SQLite-ব্যাকড on-demand অ্যাক্সেসে যাওয়া। এই ফাইল প্রতিটা নতুন
> সেশনে SQLITE_MIGRATION_LOG.md-এর পাশাপাশি আপলোড করে কাজ চালিয়ে যাওয়া যাবে। *(⚠️ উপরের আর্কাইভ নোট দেখুন — আর প্রযোজ্য না)*
>
> **প্রেক্ষাপট**: SQLITE_MIGRATION_LOG.md-এর এন্ট্রি ২৯-এ ধরা পড়েছিল যে "products-কে invoices-এর
> মতো windowed করা" আসলে ভুল ফ্রেমওয়ার্ক — invoices-এ প্রাকৃতিক টাইম-কাটঅফ আছে (৬ মাস পুরনো =
> নিষ্ক্রিয়), products-এ নেই (৫ বছর আগের পণ্যও আজ বিক্রি হতে পারে, POS-এ তাৎক্ষণিক লাগবে)। তাই সঠিক
> ডিজাইন হলো: `products` রিড-এক্সেসের প্রতিটা প্যাটার্ন আলাদাভাবে চিহ্নিত করে, প্রতিটার জন্য উপযুক্ত
> SQLite-ভিত্তিক বিকল্প বসানো (lookup → getById/Map, aggregate → SQL SUM/COUNT, search → hybrid FTS
> + pagination) — তারপরই `products` boot-লোড আসলে ছোট/লেজি করা সম্ভব হবে।

---

## ⚠️ চিরস্থায়ী নিয়ম (SQLITE_MIGRATION_LOG.md থেকে প্রযোজ্য)
1. প্রতিটা কল-সাইট বদলানোর সময় পুরনো পাথ **সম্পূর্ণ সরানো যাবে না** যতক্ষণ না নতুন পাথ real-device
   ভেরিফায়েড — `isSqliteEnabled()` গার্ড দিয়ে ফলব্যাক রাখা বাধ্যতামূলক (এন্ট্রি ২৯-এর প্যাটার্ন অনুসরণ)।
2. প্রতিটা ধাপের পর টেস্ট আবশ্যক (`npm test` + real-device স্মোক-টেস্ট)।
3. একটা ফিচার পরিবর্তন করলে সেটার **সব** ব্যবহৃত জায়গা খুঁজে বের করে চেক করতে হবে (নিচের ইনভেন্টরি
   এই কারণেই আগে সম্পূর্ণ করা হলো)।
4. `products` **কখনোই সম্পূর্ণ মেমরি থেকে সরানো যাবে না** POS বিলিং স্ক্রিন কাজ করার আগ পর্যন্ত —
   বিলিং কাউন্টারে যেকোনো পণ্য তাৎক্ষণিক সার্চেবল থাকতে হবে, এটাই সবচেয়ে কড়া constraint।

---

## 📋 সম্পূর্ণ কল-সাইট ইনভেন্টরি (এই সেশনে করা কোড-অডিট থেকে)

`products` prop হিসেবে নেয় এমন ২০টা কম্পোনেন্ট/ফাংশন পাওয়া গেছে। প্যাটার্ন অনুযায়ী ৫টা ক্যাটাগরিতে ভাগ করা হলো:

### ক্যাটাগরি A — ID-ভিত্তিক lookup (ইতিমধ্যে আংশিক সমাধান আছে)
বেশ কিছু জায়গায় লোকাল `new Map(products.map(p => [p.id, p]))` বানানো হয় (প্রতি রেন্ডারে/useMemo-তে রিকম্পিউট):
- `CustomerDetail` (লাইন ~26479) — `prodMap` লোকাল Map
- `ExpenseTracker`/`buildDailySummaryData` এলাকা (লাইন ~30916 সংলগ্ন) — `prodMap`
- `AuditTrailModule` (লাইন ~32853/33006) — `prodMap`
- `InvoiceVoidModal` — সরাসরি `products` prop পাস, ভেতরে lookup

**গুরুত্বপূর্ণ**: SQLITE_MIGRATION_LOG.md-এর মাস্টার স্ট্যাটাসে ইতিমধ্যে **"getState() write-through Map (৭ কল-সাইট)"** ডান+ভেরিফায়েড লেখা আছে — অর্থাৎ একটা গ্লোবাল `productsById` Map (Zustand `useAppStore`-এ, `subscribe()` দিয়ে সবসময় সিঙ্ক থাকে) ইতিমধ্যেই বিদ্যমান ও প্রমাণিত। উপরের ৩-৪টা কল-সাইট আসলে **নতুন SQLite কাজ না়, শুধু consolidation** — লোকাল `useMemo(() => new Map(products.map(...)))` সরিয়ে গ্লোবাল `useAppStore(s => s.productsById)` ব্যবহার করলেই এই ক্যাটাগরি শেষ। **সবচেয়ে কম ঝুঁকি, সবচেয়ে কম কাজ — প্রথম ধাপ হিসেবে প্রস্তাবিত।**

### ক্যাটাগরি B — পুরো array-এর উপর aggregate/reduce (SQL SUM/COUNT/GROUP BY দিয়ে প্রতিস্থাপনযোগ্য)
- `useKpiStats` (লাইন ৮৯৪৮) — KPI ড্যাশবোর্ড হিসাব, `prodAll = products || []` নিয়ে ব্যবহার করে (ঠিক কী হিসাব করে তা এই সেশনে বিস্তারিত দেখা হয়নি — **পরের সেশনে প্রথম কাজ**)
- `AIPage_` (লাইন ৯২৫৮) — `prodAll` দিয়ে AI/অ্যানালিটিক্স ড্যাশবোর্ড
- `AnalyticsSection_` (লাইন ২০২৬৮) — `.map()`/`.find()`, ২টা ব্যবহার
- `InventorySection` (লাইন ২০৬১১) — **নিম্ন-স্টক/রিঅর্ডার অ্যালার্ট**: `.filter(p => p.productType!=="service" && stock>0 && stock<=minStockAlert)` — সরাসরি `WHERE product_type != 'service' AND stock > 0 AND stock <= min_stock_alert` কোয়েরিতে যাবে, কিন্তু schema-তে `min_stock_alert` কলাম আছে কিনা যাচাই করা লাগবে
- `ProfitStatementCard` (লাইন ২০৮৭৩) — `.map()`, লাভ-ক্ষতি হিসাব
- `Dashboard` (লাইন ২১৫৮০) — **সবচেয়ে বেশি ব্যবহার (২৩টা)**: ১১টা `filter`, ৭টা `map`, ৩টা `forEach`, ২টা `reduce` — এই কম্পোনেন্ট সবচেয়ে বড়/জটিল, আলাদাভাবে গভীর অডিট লাগবে
- `SupplierPaymentModule` (লাইন ২৯৮৭৩) — `computeSupplierDueMap(products, purchaseOrders, supplierPayments)` — products+POs+payments তিনটা সোর্স জয়েন করে হিসাব, কাস্টম ডিজাইন লাগবে (SQL join বা multi-query)
- `buildDailySummaryData`, `DailyNotifCard`, `DailySummaryModule`, `DailySalesStockCard`, `AuditTrailModule` — সবগুলো pass-through বা হালকা ব্যবহার, বেশিরভাগই উপরের `useKpiStats`/`InventorySection`-এর ফলাফলের উপর নির্ভরশীল হতে পারে (যাচাই লাগবে)

**নোট**: SQLITE_MIGRATION_LOG.md-এ `aggregate()` ফাংশন (dsAggregate) ইতিমধ্যে DataStore.js-এ আছে ও ব্যবহৃত হচ্ছে (মাস্টার স্ট্যাটাসে "atomic stats updates via Firestore increment()" ও পুরনো Firestore-era কাজ থেকে ধারণা এসেছে) — এই ক্যাটাগরির কাজ হবে প্রতিটা নির্দিষ্ট aggregate-এর জন্য সঠিক SQL কোয়েরি ডিজাইন করে `dsAggregate()`/নতুন হেল্পার ফাংশন লেখা, ধাপে ধাপে একটা একটা কল-সাইট সরানো (Dashboard-এর ২৩টা ব্যবহার একসাথে না, ভাগ ভাগ করে)।

### ক্যাটাগরি C — সার্চ/ব্রাউজ UI (এন্ট্রি ২৯-এ ইতিমধ্যে ডিজাইন প্রস্তাবিত)
- `Products` main list (লাইন ২৭২৬৫, `filteredAll` → Virtuoso ~লাইন ২৯২৬৮) — ১১টা ব্যবহার (৬টা `find`, ৩টা `filter`)
- `SmartInvoiceBuilder` POS product picker (লাইন ১৭৯০১) — ৮টা ব্যবহার (৪টা `find`, ২টা `map`, ১টা `filter`, ১টা `forEach`)

এই দুটোর জন্য এন্ট্রি ২৯-এ প্রস্তাবিত ডিজাইন প্রযোজ্য: ডিফল্ট ব্রাউজ অবস্থায় SQLite `queryPage()` (demand_type কলাম+ইনডেক্স সহ), সার্চ-অ্যাক্টিভ অবস্থায় বিদ্যমান hybrid FTS+JS scoring প্যাটার্নই থাকবে (নতুন ডিজাইন লাগবে না)।

### ক্যাটাগরি D — একক-রেকর্ড এডিট/রেফারেন্স (কম ঝুঁকি, ইতিমধ্যে অনেকটা id-ভিত্তিক)
- `BatchSyncTool` (লাইন ২৯৫৬৬) — ১টা `find`
- `InvoiceVoidModal`, `ReturnModule`, `ExpenseTracker` — সরাসরি prop পাস, ভেতরে হালকা ব্যবহার

---

## 🗺️ প্রস্তাবিত ধাপ (প্রতিটা আলাদা সেশনে, আগেরটা real-device ভেরিফাই করার পর পরেরটা)

### ধাপ ১ — Map consolidation (ক্যাটাগরি A) — সবচেয়ে কম ঝুঁকি, শুরু করার জন্য ভালো
লোকাল `useMemo(() => new Map(products.map(...)))` প্যাটার্নগুলো (CustomerDetail, ExpenseTracker এলাকা,
AuditTrailModule) সরিয়ে গ্লোবাল `useAppStore(s => s.productsById)` বসানো। কোনো নতুন SQL/schema লাগে না,
বিদ্যমান-প্রমাণিত প্যাটার্ন reuse। **এখনো `products` prop-drilling বন্ধ হয় না** (অন্য অনেক কল-সাইট এখনো
পুরো অ্যারে চায়), কিন্তু রিডানডেন্ট recomputation কমে।

### ধাপ ২ — InventorySection নিম্ন-স্টক অ্যালার্ট (ক্যাটাগরি B, ছোট/স্বাধীন অংশ)
schema-তে `min_stock_alert`/`product_type` কলাম আছে কিনা যাচাই, না থাকলে যোগ+ইনডেক্স, তারপর
`.filter()`-কে SQL `WHERE` কোয়েরিতে বদলানো। ছোট, স্বাধীন, অন্য কিছুর উপর নির্ভর করে না।

### ধাপ ৩ — useKpiStats গভীর অডিট + SQL aggregate ডিজাইন (ক্যাটাগরি B-এর মূল অংশ)
Dashboard-এর ভিত্তি এটাই — কী কী KPI ঠিক কীভাবে হিসাব হয় তা লাইন-বাই-লাইন পড়ে, প্রতিটার জন্য
`dsAggregate()`-ভিত্তিক প্রতিস্থাপন ডিজাইন করা। এটা একাই একটা পূর্ণ সেশনের কাজ হতে পারে (২৩টা
ব্যবহার-সাইট আছে Dashboard-এই)।

### ধাপ ৪ — Products main list pagination (ক্যাটাগরি C, অংশ ১)
এন্ট্রি ২৯-এর প্রস্তাবিত ডিজাইন প্রয়োগ — `demand_type` কলাম+ইনডেক্স, ব্রাউজ/সার্চ path split,
সিরিয়াল নম্বর অফসেট-ভিত্তিক।

### ধাপ ৫ — POS product picker (ক্যাটাগরি C, অংশ ২, সবচেয়ে স্পর্শকাতর)
বিলিং কাউন্টারের UX ঝুঁকি সবচেয়ে বেশি (এন্ট্রি লগে আগেই নোট হয়েছিল) — সবার শেষে, ধাপ ১-৪ থেকে শেখা
প্যাটার্ন প্রয়োগ করে।

### ধাপ ৬ — SupplierPaymentModule + বাকি ছোট কল-সাইট
`computeSupplierDueMap` ও অবশিষ্ট ছোট ব্যবহারগুলো, ধাপ ১-৫ শেষ হওয়ার পর যা বাকি থাকে।

### ধাপ ৭ (শেষ, শুধু সব আগের ধাপ সম্পূর্ণ+real-device ভেরিফায়েড হলে) — `products` boot-লোড লেজি করা
এই ধাপেই আসল মেমরি-সেভিংস আসবে — এর আগে কিছুই মেমরি কমাবে না, শুধু রিড-প্যাটার্ন প্রস্তুত করে।

**🟡 এন্ট্রি ৪২ (SQLITE_MIGRATION_LOG.md) — অডিট সম্পূর্ণ, cutover শুরু হয়নি**: আসল ব্লকার = `productsById` global Map সিঙ্ক্রোনাসভাবে পুরো `products` অ্যারে থেকে রিবিল্ড হয় (App.jsx লাইন ৩৭৯-৩৮২), ৬৭টা ব্যবহার-সাইট এর উপর নির্ভরশীল — POS পিকার/Products লিস্ট SQL দিয়ে শুধু *অর্ডার* ঠিক করে, কার্ড-রেন্ডারের জন্য পূর্ণ product object এখনো এই সিঙ্ক Map থেকেই আসে। `DataStore.getByIds()` (ব্যাচ id-লুকআপ, ৫০০-চাংক, অর্ডার-প্রিজার্ভড, ৮-কেস টেস্টেড) ভিত্তি হিসেবে যোগ হয়েছে।

**🟡 এন্ট্রি ৪৩ — ৭.১ (ক্যাটাগরাইজেশন) + ৭.২ (async hook) সম্পূর্ণ, ৭.৩ (বুট পরিবর্তন) ব্লকড**: বিস্তারিত নিচে ও SQLITE_MIGRATION_LOG.md এন্ট্রি ৪৩-এ।

**🟢 এন্ট্রি ৪৪ — ক্যাটাগরি ③-এর ৪টার মধ্যে ৩টা SQL cutover সম্পূর্ণ**: dup-name check, category-list, supplier/dosageForm অটো-সাজেস্ট — কোড-সম্পূর্ণ, sandbox esbuild-ভেরিফায়েড, `npm test` এখনো বাকি (sandbox নেটওয়ার্ক ব্লকড)। AIPage_ forecast/expired-scan এখনো বাকি — এটাই এখন ৭.৩-এর একমাত্র অবশিষ্ট ব্লকার। বিস্তারিত SQLITE_MIGRATION_LOG.md এন্ট্রি ৪৪-এ।

### ৭.১ — ব্যবহার-সাইট ক্যাটাগরাইজেশন (এন্ট্রি ৪৩-এ সম্পূর্ণ)

App.jsx-এ `products`/`productsById`/`prodMap`/`prodAll` ব্যবহার করা ৯৪টা লাইন (গ্রেপ-কনফার্মড) কম্পোনেন্ট-ভিত্তিক ৩টা ক্যাটাগরিতে ভাগ করা হলো:

**ক্যাটাগরি ①  AGGREGATE — ইতিমধ্যে SQL-cutover, `products` এখানে শুধু fallback**
`useProductStockTotals`/`useExpiredRemovalTotals` (৯১৪৪+), `useKpiStats`-এর বাকি অংশ, `InventorySection`, `AnalyticsSection_`, `ProfitStatementCard`, `Dashboard`-এর `reorderAlerts`, `SupplierPaymentModule`/`useSupplierDueRows`, `DailySalesStockCard`, `DailySummaryModule`, `DailyNotifCard`। — এই গ্রুপে `products` prop এখনো লাগে (JS ফলব্যাক-পাথের জন্য), কিন্তু `isSqliteEnabled()` true থাকলে ব্যবহারিকভাবে অদরকারি। lazy-boot হলে এই ফলব্যাকগুলো সাময়িক ভুল সংখ্যা (0/আংশিক) দেখাতে পারে SQL রেজাল্ট আসার আগ পর্যন্ত — টাকার হিসাবে নন-ব্লকিং (এন্ট্রি ৩৯-এর মতো async race-প্রুফ প্যাটার্নেই, কিন্তু transient glitch-এর ঝুঁকি নতুন করে বাড়বে যদি `products` শুরুতে খালি থাকে)।

**ক্যাটাগরি ②  VISIBLE-ID — সত্যিকারের lazy-boot প্রার্থী, `getByIds()`/`useProductsByIds()` দিয়ে প্রতিস্থাপনযোগ্য**
- POS পিকার (`SmartInvoiceBuilder`) — `browseIds.map(id => productsByIdMap.get(id))` (লাইন ১৮৪৭৯), cart lookup (`invProdMap`, লাইন ১৮৫১৫), receipt/sale product lookup (১৮৭১৪, ১৮৯৩০, ১৮৯৫২-৩, ২০২৪১)
- Products main list card রেন্ডার (এন্ট্রি ৩০-এর SQL browse ordering-এর সাথে জোড়া)
- `SmartBusinessMgmt`-এর `createInvoice()`/sale ফ্লো (১৩৯৯৯-১৪৫৬৭) — নির্দিষ্ট বিক্রিত `productId`-এর স্টক-ডিডাকশন লুকআপ
- `CustomerDetail`, `ExpenseTracker`, `AuditTrailModule`, `DailySalesStockCard`, `BatchSyncTool`, `InvoiceVoidModal`, `ReturnModule` — প্রতিটাই নির্দিষ্ট ইনভয়েস/রিটার্ন লাইন-আইটেমের product data রেন্ডার করে, কখনো পুরো ক্যাটালগ স্ক্যান করে না
- Purchase Entry-এর একক-প্রোডাক্ট রেফারেন্স (`peSelProdForBatch`, লাইন ২৮০০৪)

**ক্যাটাগরি ③  FULL-SCAN — সত্যিকারের পুরো ক্যাটালগ দরকার, `getByIds()`-এ যাবে না, আলাদা SQL DISTINCT/aggregate লাগবে (৭.৩-এর পূর্বশর্ত, নতুন এই অডিটে ধরা পড়েছে)**
- `getKnownSuppliers()` (লাইন ৮৯৭) / `getKnownCustomDosageForms()` (৯০৭) — পুরো ক্যাটালগ থেকে distinct company/dosageForm বের করে (SupplierPicker/dosage-chip অটো-সাজেশনের জন্য) → `SELECT DISTINCT supplier_due_raw FROM products` টাইপ কোয়েরিতে যাবে, dosageForm-এর জন্য নতুন কলাম লাগবে (এখনো schema.sql-এ নেই)
- SmartInvoiceBuilder-এর ক্যাটাগরি-লিস্ট বিল্ডার (লাইন ১৮৩৫৫, `new Set(products.map(p => p.category))`) → `SELECT DISTINCT category FROM products`-এ যাবে
- Products main list-এ ডুপ্লিকেট-নাম চেক (লাইন ২৮১৬২, নতুন প্রোডাক্ট সেভের আগে) → `SELECT id FROM products WHERE name_norm = ?` (schema-তে `name_norm` কলাম ইতিমধ্যে আছে, তাই এটা সবচেয়ে সহজ কনভার্শন)
- `AIPage_`-এর forecast/expired-scan/টিপস (এন্ট্রি ৪১-এ আগে থেকেই "বাকি কাজ" হিসেবে ফ্ল্যাগড, এই অডিট শুধু নিশ্চিত করল এটা ৭.৩-এরও প্রকৃত ব্লকার)

**⚠️ মূল উপসংহার**: ক্যাটাগরি ③ সম্পূর্ণ SQL-কভার্ড না হওয়া পর্যন্ত `products`-কে বুটে *সম্পূর্ণ বাদ* দেওয়া যাবে না (এই ফাংশনগুলো ক্র্যাশ করবে/ভুল ফলাফল দেবে)। এটাই ৭.৩ (বুট সিকোয়েন্স পরিবর্তন) এই মুহূর্তে সম্পূর্ণ করা যায়নি কেন — বিস্তারিত এন্ট্রি ৪৩ দ্রষ্টব্য।

### ৭.২ — async cache hook (এন্ট্রি ৪৩-এ কোড-সম্পূর্ণ, wire করা হয়নি)
`useProductsByIds(ids, businessType, productsByIdMap)` — App.jsx-এ যোগ হয়েছে (KpiCardsGrid-এর কাছে, useProductStockTotals-এর ঠিক আগে)। `productsByIdMap`-এ id না পাওয়া গেলেই শুধু `DataStore.getByIds()` ব্যাচ-কল করে, ইতিমধ্যে-ক্যাশড/in-flight id দ্বিতীয়বার ফেচ করে না। এই মুহূর্তে `products` সবসময় পূর্ণ থাকায় (৭.৩ হয়নি) এই হুকের SQL-পাথ বাস্তবে কখনো চলে না — শুধু কোড-রেডি, ভবিষ্যতের জন্য।

### ৭.৩ — বুট সিকোয়েন্স পরিবর্তন — **এখনো করা হয়নি, ইচ্ছাকৃতভাবে**
কারণ: ক্যাটাগরি ③ (উপরে) এখনো SQL-cutover হয়নি বলে বুট থেকে `products` সরালে ওই ফাংশনগুলো ভাঙবে। PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর নিজস্ব নিয়ম #৪ ("products কখনোই সম্পূর্ণ মেমরি থেকে সরানো যাবে না POS বিলিং কাজ করার আগ পর্যন্ত") এবং entry ৪০-এর POS picker real-device টেস্ট এখনো বাকি থাকা — দুটো কারণেই এই মুহূর্তে বুট-লজিক বদলানো ৫০০ লাইভ দোকানে অপ্রয়োজনীয় ঝুঁকি। প্রস্তাবিত পরবর্তী ক্রম: ক্যাটাগরি ③-এর ৪টা আইটেম SQL-এ আনা (প্রতিটা ছোট, স্বাধীন, এন্ট্রি ৩৭-৪১-এর প্যাটার্নেই) → এন্ট্রি ৪০ real-device টেস্ট → তারপরই ৭.৩ (বুট থেকে bounded/lazy সেট আনা)।

---

## 🔴 এখনো অজানা / পরের সেশনে যাচাই করতে হবে
- `useKpiStats`-এর ভেতরের হিসাবগুলো এই সেশনে বিস্তারিত পড়া হয়নি
- `Dashboard`-এর ২৩টা ব্যবহার-সাইট আলাদাভাবে ভাগ করে দেখা হয়নি
- schema.sql-এ `min_stock_alert`/`product_type` কলাম আছে কিনা কনফার্ম করা হয়নি
- `computeSupplierDueMap()`-এর আসল লজিক পড়া হয়নি

**এই প্ল্যান ডকুমেন্টটা নিজেই কোনো লাইভ কোড টাচ করেনি — শুধু ইনভেন্টরি+প্ল্যান, তাই রিস্ক-ফ্রি।**
