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

### ধাপ ৩ — read path: বাকি যে ২টা ব্লকার (SQLITE_MIGRATION_LOG.md এন্ট্রি ৭২-এ চিহ্নিত)
- `SmartBusinessMgmt` return/void — billing-adjacent, আলাদা সিদ্ধান্ত দরকার
- POS নিজস্ব বাকি অংশ (`sbm_pos_ondemand_cart`, এন্ট্রি ৬৮) — real-device টেস্ট বাকি
এই দুটো ছাড়া `products`-কে বুট-এ লোড না করা (lazy না, একদমই না-লোড) নিরাপদ না —
POS-এ instant lookup ছাড়া বিক্রি ব্যাহত হতে পারে।

### ধাপ ৪ — boot-এ products লোড আসলে বন্ধ করা (চূড়ান্ত ধাপ)
ধাপ ১-৩ real-device-ভেরিফায়েড হওয়ার পরই বিবেচ্য। `sbm_products_boot_lazy` ফ্ল্যাগকে
"পেছানো" থেকে "একদমই লোড না করা"-য় আপগ্রেড করা, IndexedDB blob-array-কে ব্যাকআপ/
রিকভারির জন্য রেখে দেওয়া (এখনই মুছে ফেলা যাবে না, চিরস্থায়ী নিয়ম #১ অনুযায়ী)।

---

## ⚠️ চিরস্থায়ী নিয়ম (SQLITE_MIGRATION_LOG.md থেকে প্রযোজ্য, পুনরাবৃত্তি)
এই মাইগ্রেশন লাইভ প্রোডাক্টে (৫০০ দোকান) হচ্ছে — IndexedDB blob-array কখনো মুছে ফেলা
যাবে না যতক্ষণ না নতুন পাথ ৪-৬ সপ্তাহ প্রোডাকশনে স্টেবল প্রমাণিত। প্রতিটা ধাপের পর
`npm test` + real-device স্মোক-টেস্ট বাধ্যতামূলক। কখনো একসাথে সব দোকানে ছাড়া যাবে না।

*(পরবর্তী সেশন শেষে এখানে নতুন এন্ট্রি/আপডেট যোগ হবে)*
