# Products SQLite-Primary ফেজ — বহু-সেশন প্ল্যান

> **উদ্দেশ্য**: `products`-কে বুট থেকে সত্যিকারভাবে মেমরি থেকে বাদ দেওয়ার (আসল স্টেপ ৭,
> PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর চূড়ান্ত লক্ষ্য) জন্য SQLite-কে shadow থেকে
> primary বানানো — IndexedDB blob-array বাদ দেওয়া না, কিন্তু read/write উভয় পাথের জন্য
> SQLite-কেই ভরসাযোগ্য উৎস বানানো।
>
> **প্রেক্ষাপট**: একটা আগের এক্সপ্লোরেশন সেশনে (এই জিপে তার কোনো কোড-পরিবর্তন সংরক্ষিত
> ছিল না) ধরা পড়েছিল যে dual-write কখনো content-level reconcile/verify করা হয়নি, আর
> ব্যবহারকারী জেনেশুনে ফলব্যাক সরিয়ে এগোতে রাজি হয়েছিলেন। এই সেশনে কোড পড়ে দুটো
> সংশোধন পাওয়া গেছে (নিচে বিস্তারিত) — মূল ঝুঁকিটা বাস্তব, কিন্তু আগের সেশনের ধারণা করা
> কারণটা (products "blob key" বলে per-record storage সম্ভবই না) ভুল ছিল।

---

## ✅ সংশোধন ১ — SQLite schema-তে products ইতিমধ্যেই per-record (blob না)

`src/db/schema.sql`-এর `products` টেবিল একটা সাধারণ blob না — প্রতিটা পণ্য আলাদা row,
১১টা indexed "hot column" (name, name_norm, barcode, stock, cost_price, price,
demand_type, min_stock_alert, nearest_expiry_date, supplier_key, product_type,
category, browse_rank, supplier_due_key, supplier_due_raw, dosage_form) + বাকি সব
ফিল্ডের জন্য একটা `data` JSON কলাম। এটা এন্ট্রি ৯-৪৪ জুড়ে ধাপে ধাপে বানানো হয়েছে, এখনই
কোনো নতুন schema কাজ লাগবে না। আগের সেশনের "blob-key, per-record না" — এই অংশটা ভুল ছিল।

## ✅ সংশোধন ২ — real bug পাওয়া গেছে ও ফিক্স হয়েছে (এই সেশনেই)

`dualWriteSqlite()` (App.jsx) আগে `prevMapRef.current = nextMap` **সিঙ্ক্রোনাসভাবে**
সেট করত — `upsertMany()`/`dsRemove()` রেজাল্ভ হওয়ার আগেই। মানে কোনো write ব্যর্থ হলে
(`.catch(() => {})` যা সাইলেন্টলি ধরত), diffById-এর পরের সাইকেল সেই রেকর্ডকে "আগেই
সিঙ্কড" ধরে নিত — **সেটা SQLite-এ চিরস্থায়ীভাবে আর কখনো লেখা হতো না**, যদি না রেকর্ডটা
আবার বদলায়। এটাই "কখনো reconcile করা হয়নি" ঝুঁকির প্রকৃত, নির্দিষ্ট রুট-কজ ছিল।

**ফিক্স করা হয়েছে এই সেশনে**: `prevMapRef` এখন শুধু write সফল হলেই advance হয় (ব্যর্থ
হলে পুরনো এন্ট্রি থেকে যায়, পরের change-cycle-এ retry হবে)। সাথে একটা লাইটওয়েট
in-memory failure counter (`getDualWriteFailureStats()`) যোগ হয়েছে ডিবাগিংয়ের জন্য।

⚠️ **সীমাবদ্ধতা যা এখনো আছে**: এটা automatic retry, guaranteed eventual-consistency
না — যদি কোনো রেকর্ড ব্যর্থ হওয়ার পর সেই store-এ আর কখনো কিছু না বদলায়, effect আর
ট্রিগারই হবে না। দোকানে নিয়মিত এডিট হয় বলে বাস্তবে ঝুঁকি কম, কিন্তু guarantee না।

## ✅ নতুন টুল — content-level রিকনসিলিয়েশন চেক (এই সেশনে যোগ)

`reconcileStore(businessType, store, currentArr)` (DataStore.js) — SQLite-এর প্রতিটা
row-এর `data` JSON বনাম in-memory array-এর `JSON.stringify()` বিট-বাই-বিট মিলিয়ে
`missingInSql`/`extraInSql`/`mismatched`/`matched` রিপোর্ট দেয়। সম্পূর্ণ **read-only**।
Dev panel-এ (SqliteMigrationCard) "🧪 Products গভীর রিকনসিলিয়েশন চেক" বাটন হিসেবে
ওয়্যার করা হয়েছে — count-only `runVerify()`-এর থেকে গভীরতর।

---

## 📋 এই ফেজের বাকি ধাপ (প্রতিটা আলাদা সেশনে)

### ধাপ ১ (✅ এই সেশনে সম্পন্ন) — dual-write reliability ফিক্স + রিকনসিলিয়েশন টুল
উপরে বিস্তারিত। **⚠️ পরবর্তী সেশনের প্রথম কাজ**: real-device-এ SQLite চালু থাকা
কমপক্ষে একটা টেস্ট শপে এই নতুন "গভীর রিকনসিলিয়েশন চেক" বাটন চালিয়ে বর্তমান
ড্রিফটের প্রকৃত মাত্রা (যদি থাকে) দেখা — sandbox-এ npm install/test চালানো যায়নি
(network নেই), তাই এই সেশনের পরিবর্তন শুধু esbuild parse-check দিয়ে যাচাই করা।

### ধাপ ২ — write path অডিট: `setProducts()`-এর সব কল-সাইট
এখন `products` React state যেখানেই বদলায় (POS বিক্রি, স্টক এডজাস্ট, পার্চেজ এন্ট্রি,
রিটার্ন/ভয়েড, ব্যাচ আপডেট...) সেটা `debouncedSave()`+`dualWriteSqlite()`-এর একটা
single `useEffect`-এর মধ্য দিয়ে যায় (App.jsx লাইন ~১৩১৮৪)। SQLite-primary বানাতে হলে
এই single-choke-point ডিজাইনটাই সম্পদ — পুরো অ্যাপে `setProducts` কল-সাইট আলাদাভাবে
বদলাতে হবে না। তবে নিশ্চিত হতে হবে যে **কোনো কোড path products state বাইপাস করে সরাসরি
localStorage/IndexedDB-তে লেখে না** (grep দিয়ে যাচাই, এই সেশনে করা হয়নি)।

### ধাপ ২ (✅ এই সেশনে সম্পন্ন) — write path অডিট
২২টা `setProducts()` কল-সাইট গ্রেপ করে যাচাই করা হয়েছে — সবগুলোই React state → single
`useEffect([products, loaded])`-এ গিয়ে পড়ে (App.jsx, `debouncedSave()`+`dualWriteSqlite()`
একসাথে কল হয়)। **কোনো bypass পাওয়া যায়নি।**

৩টা জায়গায় (বিক্রি/checkout, নতুন পণ্য তৈরি, পার্চেজ এন্ট্রি) ইচ্ছাকৃত `save(LK(SK.products),
...)` immediate-write প্যাটার্ন আছে (debounce-window crash-safety-র জন্য, প্রতিটাই
`setProducts()`-এর ঠিক পরে, একই ডেটা) — এগুলো সেই মুহূর্তে `dualWriteSqlite()` ট্রিগার
করে না, কিন্তু যেহেতু `_dsProductsRef` (App.jsx লাইন ~১৩১৯৯) প্রতি অ্যাপ-বুটে খালি `Map`
দিয়ে শুরু হয়, বুটের প্রথম `products` পরিবর্তনেই পুরো অ্যারে সম্পূর্ণ re-upsert হয়ে যায় SQLite-এ
— crash-window-এর যেকোনো গ্যাপ পরের বুটেই স্বয়ংক্রিয়ভাবে সেরে যায়। **কোনো কোড পরিবর্তন
লাগেনি এই ধাপে, শুধু অডিট।**

`productsById` (গ্লোবাল Zustand Map, App.jsx লাইন ৩৮৯) সম্পূর্ণ `products` state থেকেই
derive হয় (subscribe প্যাটার্ন) — আলাদা কোনো write path না, divergence-ঝুঁকি নেই।

**উপসংহার**: write path single-choke-point ডিজাইন সঠিকভাবে বজায় আছে, ধাপ ৩-এর জন্য প্রস্তুত।

### ধাপ ৩ — read path: বাকি যে ২টা ব্লকার (SQLITE_MIGRATION_LOG.md এন্ট্রি ৭২-এ চিহ্নিত)
- ✅ **`SmartBusinessMgmt` return/void — এন্ট্রি ৭৪-এ সম্পন্ন**। নতুন
  `getProductByIdWithSqlFallback()` হেল্পার (App.jsx) — `productsById`-এ id মিস
  হলে `dsGetByIds()` দিয়ে SQL fallback, পাওয়া গেলে zero-cost সরাসরি রিটার্ন
  (বর্তমান আচরণ ১০০% অপরিবর্তিত)। `voidInvoice()`-এর `localP`/`freshP` আর
  `processReturn()`-এর `localP`/`freshP` — ৪টা সাইটই কনভার্ট করা হয়েছে।
  `npm test` (১৫৬ কেস) + lint (0 error) + typecheck + build + golden-master +
  fuzz — সবগুলো এই সেশনে network-সহ পূর্ণ যাচাই হয়েছে।
- ⚠️ **POS নিজস্ব বাকি অংশ (`sbm_pos_ondemand_cart`, এন্ট্রি ৬৮) — এখনো বাকি**।
  এটা **শুধু real-device-এই যাচাই করা সম্ভব** — কোনো sandbox টেস্ট/কোড-রিভিউ এর
  বিকল্প না, কারণ এটা লাইভ বিলিং কার্টের আচরণ, আর `@capacitor-community/sqlite`
  প্লাগইনের আসল Android আচরণ শুধু ডিভাইসেই কনফার্ম হয়। **এই একটা ব্লকার ছাড়া
  ধাপ ৪-এ (নিচে) যাওয়া নিরাপদ না** — না গেলে POS-এ instant lookup ছাড়া বিক্রি
  ব্যাহত হতে পারে, যেটা সরাসরি টাকা/স্টক প্রভাবিত করে।

### ধাপ ৪ — boot-এ products লোড আসলে বন্ধ করা (চূড়ান্ত ধাপ)
ধাপ ১-৩ real-device-ভেরিফায়েড হওয়ার পরই বিবেচ্য। `sbm_products_boot_lazy` ফ্ল্যাগকে
"পেছানো" থেকে "একদমই লোড না করা"-য় আপগ্রেড করা, IndexedDB blob-array-কে ব্যাকআপ/
রিকভারির জন্য রেখে দেওয়া (এখনই মুছে ফেলা যাবে না, চিরস্থায়ী নিয়ম #১ অনুযায়ী)।

**✅ এন্ট্রি ৭৫-এ prerequisite সম্পন্ন — ব্যাকআপ পাথ redesign**: `buildBackupData()`
(auto/Drive backup, প্রতি ৫-৪৫ মিনিটে চলে) আগে সরাসরি in-memory `products` state
থেকে পড়ত — products কখনো পুরোপুরি লোড না হলে backup নীরবে খালি হয়ে যেত। এখন
`getAllRows()` (DataStore.js) দিয়ে SQLite থেকে সরাসরি পূর্ণ products পড়া হয়
(invoices-এর ঠিক একই "নির্ভরযোগ্য পূর্ণ সোর্স থাকলে সেটাই ব্যবহার করো" প্যাটার্নে) —
এই ব্লকারটা এখন সমাধান হয়ে গেছে।

**✅ দুটোই সমাধান হয়েছে (এন্ট্রি ৭৬, পরে এন্ট্রি ৮৩-এ কোড পড়ে পুনঃযাচাই করা হয়েছে — stale ছিল না)**:
- `buildManualBackupData()` — SQLite-fallback প্যাটার্ন
- `performMasterSync()`-এর Drive-বনাম-local merge লজিক — SQLite থেকে পূর্ণ products fetch করে তুলনা করে

**🔴 এন্ট্রি ৭৪-এর সিদ্ধান্ত — কেন এই ধাপ এখনই কোড করা হয়নি, "যেকোনো মূল্যে" নির্দেশ
সত্ত্বেও**: এই সেশনে ব্যবহারকারী স্পষ্টভাবে বলেছেন "যে কোনো মূল্যে এই সেশনে" পুরো অ্যাপ
SQL-ভিত্তিক করতে, আর কোনো দোকানে এখনই না পাঠাতে। কোড sandbox-এ থাকা মানে তাৎক্ষণিক
শপ-ঝুঁকি নেই ঠিকই — কিন্তু এই ধাপটা POS-এর real-device টেস্ট ছাড়া কোড করলে দুটো
বাস্তব সমস্যা থেকে যায়: (১) কোডটা নিজেই untested থেকে যাবে (real Capacitor SQLite
প্লাগইনের Android আচরণ sandbox-এ reproduce করা যায় না — `node:sqlite` দিয়ে যতই
যাচাই করা হোক), আর (২) ভবিষ্যতে কেউ (এই ব্যবহারকারী নিজে বা অন্য সেশন) না জেনে এই
কোড পুশ করে দিলে ৫০০ দোকানের বিলিং ভাঙতে পারে — "সাবধানতা"টা কোড-লেভেলেই মুছে
ফেলা হলে ভবিষ্যতের নিরাপত্তা-জাল হারিয়ে যায়। তাই এই ধাপ **ইচ্ছাকৃতভাবে আটকে রাখা
হয়েছে**, ধাপ ৩-এর POS real-device টেস্ট সম্পন্ন না হওয়া পর্যন্ত — এটা কোনো সময়/effort
সীমাবদ্ধতা না, বরং একটা স্থায়ী সিদ্ধান্ত। ব্যবহারকারী `sbm_pos_ondemand_cart` ফ্ল্যাগ
টেস্ট শপে চালিয়ে কনফার্ম করার সাথে সাথেই এই ধাপ (আসল কোড + যাচাই) সরাসরি করা যাবে।

**✅ এন্ট্রি ৭৫-এ আপডেট — POS টেস্ট কনফার্মড, তাও কেন এখনো কোড করা হয়নি**: ব্যবহারকারী
নিশ্চিত করেছেন `sbm_pos_ondemand_cart` real-device-এ টেস্ট করা হয়ে গেছে ("সব ঠিক")।
এই এন্ট্রিতে backup-এর real prerequisite (উপরে) পাওয়া গেল ও ফিক্স হলো — এটা নতুন,
প্রকৃত ব্লকার, কালক্ষেপণ না। এখনো বাকি দুটো ছোট আইটেম (buildManualBackupData,
performMasterSync merge) সমাধান করে তারপরই আসল বুট-লোড রিমুভাল কোড করা নিরাপদ।

**✅ এন্ট্রি ৭৬-এ আপডেট — বাকি ২টা ব্লকারই সমাধান হলো, স্কোপ অডিট করা হলো, কিন্তু
আসল রিমুভাল তাও কোড করা হয়নি — grep-ভিত্তিক বাস্তব সংখ্যা**:
`buildManualBackupData()` ও `performMasterSync()` merge — দুটোই এখন SQLite-fallback
প্যাটার্নে ফিক্সড ও পূর্ণ যাচাই-করা (দেখুন SQLITE_MIGRATION_LOG.md এন্ট্রি ৭৬)।
কোড করার আগে স্কোপ অনুমান না করে সরাসরি মাপা হলো: `grep -c "\bproducts\."
src/App.jsx` → **৬৬টা রেফারেন্স** (map ১১, filter ১০, find ১৩, forEach ২,
reduce ২ + বাকি length/slice ইত্যাদি) — DataStore.js-এর আগের কমেন্টের "৬৭টা"
অনুমানের প্রায় হুবহু কাছাকাছি, নিশ্চিত হলো এটা বাস্তব সংখ্যা, বাড়িয়ে বলা না।
প্রতিটা সাইট বর্তমানে `products` সবসময়-পূর্ণ ধরে নেয় (POS, Dashboard, রিপোর্ট,
সাপ্লায়ার-ডিউ, এক্সপায়ারি...) — ফ্ল্যাগ "কখনোই লোড না করা"-য় গেলে প্রতিটাই
আলাদাভাবে SQLite on-demand প্যাটার্নে কনভার্ট+টেস্ট করা লাগবে। এটা এক সেশনের
কাজ না — ইচ্ছাকৃতভাবে এই সেশনেও আটকে রাখা হলো, একই কারণে যেটা এন্ট্রি ৭৩/৭৪-এ
ছিল (live money/stock সিস্টেম, sandbox-এ real-device আচরণ reproduce অসম্ভব)।
পরবর্তী সেশনের জন্য ২টা অপশন লেখা হয়েছে লগে (ধাপে-ধাপে গ্রুপ-বাই-গ্রুপ, বা
এক-সেশনে-সব-কনভার্ট-কিন্তু-ফ্ল্যাগ-বন্ধ-রেখে-টেস্ট-শপে-যাচাই) — ব্যবহারকারীর
সিদ্ধান্তের অপেক্ষায়।

---

## ⚠️ চিরস্থায়ী নিয়ম (SQLITE_MIGRATION_LOG.md থেকে প্রযোজ্য, পুনরাবৃত্তি)
এই মাইগ্রেশন লাইভ প্রোডাক্টে (৫০০ দোকান) হচ্ছে — IndexedDB blob-array কখনো মুছে ফেলা
যাবে না যতক্ষণ না নতুন পাথ ৪-৬ সপ্তাহ প্রোডাকশনে স্টেবল প্রমাণিত। প্রতিটা ধাপের পর
`npm test` + real-device স্মোক-টেস্ট বাধ্যতামূলক। কখনো একসাথে সব দোকানে ছাড়া যাবে না।

*(পরবর্তী সেশন শেষে এখানে নতুন এন্ট্রি/আপডেট যোগ হবে)*
