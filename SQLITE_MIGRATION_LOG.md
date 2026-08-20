# SQLite মাইগ্রেশন — সেশন হ্যান্ডঅফ লগ

> **এই ফাইলের উদ্দেশ্য**: প্রতিটা নতুন Claude সেশনে (নতুন চ্যাটে) এই ফাইল + প্রজেক্ট zip আপলোড করলেই
> আগের কাজ থেকে সরাসরি চালিয়ে যাওয়া যাবে, বিস্তারিত আবার বলার দরকার নেই।
>
> **কনভেনশন**: নতুন এন্ট্রি সবসময় সবার উপরে যোগ হবে (newest-first, `CLAUDE.md`-এর মতোই)।
>
> **প্রতিটা সেশনের শেষে**: এই ফাইলে একটা নতুন এন্ট্রি যোগ করে আপডেটেড zip ডাউনলোড করে রাখবেন।
> **প্রতিটা নতুন সেশনের শুরুতে**: এই ফাইল + প্রজেক্ট zip আপলোড করে বলবেন — "এই লগ অনুযায়ী চালিয়ে যাও"।

---

## ⚠️ চিরস্থায়ী নিয়ম (প্রতিটা এন্ট্রির আগে পড়তে হবে — কখনো ভুলবে না)

এই মাইগ্রেশন একটা **লাইভ প্রোডাক্টে** (৫০০ দোকান) হচ্ছে। প্রতিটা পরিবর্তনের আগে এই চেকলিস্ট:

1. **কখনো পুরনো IndexedDB blob-array কোড মুছে ফেলা যাবে না** যতক্ষণ না নতুন SQLite path কমপক্ষে ৪-৬ সপ্তাহ প্রোডাকশনে স্টেবল প্রমাণিত হয় (Phase 5-এর আগে না)। যতক্ষণ dual-write ফেজ চলছে, দুটো সিস্টেমই সমান্তরালে বাঁচিয়ে রাখতে হবে।
2. **কোনো ফাইল এডিট করার আগে সেই ফাইলের প্রাসঙ্গিক অংশ পুরোটা আবার পড়ে নিতে হবে** — assume করা যাবে না আগের সেশনের memory থেকে ঠিক লাইন নম্বর/কন্টেন্ট মনে আছে।
3. **একটা ফিচার/ফাংশন পরিবর্তন করলে সেটা যেসব জায়গায় ব্যবহৃত হয় সব খুঁজে বের করে (grep) চেক করতে হবে** — App.jsx-এ একই ডেটা (যেমন `products`) বহু জায়গায় ব্যবহৃত হয়, একটা জায়গায় ফিক্স করলে আরেকটা জায়গা ভেঙে যেতে পারে।
4. **প্রতিটা ধাপের পর existing test suite চালাতে হবে** (`npm test`) — নতুন কিছু ভাঙল কিনা যাচাই করতে।
5. **Firebase সম্পূর্ণ ডিলিট হয়ে গেছে (কোড + সব দোকান থেকে)** — dual-sync/Firestore নিয়ে কোনো নতুন কোড লেখার দরকার নেই, এটা একমুখী local migration (blob → SQLite)।
6. **কখনো একসাথে সব দোকানে ছাড়া যাবে না** — canary rollout মেনে চলতে হবে (Section ৩, মূল প্ল্যান ডকুমেন্ট দ্রষ্টব্য)।
7. **প্রতিটা এন্ট্রির শেষে "📁 এই সেশনে যেসব ফাইল বদলেছে" একটা তালিকা বাধ্যতামূলক** — শুধু ব্যাখ্যা/সারাংশ যথেষ্ট না, ঠিক কোন ফাইলগুলো (পাথসহ) নতুন তৈরি/এডিট হয়েছে সেটা আলাদা করে স্পষ্টভাবে লিখতে হবে, যাতে ব্যবহারকারীকে অনুমান করতে না হয়। `npm install`-এর কারণে অটো-জেনারেটেড `package-lock.json`-এর মতো non-substantive পরিবর্তন থাকলে সেটাও আলাদা করে উল্লেখ করতে হবে (মূল কোড-পরিবর্তনের তালিকায় মেশানো যাবে না)।

---

## 🎯 মাস্টার স্ট্যাটাস (এন্ট্রি ৯০-এ আপডেট — নতুন সেশনে প্রথমে এই সেকশনটাই পড়ুন)

**🟢 এন্ট্রি ৯০ (✅ sandbox নেটওয়ার্ক কাজ করেছে, npm test/lint/typecheck/build/golden-master/fuzz সব পাস) — এন্ট্রি ৮৯-এর "পরের সেশনে আসল করণীয়" আইটেম ১ (Audit Trail "মোট লগ ০") তদন্ত, আইটেম-তালিকার বাইরের BatchSyncTool "ব্যাচ মিসম্যাচ" dead-tab রিমুভ, প্লাস PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর ক্যাটাগরি ③ (FULL-SCAN) আইটেমগুলোর কোড-স্ট্যাটাস ভেরিফাই**:

**প্রেক্ষাপট**: ব্যবহারকারী বললেন "১,৩ ফিক্স। ২ নাম্বারটা ভেরিফাই করুন" — এন্ট্রি ৮৭-৮৯-এর অমীমাংসিত আইটেম ১ (Audit Trail শূন্য), BatchSyncTool-এর ৩ নম্বর ট্যাব, ও PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর ২ নম্বর (ক্যাটাগরি ③) নিয়ে কাজ।

**✅ ১ — তদন্ত সম্পূর্ণ, কোনো কোড-বাগ পাওয়া যায়নি (তাই কোনো "ফিক্স" প্রয়োগ করা হয়নি — সততার সাথে)**: `auditLog()` ফাংশন, boot লোড পাথ (wave-2/`DEFERRED_KEYS`-এ `LK(SK.auditLogs)`), persist effect (`debouncedSave`, প্রতি-key টাইমার-ভিত্তিক, রেস-সেফ), আর মূল অ্যাপে `AuditTrailModule`/`MemoProducts`-এ `auditLog`/`auditLogs` prop-ওয়্যারিং — সবকটা লাইন-বাই-লাইন অডিট করে **কোনো বাগ পাওয়া যায়নি** (Viewer Mode-এর `auditLog={noop}` ইচ্ছাকৃত, ওটা আলাদা read-only কম্পোনেন্ট, মূল অ্যাপ না)। **উপসংহার**: `auditLog()` শুধু নির্দিষ্ট কয়েকটা "সিগনিফিক্যান্ট" অ্যাকশনেই ট্রিগার হয় (দাম পরিবর্তন, ম্যানুয়াল স্টক সংশোধন, পণ্য/কাস্টমার ডিলিট, ইনভয়েস ভয়েড/রিটার্ন, ৳৫,০০০+ বাকি/জমা, ব্যাচসিঙ্কটুল-এর কস্ট-কারেকশন) — নিয়মিত POS বিক্রি, ছোট বাকি/জমা, নতুন পণ্য/কাস্টমার যোগ করাতে কখনো লগ হয় না। তাই যে দোকানে এই নির্দিষ্ট অ্যাকশনগুলো এখনো ঘটেনি, সেখানে "মোট লগ ০" **সম্ভবত genuine, বাগ না** — এন্ট্রি ৮৭-এর সন্দেহই সঠিক প্রমাণিত হলো। **পরবর্তী সিদ্ধান্ত ব্যবহারকারীর**: audit logging-এর কভারেজ বাড়ানো (যেমন নতুন পণ্য/কাস্টমার যোগ, নিয়মিত ছোট বাকি ইত্যাদিও লগ করা) একটা আলাদা, ইচ্ছাকৃত ফিচার-স্কোপ সিদ্ধান্ত — কোনো কোড বদলানো হয়নি, যেন ভুল অনুমানে একটা কাজ-করা সিস্টেমে অপ্রয়োজনীয় ঝুঁকি না আসে।

**✅ ৩ — সমাধান হলো, কিন্তু "বাগ ফিক্স" না — dead-code রিমুভাল**: কোডের নিজস্ব কমেন্ট পড়ে নিশ্চিত হওয়া গেল `BatchSyncTool`-এর `mismatches` (ব্যাচ costPrice মিসম্যাচ) ইতিমধ্যে ইচ্ছাকৃতভাবে `useMemo(() => [], [])`-এ ফিক্সড/disabled — True Batch/FIFO costing রিডিজাইনের (২০২৬) পর প্রতিটা ব্যাচ নিজের রেকর্ডকৃত cost রাখে, তাই "ব্যাচ-cost ≠ product-average" এখন **স্বাভাবিক ও কাঙ্ক্ষিত**, মিসম্যাচ না। ফলে "ব্যাচ মিসম্যাচ" ট্যাবটা কখনোই কিছু দেখাতে পারত না (permanently-empty), শুধু বিভ্রান্তিকর UI। **ফিক্স**: পুরো ট্যাব (বাটন + সেকশন) + অব্যবহৃত `syncBatch()`/`keepBatch()` ফাংশন + `mismatches` useMemo — সব রিমুভ করা হলো। এখন `BatchSyncTool`-এ শুধু ২টা ট্যাব বাকি: "ঝুঁকিপূর্ণ পণ্য" ও "পুরনো ইনভয়েস" (উভয়েই এখনো সক্রিয়/কার্যকর)। হেডার-টেক্সট ("⚠️ লস-ঝুঁকি ও ব্যাচ সিঙ্ক" → "⚠️ লস-ঝুঁকি ও মূল্য সংশোধন") ও সাবটেক্সট থেকেও পুরনো "ব্যাচ-দাম" রেফারেন্স সরানো হলো। **ঝুঁকি**: শূন্য — dead code সরানো হয়েছে, `costMismatchIgnored` ফ্ল্যাগ কোথাও নতুন করে সেট হবে না (আগে শুধু `keepBatch()`-ই সেট করত) কিন্তু বাকি ২ জায়গায় (Products এডিট, `saveInlinePrice`) এই ফ্ল্যাগ শুধু *পড়া* হয় — সেট না হলেও কোনো ক্র্যাশ/এরর নেই, শুধু চিরকাল `false`/`undefined` থাকবে যেটা নিরাপদ ডিফল্ট আচরণ।

**🟢 ২ — ভেরিফাই সম্পূর্ণ: PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর ক্যাটাগরি ③ (FULL-SCAN) এর ৪টা আইটেমই ইতিমধ্যে কোড-সম্পূর্ণ, শুধু plan doc নিজেই stale (এন্ট্রি ৪৪ পর্যন্তই আপডেটেড, পরের এন্ট্রিগুলো কখনো এতে merge হয়নি)**:
- `getKnownSuppliers()` → `useKnownSuppliers()` (SQL `SELECT DISTINCT supplier_due_raw`) — ✅ কোড-সম্পূর্ণ
- `getKnownCustomDosageForms()` → `useKnownDosageForms()` (SQL `SELECT DISTINCT dosage_form`) — ✅ কোড-সম্পূর্ণ
- SmartInvoiceBuilder ক্যাটাগরি-লিস্ট → `useKnownCategories()` (SQL `SELECT DISTINCT category`) — ✅ কোড-সম্পূর্ণ
- Products-এ ডুপ্লিকেট-নাম চেক (সেভের আগে) → `name_norm` ইনডেক্সড SQL exact-lookup — ✅ কোড-সম্পূর্ণ (এন্ট্রি ৪৪)
- (প্ল্যান ডকে না-লেখা কিন্তু ৭.৩-এর সাথে সম্পর্কিত) `AIPage_`-এর outOfStock/expiry স্ক্যান → `useOutOfStockCount()`/`useExpiryCandidates()` (এন্ট্রি ৪৬) — ✅ কোড-সম্পূর্ণ

`npm test`-এর "distinct-lookups (এন্ট্রি ৪৪, রেট্রোঅ্যাক্টিভ টেস্ট — এন্ট্রি ৪৯)" স্যুট (১১ কেস, সব পাস) এই সবগুলোই কভার করে। **উপসংহার**: `PRODUCTS_ONDEMAND_MIGRATION_PLAN.md`-এর ৭.৩ (বুট সিকোয়েন্স, `products` সম্পূর্ণ সরানো) ব্লক করার কোনো কোড-লেভেল কারণ আর নেই — বাস্তবে মূল লগের এন্ট্রি ৭৮-৮৯ (never-load মোড, `sbm_products_boot_never` ফ্ল্যাগ) ইতিমধ্যে এই কাজটাই এগিয়ে নিয়ে গেছে, প্ল্যান ডকটা শুধু সেই অগ্রগতি রিফ্লেক্ট করেনি। **কোনো কোড বদল হয়নি এই আইটেমের জন্য, শুধু ভেরিফিকেশন।**

**যাচাই সম্পূর্ণ (sandbox)**: `npm install` → `npm test` (সব প্রি-এক্সিস্টিং সুইট পাস) → `npm run lint` (0 error, ৫৬৮ warning অপরিবর্তিত/বেসলাইন) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) — সবগুলো পাস।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `BatchSyncTool`-এ dead "ব্যাচ মিসম্যাচ" ট্যাব/সেকশন/`syncBatch()`/`keepBatch()`/`mismatches`-useMemo রিমুভ, হেডার-টেক্সট আপডেট
- `SQLITE_MIGRATION_LOG.md` — এই এন্ট্রি (৯০) যোগ
- (`PRODUCTS_ONDEMAND_MIGRATION_PLAN.md` স্পর্শ করা হয়নি — চাইলে পরের সেশনে stale প্ল্যান ডকটা আপডেট/আর্কাইভ করা যেতে পারে)

**পরের সেশনে আসল করণীয়** (এন্ট্রি ৮৯ থেকে অপরিবর্তিত, real-device-নির্ভর):
1. real-device: এন্ট্রি ৮৯-এর ৩টা ফিক্স যাচাই (ক্রয়-এন্ট্রি সেভ + self-use ইনভয়েস + self-use টগল, never-load চালু রেখে)
2. real-device: এন্ট্রি ৮৮-এর POS স্টক-ডিডাকশন ফিক্সও এখনো যাচাই বাকি
3. POS on-demand cart (`sbm_pos_ondemand_cart`) real-device স্মোক-টেস্ট
4. (ঐচ্ছিক, ফিচার-স্কোপ সিদ্ধান্ত) Audit logging-এর কভারেজ বাড়ানো — নতুন পণ্য/কাস্টমার যোগ, ছোট বাকি/জমা ইত্যাদিও লগ করা কিনা, ব্যবহারকারীর সিদ্ধান্ত সাপেক্ষে

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৮৯)

**🟢 এন্ট্রি ৮৯ (✅ sandbox নেটওয়ার্ক কাজ করেছে, npm test/lint/typecheck/build/golden-master/fuzz সব পাস — real-device টেস্ট এখনো বাকি) — এন্ট্রি ৮৮-এর "পরের সেশনে আসল করণীয়" আইটেম ৩ (৭টা বিলিং-ক্রিটিক্যাল POS সাইট + cost-critical purchase-batch/weighted-avg-cost) ফিক্স, আইটেম ৪ (POS on-demand cart) ইচ্ছাকৃতভাবে স্কিপ (ব্যবহারকারীর নির্দেশে)**:

**প্রেক্ষাপট**: ব্যবহারকারী বললেন "৪ নম্বর ফিক্স লাগবে না। ৩ নম্বর করুন" — অর্থাৎ POS on-demand cart real-device স্মোক-টেস্ট (আইটেম ৪) এই সেশনে বাদ, শুধু বিলিং-ক্রিটিক্যাল সাইট + cost-critical purchase-batch/weighted-avg-cost (আইটেম ৩) করতে হবে।

**✅ পুরো `SmartInvoiceBuilder` (POS ইনভয়েস-সেভ) + `applyPurchaseBatch`/`savePE` (weighted-avg-cost) কোড লাইন-বাই-লাইন re-audit করা হলো — never-load মোডে ৩টা রিয়েল গ্যাপ পাওয়া গেল ও ফিক্স হলো**:

1. **🔴 সবচেয়ে গুরুতর — `applyPurchaseBatch()`-এ `prod` lookup সম্পূর্ণ ব্যর্থ হতো**: `Products` কম্পোনেন্টের নিজস্ব `productsByIdMap` (লাইন ~২৯২৫০) সরাসরি raw `products`-এর উপর বিল্ড হতো — never-load মোডে খালি Map। `applyPurchaseBatch()` এখান থেকেই সিঙ্ক্রোনাসভাবে `prod` খুঁজত (`if (!prod...) return null`) — অর্থাৎ **never-load মোডে প্রতিটা ক্রয়-এন্ট্রি নীরবে সম্পূর্ণ ব্যর্থ হতো**, কোনো error/toast ছাড়াই ফর্ম কিছু না করেই "সেভ" হয়ে যেত। **ফিক্স**: `productsSearchSource`-এর (এন্ট্রি ৮৪-এ প্রতিষ্ঠিত global-হাইড্রেটেড ফলব্যাক প্যাটার্ন) থেকে বিল্ড করা হচ্ছে এখন — products পূর্ণ থাকা অবস্থায় (৫০০ লাইভ দোকান) হুবহু অপরিবর্তিত।

2. **🔴 একই ক্লাসের বাগ — weighted-average cost/স্টক-বৃদ্ধি কোথাও পার্সিস্ট হতো না**: `applyPurchaseBatch()`-এর `applyLocalFallback()` (Firestore সরানোর পর থেকে **এখন এটাই একমাত্র বাস্তব পাথ** — `FSS.isReady()` সবসময় `false`, দেখুন `FSS` স্টাবের কোড) `setProducts(prev => prev.map(...))` দিয়ে লিখত — never-load মোডে `prev` স্থায়ীভাবে `[]`, POS বিক্রির এন্ট্রি ৮৬/৮৮-এর ঠিক একই রুট-কজ। **ফিক্স**: batchNo-dedup + weighted-average-cost হিসাবের pure লজিক একটা শেয়ার্ড হেল্পার (`computeBatchPatch()`)-এ বের করা হলো (দুই পাথ কখনো diverge করবে না), আর never-load মোডে (`products.length===0 && isProductsNeverLoadEnabled()`) সেই হেল্পার দিয়ে global `productsById` থেকে বেস রেকর্ড নিয়ে সরাসরি `DataStore.upsertMany()` + `productsById` cache সিঙ্ক্রোনাস আপডেট — dualWriteSqlite()/diffById() পাথ সম্পূর্ণ বাইপাস, POS ফিক্সের (এন্ট্রি ৮৮) ঠিক একই প্যাটার্ন।

3. **🟡 বিলিং-ক্রিটিক্যাল — `invProdMap` (নিজের-ব্যবহার/self-use কস্ট হিসাব + কার্ট প্রাইস-টগল)**: `SmartInvoiceBuilder`-এর `invProdMap` — `sbm_pos_ondemand_cart` (never-load থেকে **স্বাধীন** একটা ফ্ল্যাগ, ডিফল্ট বন্ধ) বন্ধ থাকলে raw `products`-এর উপর বিল্ড হতো, never-load মোডে খালি। প্রভাবিত করত: `selfUseCost` (নিজের-ব্যবহার ইনভয়েসের মোট টাকা — costPrice সবসময় ০/undefined ফলব্যাক হতো) আর `toggleSelfUse` (কার্টের দাম বিক্রয়⇄ক্রয়মূল্য টগল)। **ফিক্স**: `products.length===0` হলে ইতিমধ্যে-নিরাপদ `productsByIdMap`-এর (এন্ট্রি ৮৬-এ `productsSourceForPos`-ভিত্তিক ফলব্যাক পাওয়া) values থেকে বিল্ড হয় — native (non-string) `p.id` key-টাইপ অবিকল রাখা হয়েছে (কল-সাইটগুলো `String()` wrap করে না)। **একই প্যাটার্নে `productBatchMap`-ও ফিক্স করা হলো** (FIFO ব্যাচ/এক্সপায়ারি ব্যাজ, ডিসপ্লে-অনলি — টাকা/স্টক লজিক না, তবু একই রুট-কজ)।

**যাচাই করে confirm — বাকি সাইটগুলো ইতিমধ্যে নিরাপদ**: POS বিক্রির স্টক-ডিডাকশন (`freshP`, primary lookup `getState().productsById`) এন্ট্রি ৮৮-এই ফিক্সড; `createInvoice()`-এর ভেতরে আর কোনো raw `products` রেফারেন্স নেই (পুরো ফাংশন লাইন-বাই-লাইন গ্রেপ করে কনফার্ম করা হলো)।

**যাচাই সম্পূর্ণ (sandbox)**: `npm install` → `npm test` (সব প্রি-এক্সিস্টিং সুইট পাস, ১৫টা suite) → `npm run lint` (0 error, ৫৬৮ warning অপরিবর্তিত) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) — সবগুলো পাস। **real-device টেস্ট এখনো বাকি** — never-load চালু রেখে (ক) একটা ক্রয়-এন্ট্রি সেভ করে স্টক/costPrice ঠিক বাড়ছে কিনা, (খ) একটা "নিজের ব্যবহার" ইনভয়েস তৈরি করে costPrice ঠিক হিসাব হচ্ছে কিনা, (গ) কার্টে self-use টগল করে দাম ঠিক বদলাচ্ছে কিনা — এই ৩টা যাচাই করা উচিত।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `Products` কম্পোনেন্টের `productsByIdMap` এখন `productsSearchSource`-ভিত্তিক; `applyPurchaseBatch()`-এ নতুন শেয়ার্ড `computeBatchPatch()` হেল্পার + never-load সরাসরি-SQL ব্লক (`applyLocalFallback()`-এর ভেতরে); `SmartInvoiceBuilder`-এর `invProdMap`/`productBatchMap` উভয়েই never-load ফলব্যাক

**পরের সেশনে আসল করণীয়**:
1. real-device: এই সেশনের ৩টা ফিক্স যাচাই (ক্রয়-এন্ট্রি সেভ + self-use ইনভয়েস + self-use টগল, never-load চালু রেখে)
2. real-device: এন্ট্রি ৮৮-এর POS স্টক-ডিডাকশন ফিক্সও এখনো যাচাই বাকি
3. Audit Trail-এর "মোট লগ ০" (সব-সময়ের) সমস্যাটা এখনো তদন্ত বাকি (এন্ট্রি ৮৭ দ্রষ্টব্য)
4. POS on-demand cart (`sbm_pos_ondemand_cart`), বাকি real-device স্মোক-টেস্ট আইটেম — ব্যবহারকারীর নির্দেশে এই সেশনে ইচ্ছাকৃতভাবে বাদ

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৮৮)

**🟢 এন্ট্রি ৮৮ (✅ sandbox নেটওয়ার্ক কাজ করেছে, npm test/lint/typecheck/build/golden-master/fuzz সব পাস — real-device টেস্ট এখনো বাকি) — এন্ট্রি ৮৭-এর "পরের সেশনে আসল করণীয়" আইটেম ৩ (সবচেয়ে জরুরি ব্লকার) ফিক্স + আইটেম ৫ (FTS fallback পুল) অডিট করে confirm-resolved**:

**প্রেক্ষাপট**: ব্যবহারকারী "১,২ সমাধান করুন" বললেন — এন্ট্রি ৮৬/৮৭-এর "পরের সেশনে আসল করণীয়" তালিকার (১) never-load মোডে POS বিক্রির স্টক-ডিডাকশন কোথাও পার্সিস্ট না হওয়া, ও (২) FTS fallback পুল `productsById`-ভিত্তিক করা।

**✅ আইটেম ১ (রিয়েল ফিক্স) — never-load মোডে POS স্টক-ডিডাকশনের জন্য আলাদা সরাসরি-SQL পাথ**: এন্ট্রি ৮৬-এ চিহ্নিত রুট-কজ ছিল — `SmartInvoiceBuilder`-এর বিক্রি-সম্পন্ন হ্যান্ডলারে `setProducts(prev => prev.map(...))` দিয়ে ডিডাকশন প্রয়োগ হতো, কিন্তু never-load মোডে `prev` স্থায়ীভাবে `[]`, তাই `mapped`ও `[]`-ই থাকত — আর `dualWriteSqlite()` (products effect) এই একই সবসময়-খালি array থেকেই `diffById()` করে বলে SQLite-এও কখনো ডিডাকশন লেখা হতো না। **ফিক্স**: `stockUpdateMap` কম্পিউট হওয়ার পরপরই, `products.length===0 && isProductsNeverLoadEnabled()` (+ SQL চালু + businessType আছে) হলে — `dualWriteSqlite()`/`diffById()` পাথ সম্পূর্ণ বাইপাস করে একটা নতুন ব্লক: global হাইড্রেটেড `productsById` (freshP-এর একই সোর্স, তাই সবসময় populated) থেকে প্রতিটা বিক্রি-হওয়া id-এর পূর্ণ রেকর্ড নিয়ে নতুন `stock`/`batches` merge করে `DataStore.upsertMany()` দিয়ে সরাসরি SQLite-এ লেখা হয়, প্লাস `productsById` cache নিজেও সিঙ্ক্রোনাসভাবে optimistic-আপডেট হয় (একই সেশনে পরের বিক্রি/UI সাথে সাথেই নতুন স্টক দেখে)। ব্যর্থ হলে `_markProductsSqlDownIfRisky()` (এন্ট্রি ৮০/৮১/৮২-এর একই গ্লোবাল ব্যানার) — silent data loss হয় না। স্বাভাবিক মোডে (products সবসময় পূর্ণ, ৫০০ লাইভ দোকানের ডিফল্ট) এই ব্লক কখনো ট্রিগার হয় না — behavior-preserving।

**🟢 আইটেম ২ (কোড-অডিট, কোনো নতুন কোড লাগেনি) — FTS fallback পুল ইতিমধ্যে productsById-ভিত্তিক**: এন্ট্রি ৮২-এ চিহ্নিত ৫টা FTS-narrowing সাইট (POS প্রধান সার্চ, Products-লিস্ট সার্চ, সাপ্লায়ার-লিস্ট সার্চ, কাস্টমার-অর্ডার সাজেশন, ক্রয়-এন্ট্রি সাজেশন) সরাসরি কোড খুলে একটা একটা করে যাচাই করা হলো — দেখা গেল এন্ট্রি ৮৪ (`productsSearchSource`, Products-লিস্ট + ক্রয়-এন্ট্রি), এন্ট্রি ৮৬ (`productsSourceForPos`, POS), আর এন্ট্রি ৮৭ (`custOrderProductsBase`, কাস্টমার-অর্ডার) — এই তিনটা সেশন মিলে ইতিমধ্যে সবগুলো সাইটের বেস-পুল raw `products` থেকে global হাইড্রেটেড `productsById` ফলব্যাকে সরিয়ে ফেলেছে। সাপ্লায়ার-লিস্ট সার্চের পুল (`items`/`supPool`) raw `products` থেকেই আসে না — `useInventoryData()` হুকের SQL-primary+guarded-JS-fallback রেজাল্ট (`inv.allStock` ইত্যাদি) থেকে আসে, যেটা এন্ট্রি ৮২-তেই গার্ডেড হয়ে গিয়েছিল। **উপসংহার**: এন্ট্রি ৮২-এর "এখনো জানা সীমাবদ্ধতা" নোটটা stale হয়ে গিয়েছিল — পরের ৩টা সেশনে প্রতিটা সাইট ভিন্ন bug-report ধরে ফিক্স করা হয়েছিল, কিন্তু checklist থেকে এই আইটেম কখনো সরানো হয়নি। এই সেশনে শুধু checklist সংশোধন করা হলো, কোড অপরিবর্তিত।

**যাচাই সম্পূর্ণ (sandbox)**: `npm install` → `npm test` (সব প্রি-এক্সিস্টিং সুইট পাস, ১৫টা suite) → `npm run lint` (0 error, ৫৬৮ warning অপরিবর্তিত) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) — সবগুলো পাস। **real-device টেস্ট এখনো বাকি** — never-load ফ্ল্যাগ চালু করে POS-এ একটা বিক্রি সম্পন্ন করে দেখা উচিত পণ্যের স্টক এখন সত্যিই কমছে কিনা, এবং সেই বিক্রির পরে অ্যাপ রিস্টার্ট করেও (কোল্ড বুট, productsById নতুন করে SQLite থেকে হাইড্রেট হবে) স্টক ঠিক আছে কিনা।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `SmartInvoiceBuilder`-এর বিক্রি-সম্পন্ন হ্যান্ডলারে নতুন never-load সরাসরি-SQL স্টক-ডিডাকশন ব্লক (`upsertMany` + `productsById` optimistic আপডেট)

**পরের সেশনে আসল করণীয়**:
1. real-device: উপরের স্টক-ডিডাকশন ফিক্স নিশ্চিত করা (never-load চালু রেখে বিক্রি → স্টক কমা → কোল্ড রিস্টার্টেও ঠিক থাকা)
2. Audit Trail-এর "মোট লগ ০" (সব-সময়ের) সমস্যাটা এখনো তদন্ত বাকি (এন্ট্রি ৮৭ দ্রষ্টব্য)
3. ৭টা বিলিং-ক্রিটিক্যাল POS ইনভয়েস-সেভ সাইট + cost-critical purchase-batch/weighted-avg-cost সাইট — সবচেয়ে ঝুঁকিপূর্ণ, এখনো একেবারেই ছোঁয়া হয়নি
4. POS on-demand cart, বাকি real-device স্মোক-টেস্ট আইটেম (এন্ট্রি ৮৬-এর তালিকা অনুযায়ী)

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৮৭)

**🟢 এন্ট্রি ৮৭ (✅ sandbox নেটওয়ার্ক কাজ করেছে, npm test/lint/typecheck/build সব পাস — real-device টেস্ট এখনো বাকি) — real-device স্ক্রিনশট-বেসড টেস্টিং থেকে ধরা পড়া একটা নতুন never-load গ্যাপ ফিক্স + বাকি ৩টা "ভাঙা" রিপোর্টের কোড-অডিট**:

**প্রেক্ষাপট**: ব্যবহারকারী এন্ট্রি ৮৬-এর পরের real-device টেস্টে (আইটেম ২/৩/৪, কিন্তু `Products Never-Load` ফ্ল্যাগ চালু অবস্থাতেই — সেটিং স্ক্রিনশটে কনফার্মড) ৪টা সমস্যা রিপোর্ট করলেন: (১) স্টক না কমা, (২) কাস্টমার-অর্ডার ফর্মে পণ্য-সার্চে ফলাফল না আসা, (৩) Audit Trail-এ কোনো লগ না দেখানো, (৪) BatchSyncTool-এর সব ট্যাব খালি।

**✅ যা এই সেশনে করা হলো**:
1. **🔴 নতুন real bug ফিক্স — Dashboard-এর "কাস্টমার অর্ডার" মিনি-ফর্মের পণ্য-সার্চ**: এই সাইট সরাসরি raw `products` prop ব্যবহার করত — এন্ট্রি ৮৪/৮৬-এর অডিটে ধরা পড়েনি (শুধু Products-লিস্ট + POS কভার হয়েছিল)। never-load মোডে `products` স্থায়ীভাবে খালি থাকায় এখানে "Napa" টাইপ করলেও কোনো সাজেশন আসত না। **ফিক্স**: `productsSearchSource`-এর ঠিক একই প্যাটার্নে, Dashboard-এ ইতিমধ্যে-বিদ্যমান `_globalProductsById` (গ্লোবাল হাইড্রেটেড productsById store) সিলেক্টরে ফলব্যাক — `products` খালি থাকলে সেখান থেকে খুঁজবে। `custOrderProductPool` এখন এই নতুন `custOrderProductsBase` থেকে ডেরাইভ হয়।

**⚠️ বাকি ৩টা রিপোর্ট — কোড-অডিটে সম্ভবত bug না বলে মনে হয়েছে (কনফার্মেশন দরকার)**:
2. **স্টক না কমা** — প্রত্যাশিত, এন্ট্রি ৮৬-এই ডকুমেন্টেড অসমাধানকৃত বাগ (item ১, এখনো ফিক্স করা হয়নি)।
3. **Audit Trail শূন্য** — যে এডিট টেস্ট করা হয়েছিল (শুধু `minStockAlert` বদল) সেটা বর্তমান কোডে আদৌ লগ হওয়ার কথা না (audit log শুধু `PRODUCT_PRICE_CHANGE`/`STOCK_ADJUST`-এ ট্রিগার হয়, minStockAlert-এ না) — তাই এই নির্দিষ্ট টেস্টে "লগ নেই" bug না। কিন্তু "মোট লগ ০" (সব-সময়ের) সন্দেহজনক — never-load-এর সাথে সরাসরি সম্পর্কিত মনে হয়নি, সম্ভবত পুরনো/আলাদা ইস্যু, নিশ্চিত করা হয়নি।
4. **BatchSyncTool খালি** — "ঝুঁকিপূর্ণ পণ্য" ট্যাব সরাসরি SQL কোয়েরি (`dsGetRiskProducts`) ব্যবহার করে, never-load-নির্ভর না — তাই (0) সম্ভবত genuine (আসলেই কোনো ঋণাত্মক-মার্জিন পণ্য নেই)। "ব্যাচ মিসম্যাচ" কোডে ইচ্ছাকৃতভাবে সবসময় disabled (`useMemo(() => [], [])`)। "পুরনো ইনভয়েস" ট্যাবও genuine খালি হতে পারে যদি cost>price এমন কোনো ইনভয়েস-লাইন সত্যিই না থাকে।

**যাচাই সম্পূর্ণ (sandbox)**: `npm test` (সব সুইট পাস) → `npm run lint` (0 error, ৫৬৮ warning অপরিবর্তিত) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন)। **real-device টেস্ট (কাস্টমার-অর্ডার সার্চ ফিক্স + বাকি ৩টার নিশ্চিতকরণ) এখনো বাকি**।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `Dashboard` কম্পোনেন্টে নতুন `custOrderProductsBase` (never-load ফলব্যাক), `custOrderProductPool` এখন এটা থেকে ডেরাইভ হয়

**পরের সেশনে আসল করণীয়**:
1. real-device: never-load ফ্ল্যাগ চালু রেখে কাস্টমার-অর্ডার ফর্মে "Napa" সার্চ করে কনফার্ম করা যে এখন সাজেশন আসছে
2. Audit Trail-এর "মোট লগ ০" (সব-সময়ের) সমস্যাটা আলাদাভাবে তদন্ত করা — এটা কি কখনো কাজ করেছে এই দোকানে?
3. 🔴 সবচেয়ে জরুরি এখনো অপরিবর্তিত: never-load মোডে POS বিক্রির স্টক-ডিডাকশন কোথাও পার্সিস্ট না হওয়া (এন্ট্রি ৮৬ দ্রষ্টব্য)
4. POS on-demand cart, বাকি real-device স্মোক-টেস্ট আইটেম (এন্ট্রি ৮৬-এর তালিকা অনুযায়ী)

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৮৬)

**🟡 এন্ট্রি ৮৬ (✅ sandbox নেটওয়ার্ক কাজ করেছে, npm test/lint/typecheck/build/golden-master/fuzz সব পাস — real-device টেস্ট এখনো বাকি) — শেয়ার্ড PDF ট্রান্সক্রিপ্টে বর্ণিত অসম্পূর্ণ কাজ (bug fix + ৬,৭ নম্বর) শনাক্ত করে সম্পূর্ণ করা হলো, প্লাস একটা বড় নতুন ঝুঁকি ধরা পড়ল**:

**প্রেক্ষাপট**: ব্যবহারকারী একটা পুরনো PDF-শেয়ারড চ্যাট-ট্রান্সক্রিপ্ট দিয়ে বললেন "সেখানে যে কাজ চলতেছিল সেটা কমপ্লিট করুন"। সেই ট্রান্সক্রিপ্টে দেখা যায় একটা আগের সেশন `productsSourceForPos` (POS-এর জন্য never-load ফলব্যাক), ক্রয়-এন্ট্রি ফর্মের `calcNextBatch()`-এর ২টা কল-সাইট ফিক্স, এবং "নতুন পণ্য যোগ"+"প্রতিটা বিক্রি"-তে blob-এ খালি array সেভ হওয়ার একটা গুরুতর বাগ ফিক্স করার দাবি করেছিল — কিন্তু সেই সেশন `npm run build`/`test:golden-master`/`test:fuzz` চালানোর আগেই এবং zip ডাউনলোড করার আগেই (tool-limit-এ) কেটে গিয়েছিল। **যাচাই করে দেখা গেল এই zip-এ আসলে ওই ফিক্সগুলো প্রয়োগই হয়নি** (`productsSourceForPos` কোডে কোথাও ছিল না, POS-এর `productsWithSerial` তখনও সরাসরি raw `products` ব্যবহার করছিল, আর blob-write বাগের ৩টা সাইটেই কোনো গার্ড ছিল না) — এন্ট্রি ৮০-৮৪ শুধু **Products-লিস্ট/PE-সার্চ** পাথ কভার করেছিল, POS প্রোডাক্ট-পিকার আলাদা।

**✅ যা এই সেশনে করা হলো**:

1. **POS প্রোডাক্ট-পিকার ফিক্স (`SmartInvoiceBuilder`)**: নতুন `productsSourceForPos` — `Products` কম্পোনেন্টের `productsSearchSource`-এর (এন্ট্রি ৮৪) ঠিক একই প্যাটার্নে, `products` খালি হলে গ্লোবাল হাইড্রেটেড `productsById`-তে ফলব্যাক করে। `productsWithSerial` (→ POS সার্চ/ক্যাটাগরি-গ্রিড/`productsByIdMap` সবকিছুর মূল সোর্স) এখন এটা ব্যবহার করে — আগে never-load মোডে POS-এ পণ্য পিকার সম্পূর্ণ খালি দেখাত।

2. **ক্রয়-এন্ট্রি ফর্মের `calcNextBatch()` — ৩টা রॉ-`products` কল-সাইট** (`peNextBatchLabel`, `getNextBatch()`, এবং পণ্য-সাজেশন ড্রপডাউনে সিলেক্ট করার সময়ের ইনলাইন কল) এখন `productsSearchSource` ব্যবহার করে — never-load মোডে ব্যাচ-নম্বর সাজেশন ভুল/`-1`-এ রিসেট হওয়া থেকে বাঁচায়।

3. **🔴 গুরুতর ঝুঁকি ফিক্স — blob-write-এ খালি array সেভ (৪টা সাইট, PDF-এ ২টা উল্লেখ ছিল, অডিটে আরও ২টা পাওয়া গেল)**: never-load মোডে `products` React state স্থায়ীভাবে `[]` — কিন্তু নিচের ৪টা জায়গায় এই খালি (বা প্রায়-খালি) array-ই সরাসরি IndexedDB blob (`LK(SK.products)`)-এ **নিঃশর্তে** সেভ হয়ে যেত, প্রতিটাতেই SQLite নিজে অক্ষত থাকলেও local blob backup-এর পুরো ক্যাটালগ ধ্বংস হয়ে যেত:
   - সাধারণ debounced-save effect (`useEffect([products, loaded])`) — **`loaded` false→true হওয়ার সাথে সাথেই, কোনো ইউজার-অ্যাকশন ছাড়াই** ট্রিগার হতো (নতুন করে অডিটে পাওয়া, PDF-এ উল্লেখ ছিল না — সবচেয়ে বিপজ্জনক, কারণ শুধু বুট করলেই ঘটত)
   - POS-এ প্রতিটা বিক্রি সম্পন্ন হওয়ার পর (`_productsAfterSale`)
   - "নতুন পণ্য যোগ করুন" (ক্রয়-এন্ট্রি থেকে) সেভের সময় (`[...products, newProductRec]`)
   - ক্রয়-এন্ট্রি স্টক-আপডেট সেভের সময় (`computedArr`, Weighted Average Cost পাথ)

   **ফিক্স**: প্রতিটা সাইটে `products.length === 0 && isProductsNeverLoadEnabled()` হলে blob-write সম্পূর্ণ **স্কিপ** করা হয় — শেষ known-good blob হিমায়িত/অক্ষত থাকে। `dualWriteSqlite()` স্কিপ করার দরকার হয়নি — এটা প্রতিটা business-type-এর নিজস্ব `prevMapRef` diff-স্ন্যাপশটের সাথে তুলনা করে, আর never-load মোডে সেই ref কখনো পপুলেট হয়ই না (`currentArr` সবসময় `[]`), তাই `diffById()` কখনো `removedIds` রিপোর্ট করে না — SQLite-এ ভুল ডিলিট হওয়ার ঝুঁকি নেই, শুধু blob-write-ই আসল সমস্যা ছিল, যাচাই করে নিশ্চিত করা হলো।

**🔴 সততার সাথে — এই অডিটে একটা আরও গভীর, এখনো অসমাধানকৃত সমস্যা ধরা পড়েছে**: POS বিক্রি সম্পন্ন হওয়ার সময় `setProducts(prev => prev.map(...))` দিয়ে স্টক-ডিডাকশন প্রয়োগ হয় — কিন্তু never-load মোডে `prev` সবসময় `[]`, তাই `mapped` ও `[]`-ই থাকে। ফলে বিক্রির স্টক-ডিডাকশন **`products` React array-তে কখনোই প্রতিফলিত হয় না**, আর যেহেতু `dualWriteSqlite()`-ও এই একই (সবসময়-খালি) array থেকেই diff করে, **সেই ডিডাকশন SQLite-এও কখনো লেখা হয় না** এই পাথ দিয়ে। অর্থাৎ never-load মোডে POS থেকে বিক্রি করলে ইনভয়েস তৈরি হয় ঠিকই, কিন্তু পণ্যের স্টক কোথাও স্থায়ীভাবে কমে না (শুধু ইনভয়েসের `items` array-এই বিক্রির রেকর্ড থাকে) — **এটা একটা রিয়েল, এখনো-অফিক্সড বাগ, শুধু blob-write গার্ড দিয়ে এটা সমাধান হয়নি**, কারণ স্টক-ডিডাকশন লজিকটাই কখনো কোথাও পার্সিস্ট হচ্ছে না, শুধু ভুল জায়গায় লেখা যাওয়া বন্ধ হয়েছে। **এই সেশনে এটা ফিক্স করা হয়নি** — এর জন্য একটা আলাদা, সরাসরি-SQL স্টক-ডিডাকশন পাথ ডিজাইন করা দরকার (হয়তো `sbm_pos_ondemand_cart`-এর প্যাটার্নে) যেটা `products` array-এর উপর নির্ভর করে না, এবং সেটা একটা বড়, সাবধানে করা আলাদা কাজ হওয়া উচিত (স্কোপ-বাড়ানো এই সেশনে ঝুঁকিপূর্ণ)।

**নোট — PDF-এর প্রস্তাবিত ফিক্স-অ্যাপ্রোচ থেকে ইচ্ছাকৃত বিচ্যুতি**: PDF-এ লেখা ছিল blob-এ `productsSearchSource`/`productsSourceForPos` (গ্লোবাল স্ন্যাপশট) দিয়ে "সম্পূর্ণ তালিকা" সেভ করার কথা। এটা না করে **সম্পূর্ণ স্কিপ** করা হলো, কারণ গ্লোবাল স্ন্যাপশট (`productsById`) দিয়ে ওভাররাইট করলে ওই নির্দিষ্ট write-টা যে পরিবর্তন ক্যাপচার করার কথা ছিল (যেমন এই বিক্রির স্টক-ডিডাকশন) সেটা বাদ পড়ে যেত, কারণ গ্লোবাল ম্যাপেও সেই আপডেট প্রতিফলিত হয়নি — অর্থাৎ ভুল/স্টেল ডেটা সেভ হতো, যদিও খালি-ধ্বংসের চেয়ে কম ক্ষতিকর। স্কিপ করাটা কম ঝুঁকিপূর্ণ ও সহজে-যাচাইযোগ্য — শেষ known-good blob অপরিবর্তিত থাকে, ডেটা হারায় না, শুধু নতুন পরিবর্তন blob-এ (SQLite-এ না) কিছুক্ষণ প্রতিফলিত হয় না, যা never-load ডিজাইনেরই মূল উদ্দেশ্য (blob অপ্রাসঙ্গিক করে তোলা)।

**যাচাই সম্পূর্ণ (sandbox)**: `npm install` → `npm test` (সব প্রি-এক্সিস্টিং কেস + সবগুলো সুইট পাস) → `npm run lint` (0 error, শুধু বেসলাইনের সমান ৫৬৮টা প্রি-এক্সিস্টিং warning — এডিটের সময় একটা নতুন `exhaustive-deps` warning ধরা পড়েছিল, `peNextBatchLabel`-এর deps array ঠিক করে সমাধান করা হয়েছে) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) — সবগুলো পাস। **real-device টেস্ট এখনো বাকি**।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `SmartInvoiceBuilder`-এ নতুন `productsSourceForPos` + `productsWithSerial` এখন এটা ব্যবহার করে; ৩টা `calcNextBatch()` কল-সাইট (ক্রয়-এন্ট্রি ফর্ম) `productsSearchSource` ব্যবহার করে + `peNextBatchLabel`-এর deps ফিক্স; ৪টা blob-write সাইটে (generic debounced effect, POS-sale, নতুন-পণ্য, ক্রয়-এন্ট্রি স্টক-সেভ) never-load-frozen গার্ড

**পরের সেশনে আসল করণীয়** (নতুন ক্রম, সবচেয়ে জরুরিটা আগে):
1. **🔴 সবার আগে**: never-load মোডে POS বিক্রির স্টক-ডিডাকশন কোথাও পার্সিস্ট না হওয়ার সমস্যা সমাধান — সরাসরি-SQL স্টক-ডিডাকশন পাথ ডিজাইন করা লাগবে (উপরে বিস্তারিত)
2. real-device: `sbm_products_boot_never` চালু করে POS ট্যাবে প্রোডাক্ট-পিকার/সার্চ, Products ট্যাবে "uncommon" ফিল্টার + সার্চ, ক্রয়-এন্ট্রিতে ব্যাচ-নম্বর সাজেশন — সবগুলো টেস্ট
3. POS on-demand cart (`sbm_pos_ondemand_cart`) real-device টেস্ট — সবচেয়ে বড় ব্লকার (অপরিবর্তিত, আগের সিরিয়াল থেকে)
4. এন্ট্রি ৫৩/৫৫/৫৬-এর ৪টা id+hydrate সাইট real-device ভেরিফিকেশন
5. FTS fallback পুল `products`-এর বদলে `productsById`-ভিত্তিক করা (এন্ট্রি ৮২-এর সীমাবদ্ধতা, এখনো অমীমাংসিত)
6. ৭টা বিলিং-ক্রিটিক্যাল POS সাইট + cost-critical purchase-batch সাইট (সবচেয়ে ঝুঁকিপূর্ণ)

---

**🟢 এন্ট্রি ৮৫ (✅ এই সেশনে sandbox নেটওয়ার্ক কাজ করেছে — এন্ট্রি ৮৪-এর ফিক্সের ফুল ভেরিফিকেশন সম্পূর্ণ) — শুধু ভেরিফিকেশন, কোনো কোড বদল হয়নি**:

**প্রেক্ষাপট**: এন্ট্রি ৮৪-এ `productsSearchSource` রুট-কজ ফিক্স করা হয়েছিল কিন্তু সেই সেশনে sandbox-এ নেটওয়ার্ক অ্যাক্সেস না থাকায় শুধু ম্যানুয়াল কোড-রিভিউ + ব্রেস-ব্যালান্স চেক দিয়ে যাচাই করা হয়েছিল — `npm install`/`test`/`lint`/`typecheck`/`build`/`golden-master`/`fuzz` কোনোটাই চালানো যায়নি। এন্ট্রি ৮৪-এর নোট অনুযায়ী এটাই এই সেশনের প্রথম কাজ ছিল।

**✅ ফলাফল — সবগুলো পাস**:
- `npm install` — ✅ ৪৮৮টা প্যাকেজ ইনস্টল হয়েছে, কোনো এরর নেই
- `npm test` — ✅ সবগুলো সুইট পাস (logic + schema + integration + sync + ১২টা datastore সুইট, মোট শতাধিক কেস)
- `npm run lint` — ✅ 0 error, শুধু প্রি-এক্সিস্টিং warning (৫৬৮টা, এন্ট্রি ৮৪-এর এডিটের সাথে সম্পর্কিত কোনো নতুন warning নেই)
- `npm run typecheck` — ✅ ক্লিন
- `npm run build` — ✅ ক্লিন প্রোডাকশন বিল্ড (chunk-size warning প্রি-এক্সিস্টিং, নতুন কিছু না)
- `npm run test:golden-master` — ✅ ৭/৭ পাস
- `npm run test:fuzz` — ✅ সবগুলো প্রপার্টি (প্রতিটা ১০০০ random রান) পাস

**সিদ্ধান্ত**: এন্ট্রি ৮৪-এর `productsSearchSource` ফিক্স এখন sandbox-লেভেলে পূর্ণাঙ্গভাবে ভেরিফায়েড। **real-device টেস্ট এখনো বাকি** (এন্ট্রি ৮৪-এর "পরের সেশনে আসল করণীয়" তালিকার ১ নম্বর — `sbm_products_boot_never` চালু করে Products ট্যাবে "uncommon" ফিল্টার + সার্চ পুনরায় টেস্ট)।

**📁 এই সেশনে যেসব ফাইল বদলেছে**: কোনোটাই না — শুধু ভেরিফিকেশন কমান্ড চালানো হয়েছে, কোনো সোর্স ফাইল এডিট হয়নি।

**পরের সেশনে আসল করণীয়** (এন্ট্রি ৮৪-এর তালিকা অপরিবর্তিত, নিচে অনুলিপি):
1. real-device: `sbm_products_boot_never` চালু করে Products ট্যাবে "uncommon" ফিল্টার + সার্চ দুটোই আবার টেস্ট করে নিশ্চিত করা যে ফিক্স কাজ করেছে
2. উপরে উল্লেখিত `Products` কম্পোনেন্টের বাকি raw-`products` স্ক্যান সাইটগুলো (calcNextBatch কল-সাইট, ব্যাচ-এডিট প্যানেল) audit
3. POS on-demand cart (`sbm_pos_ondemand_cart`) real-device টেস্ট — সবচেয়ে বড় ব্লকার (অপরিবর্তিত, আগের সিরিয়াল থেকে)
4. এন্ট্রি ৫৩/৫৫/৫৬-এর ৪টা id+hydrate সাইট real-device ভেরিফিকেশন
5. FTS fallback পুল `products`-এর বদলে `productsById`-ভিত্তিক করা (এন্ট্রি ৮২-এর সীমাবদ্ধতা, এখনো অমীমাংসিত)
6. ৭টা বিলিং-ক্রিটিক্যাল POS সাইট + cost-critical purchase-batch সাইট (সবচেয়ে ঝুঁকিপূর্ণ)

---

**🔴 এন্ট্রি ৮৪ (⚠️ sandbox-এ এই সেশনে নেটওয়ার্ক অ্যাক্সেস ছিল না — npm install/test/lint/typecheck/build/golden-master/fuzz কোনোটাই চালানো যায়নি, শুধু ম্যানুয়াল কোড-রিভিউ + ব্রেস-ব্যালান্স চেক — real-device টেস্ট এখনো বাকি, এবার sandbox-ভেরিফিকেশনও বাকি) — real-device-এ ধরা পড়া "uncommon-এ ২৪৩টা কিন্তু ২০৩টা দেখাচ্ছিল, সার্চও কাজ করছে না" বাগের রুট-কজ ফিক্স**:

**প্রেক্ষাপট**: আগের সেশনের (শেয়ার্ড PDF ট্রান্সক্রিপ্ট) ইনভেস্টিগেশন এই zip-এ সংরক্ষিত হয়নি (সেই সেশন "Ran 8 commands, edited a file" পর্যন্ত গিয়ে কাটা পড়েছিল) — এই সেশনে PDF দুটো পড়ে সেই একই রুট-কজ কোড পড়ে পুনরায় নিশ্চিত করা হলো এবং প্রকৃত ফিক্স প্রয়োগ করা হলো।

**রুট-কজ**: Products লিস্ট পেজে (`function Products`) দুটো আলাদা ডেটা-পাথ —
- **ব্রাউজ মোড** (সার্চ না থাকলে): SQL `queryPage()` + `useProductsByIds()` দিয়ে হাইড্রেট — never-load মোডেও ঠিকই কাজ করে। "২০৩/২৪৩" সংখ্যাটা সম্ভবত এখানেই — pagination ঠিকই চলছে কিন্তু scroll/`endReached` ট্রিগার না হওয়া পর্যন্ত বাকি পেজ লোড হয়নি (এটা স্বাভাবিক ভার্চুয়াল-স্ক্রল আচরণ, বাগ না — এই সেশনে হাত দেওয়া হয়নি)।
- **সার্চ মোড (আসল বাগ)**: সার্চ করলে `isSearchActive = true` হয়ে যায়, ফলে `useSqliteBrowse` বন্ধ হয়ে যায় এবং কোড সরাসরি `filteredAll`-এ চলে যায় — যেটা `productsWithSerialAll` থেকে আসে, আর সেটা সরাসরি `products` prop (in-memory array) থেকে। **never-load মোডে এই array চিরস্থায়ীভাবে খালি** — তাই FTS candidate id ঠিকই পাওয়া গেলেও, স্কোরিং-এর জন্য আসল product object খুঁজতে গিয়ে খালি array-তে কিছুই মেলেনি। এই কারণেই সার্চ সম্পূর্ণ কাজ করছিল না। একই রুট-কজে ক্রয়-এন্ট্রি (PE) ফর্মের `peFilteredProds`-ও (লাইন ~২৯৪১৫ এলাকা) আক্রান্ত ছিল।

**ফিক্স**: নতুন `productsSearchSource` — `products.length > 0` হলে `products`-ই (আচরণ অপরিবর্তিত, ৫০০ লাইভ দোকানের ডিফল্ট), নাহলে গ্লোবাল হাইড্রেটেড `productsById` (Zustand store, এন্ট্রি ৭৮/৮০/৮৩-এ পুরো ক্যাটালগ দিয়ে বাল্ক-হাইড্রেট হয়) থেকে `Array.from(...values())`। `productsWithSerialAll` (→ `filteredAll` → সার্চ+ডিফল্ট-সর্ট) এবং `peFilteredProds` (+ তার FTS-threshold চেক) — দুটোই এখন `products`-এর বদলে `productsSearchSource` ব্যবহার করে।

**🔴 সততার সাথে — এই সেশনে যাচাই অসম্পূর্ণ**: sandbox-এ নেটওয়ার্ক না থাকায় `npm install` ব্যর্থ হয়েছে (`node_modules` নেই), তাই `npm test`/`lint`/`typecheck`/`build`/`golden-master`/`fuzz` — **কোনোটাই চালানো যায়নি এই সেশনে**। শুধু ম্যানুয়ালি কোড পড়ে (edited অংশ + আশেপাশের কল-সাইট) এবং ব্রেস-ব্যালান্স স্ক্রিপ্ট দিয়ে যাচাই করা হয়েছে। **পরের সেশনে (নেটওয়ার্ক থাকলে) সবচেয়ে প্রথম কাজ**: `npm install && npm test && npm run lint && npm run typecheck && npm run build && npm run test:golden-master && npm run test:fuzz` চালিয়ে নিশ্চিত হওয়া, তারপরই real-device টেস্ট।

**এখনো না-ছোঁয়া সম্পর্কিত ঝুঁকি (audit-এর সময় পাওয়া, ইচ্ছাকৃতভাবে bounded রাখা হলো)**: `Products` কম্পোনেন্টের ভেতরেই আরও কয়েক জায়গায় সরাসরি `products` (raw array) স্ক্যান হয় (`calcNextBatch(peForm.productId, products, ...)`, ব্যাচ-এডিট প্যানেলের `products.map()`/`.find()` কল-সাইটগুলো ইত্যাদি) — এগুলো এই সেশনে audit করা হয়নি (স্কোপ: শুধু ব্যবহারকারীর রিপোর্ট করা "সার্চ কাজ করছে না" বাগ)। never-load মোডে এই সাইটগুলো ঝুঁকিপূর্ণ থাকতে পারে, future সেশনে পুরো `Products` কম্পোনেন্টের একটা সম্পূর্ণ grep-audit করা উচিত (এন্ট্রি ৮২-এর প্যাটার্ন অনুসরণ করে)।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — নতুন `productsSearchSource` (never-load ফলব্যাক, গ্লোবাল `productsById` থেকে) + `productsWithSerialAll`/`peFilteredProds`/তার FTS-threshold চেক এখন `products`-এর বদলে এটা ব্যবহার করে

**পরের সেশনে আসল করণীয়**:
0. **সবার আগে**: sandbox-এ `npm install && npm test && npm run lint && npm run typecheck && npm run build && npm run test:golden-master && npm run test:fuzz` চালিয়ে এই সেশনের ফিক্স যাচাই (নেটওয়ার্ক না থাকলে ব্যবহারকারীকে জানানো)
1. real-device: `sbm_products_boot_never` চালু করে Products ট্যাবে "uncommon" ফিল্টার + সার্চ দুটোই আবার টেস্ট করে নিশ্চিত করা যে ফিক্স কাজ করেছে
2. উপরে উল্লেখিত `Products` কম্পোনেন্টের বাকি raw-`products` স্ক্যান সাইটগুলো (calcNextBatch কল-সাইট, ব্যাচ-এডিট প্যানেল) audit
3. POS on-demand cart (`sbm_pos_ondemand_cart`) real-device টেস্ট — সবচেয়ে বড় ব্লকার (অপরিবর্তিত, আগের সিরিয়াল থেকে)
4. এন্ট্রি ৫৩/৫৫/৫৬-এর ৪টা id+hydrate সাইট real-device ভেরিফিকেশন
5. FTS fallback পুল `products`-এর বদলে `productsById`-ভিত্তিক করা (এন্ট্রি ৮২-এর সীমাবদ্ধতা, এখনো অমীমাংসিত)
6. ৭টা বিলিং-ক্রিটিক্যাল POS সাইট + cost-critical purchase-batch সাইট (সবচেয়ে ঝুঁকিপূর্ণ)

---

**🟢 এন্ট্রি ৮৩ (✅ sandbox নেটওয়ার্ক কাজ করেছে, npm test/lint/typecheck/build/golden-master/fuzz সব পাস — real-device টেস্ট এখনো বাকি) — ব্যবহারকারীর "৪, ৫, ৬ করুন" নির্দেশে ৩টা আইটেম যাচাই/সমাধান**:

**প্রেক্ষাপট**: আগের সেশনে "পুরো অ্যাপ SQL মাইগ্রেশনে আর কি বাকি" প্রশ্নের জবাবে যে সিরিয়াল দেওয়া হয়েছিল, তার ৪ (`buildManualBackupData`), ৫ (`performMasterSync` merge), ৬ (never-load মোডে schema migration status গ্যাপ) নিয়ে কাজ করার নির্দেশ এলো।

**✅ ৪ ও ৫ — ইতিমধ্যে সম্পূর্ণ পাওয়া গেল (কোনো নতুন কাজ লাগেনি)**: এই দুটো আসলে **আগেই এন্ট্রি ৭৬-এ সম্পূর্ণ হয়ে গিয়েছিল** — `buildManualBackupData()` async + SQLite-fallback + null-safety guard, `performMasterSync()`-এর merge তুলনায় SQLite থেকে পূর্ণ products fetch, দুটোই কোড পড়ে যাচাই করা হলো (`PRODUCTS_SQLITE_PRIMARY_PHASE_PLAN.md` ডকুমেন্টটা stale ছিল, এন্ট্রি ৭৬-এর পরে আর আপডেট হয়নি — তাই আগের সেশনের সারাংশে এই দুটো ভুলভাবে "বাকি" হিসেবে দেখানো হয়েছিল)। কোনো কোড বদল হয়নি এই দুটোর জন্য।

**✅ ৬ — সমাধান হলো (আসল নতুন কাজ)**: never-load মোডে `_hydrateProductsByIdFromSql()` (এন্ট্রি ৮০) SQLite থেকে raw রো পড়ত কিন্তু কখনো `SchemaMigration.runAll()` চালাত না (blob-load পথই একমাত্র জায়গা ছিল যেখানে migration ট্রিগার হতো, আর never-load মোডে সেই পথ স্কিপ হয়) — ফলে `schemaMigrationStats` কার্ড কখনো দেখাত না, আর হয়তো-পুরনো-schema রেকর্ড productsById-তে অমাইগ্রেটেড শেপেই বসত।
- এখন hydrate-এর ভেতরেই SQLite থেকে পড়া রো-গুলোর উপর `SchemaMigration.runAll()` চলে (সিঙ্ক্রোনাস/delay-mode বুট-প্যাচের ঠিক একই pure-function প্যাটার্ন) — migrated শেপ productsById-তে বসে, `schemaMigrationStats` ঠিকভাবে সেট/ক্লিয়ার হয়।
- **বাড়তি**: যেসব রেকর্ড আসলে migrate হয়েছে সেগুলো `upsertMany()` দিয়ে ফায়ার-অ্যান্ড-ফরগেট SQLite-এও write-back হয় — শুধু in-memory ঠিক করা যথেষ্ট ছিল না, কারণ aggregate হুক/single-id fallback সরাসরি SQLite থেকে পড়ে, সেগুলো এই write-back ছাড়া এখনো পুরনো শেপ পেত। ব্যর্থ হলে নন-ফেটাল (পরের বুটে idempotent রিট্রাই)।
- **এন্ট্রি ৭৮-এর delay-mode hydrate-এও (never-load বন্ধ, শুধু boot-lazy চালু) এখন এই একই migration+write-back চলে** — যেহেতু এই hydrate ফাংশনটাই দুই মোডে শেয়ার্ড। ৫০০ লাইভ দোকানে `sbm_products_boot_lazy` নিজেও ডিফল্ট বন্ধ থাকায় zero impact, কিন্তু সততার সাথে উল্লেখ — এটা শুধু never-load-স্কোপড ফিক্স না, boot-lazy-শুধু মোডেও নতুন (নিরাপদ, additive) আচরণ।

**যাচাই সম্পূর্ণ (sandbox)**: `npm install` → `npm test` (সব প্রি-এক্সিস্টিং কেস পাস) → `npm run lint` (0 error) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) — সবগুলো পাস। **real-device টেস্ট এখনো বাকি**।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `_hydrateProductsByIdFromSql()`-এ SchemaMigration.runAll() + schemaMigrationStats সেট/ক্লিয়ার + migrated রেকর্ডের upsertMany() write-back

**পরের সেশনে আসল করণীয়** (আগের সিরিয়াল অনুযায়ী, ১-৩ শুধু real-device-এ সম্ভব):
1. POS on-demand cart (`sbm_pos_ondemand_cart`) real-device টেস্ট — সবচেয়ে বড় ব্লকার
2. never-load ফ্ল্যাগ real-device স্মোক-টেস্ট (বুট/POS/Dashboard/Products/সাপ্লায়ার/কাস্টমার-অর্ডার/ক্রয়-এন্ট্রি, SQL ইচ্ছাকৃতভাবে বন্ধ করে ব্যানার+রিট্রাই আচরণসহ, এখন migration status card-ও)
3. এন্ট্রি ৫৩/৫৫/৫৬-এর ৪টা id+hydrate সাইট real-device ভেরিফিকেশন
4. FTS fallback পুল `products`-এর বদলে `productsById`-ভিত্তিক করা (এন্ট্রি ৮২-এর সীমাবদ্ধতা, এখনো অমীমাংসিত)
5. ৭টা বিলিং-ক্রিটিক্যাল POS সাইট + cost-critical purchase-batch সাইট (সবচেয়ে ঝুঁকিপূর্ণ)
6. চূড়ান্ত ধাপ: `products` boot থেকে পুরোপুরি সরানো (১-৩ real-device ভেরিফায়েড হওয়ার পরই)
7. পুরনো IndexedDB blob-array কোড মোছা (Phase 5, ৪-৬ সপ্তাহ স্থিতিশীল থাকার পর)

---

**🟢 এন্ট্রি ৮২ (✅ sandbox নেটওয়ার্ক কাজ করেছে, npm test/lint/typecheck/build/golden-master/fuzz সব পাস — real-device টেস্ট এখনো বাকি) — এন্ট্রি ৮০-এর কাজ ২ (silent fallback → error/retry) এখন সম্পূর্ণ**:

**প্রেক্ষাপট**: ব্যবহারকারী "২ নাম্বার কাজটি পুরো কমপ্লিট করুন" বললেন।

**যা করা হলো — এন্ট্রি ৮০-তে শুধু single-id lookup-এ (`getProductByIdWithSqlFallback`) থাকা `_markProductsSqlDownIfRisky()`/`_clearProductsSqlDown()` লজিক শেয়ার্ড হেল্পারে বের করে বাকি সবগুলো products-নির্ভর SQL-primary+JS-fallback সাইটে ছড়ানো হলো**:

1. **১৫টা "aggregate/list" হুক** (এন্ট্রি ৪৪/৫৪/৬২/৭২ ইত্যাদিতে বানানো) — প্রতিটার catch ব্লকে `_markProductsSqlDownIfRisky()`, success-এ `_clearProductsSqlDown()`:
   `useProductsByIds`, `useProductStockTotals`, `useLowStockItems`, `useOutOfStockCount`, `useOutOfStockItems`, `useExpiryCandidates`, `useSupplierDueRows`, `useProductSalesRows`, `useReorderAlerts`, `useKnownCategories`, `useRiskProducts`, `useKnownSuppliers`, `useKnownDosageForms`, `useLiveDupProduct`, `useInventoryData` (এটা নিজেই এন্ট্রি ৫৪ থেকে sqlStatus:'error' এক্সপোজ করত, silent ছিল না — এখানে শুধু গ্লোবাল ব্যানারের সাথে সিঙ্ক করা হলো)।

2. **৫টা FTS-narrowing সাইট**-এ (POS প্রধান সার্চ, Products-লিস্ট সার্চ, সাপ্লায়ার-লিস্ট সার্চ, কাস্টমার-অর্ডার সাজেশন, ক্রয়-এন্ট্রি সাজেশন) **একটা ভিন্ন, গভীরতর বাগ** পাওয়া গেল ও ফিক্স হলো: থ্রেশহোল্ড-চেক ছিল `products.length <= FTS_NARROW_THRESHOLD` — never-load মোডে `products.length` সবসময় ০, তাই এই শর্ত সবসময় true হয়ে **SQL/FTS-কেই এড়িয়ে সরাসরি খালি array স্ক্যান করত**, catch ব্লক পর্যন্ত পৌঁছাতোই না। ফিক্স: `(products.length > 0 && products.length <= FTS_NARROW_THRESHOLD)` — length===０ (ছোট ক্যাটালগ থেকে আলাদা করে) আর কখনো narrowing স্কিপ করে না, সবসময় SQL-এর মাধ্যমে চেষ্টা করে। ব্যর্থ হলে `_markProductsSqlDownIfRisky()`, সফল হলে `_clearProductsSqlDown()`।

**ফলাফল**: এখন never-load মোডে (`sbm_products_boot_never` চালু) SQL ডাউন থাকলে **যেকোনো** products-নির্ভর ফিচার (স্টক/লো-স্টক/আউট-অফ-স্টক/এক্সপায়ারি/সাপ্লায়ার-ডিউ/রিঅর্ডার/ক্যাটাগরি-চিপ/লস-ঝুঁকি/ডসেজ-ফর্ম/ডুপ-নেম-চেক/POS-সার্চ/Products-লিস্ট-সার্চ/সাপ্লায়ার-সার্চ/কাস্টমার-অর্ডার-সাজেশন/ক্রয়-এন্ট্রি-সাজেশন) `productsNeverLoadSqlDown` গ্লোবাল ফ্ল্যাগ সেট করে, উপরের লাল ব্যানার দেখায় — কোনোটাই আর নীরবে ভুল/শূন্য ফলাফল দেখায় না। ডিফল্ট মোডে (never-load বন্ধ, products সবসময় পূর্ণ) `products.length` কখনো ০ হয় না বলে এই সব নতুন গার্ড কখনো ট্রিগার হয় না — behavior-preserving, ৫০০ লাইভ দোকানে zero impact।

**🔴 এখনো জানা সীমাবদ্ধতা (সততার সাথে)**:
- FTS ব্যর্থ হলে fallback পুল এখনো raw `products` array (never-load-এ খালি) — সঠিক ফিক্স হতো `productsById`/`globalProdMap`-ভিত্তিক ফলব্যাকে বদলানো, কিন্তু সেটা প্রতিটা কল-সাইটের রেন্ডার-লজিক আলাদাভাবে audit করা লাগবে (বড় কাজ)। আপাতত ব্যানার+রিট্রাই-ই ব্যবহারকারীর একমাত্র সংকেত — silent ভুল ডেটা না দেখানোটাই মূল লক্ষ্য ছিল, এটা অর্জিত।
- Dashboard-এর সিঙ্ক্রোনাস `jsAllStock`/`jsCriticalStock`/`jsStockOut`/`jsSupplierRows` (local `useMemo`, `useInventoryData`-এর ভেতরে) never-load মোডে গার্ডেড sqlStatus:'error' পাথ দিয়েই protected — কিন্তু এর বাইরে যদি কোনো কম্পোনেন্ট সরাসরি রॉ `products` prop স্ক্যান করে (কোনো hook ছাড়া, ইনলাইন `.filter()`/`.map()`) সেগুলো এই অডিটের বাইরে থেকে যেতে পারে — সম্পূর্ণ ১০০% নিশ্চয়তা নেই একটা ৪২k+ লাইনের ফাইলে, যদিও গ্রেপ-অডিট অনুযায়ী এন্ট্রি ৭৯-এ চিহ্নিত সব ক্যাটাগরির শেয়ার্ড হুক/FTS-সাইট কভার হয়েছে।

**যাচাই সম্পূর্ণ (sandbox)**: `npm install` → `npm test` (সব প্রি-এক্সিস্টিং কেস পাস) → `npm run lint` (0 error, শুধু প্রি-এক্সিস্টিং warning) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) — সবগুলো পাস। **real-device টেস্ট এখনো বাকি** — উভয় ফ্ল্যাগ ডিফল্ট বন্ধ, তাই বর্তমান ৫০০ লাইভ দোকানে কোনো ঝুঁকি নেই।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `_markProductsSqlDownIfRisky()`/`_clearProductsSqlDown()` শেয়ার্ড হেল্পার (`getProductByIdWithSqlFallback`-এর ইনলাইন লজিক থেকে বের করা) + ১৫টা হুক + ৫টা FTS-narrowing সাইটে (থ্রেশহোল্ড-বাগ ফিক্সসহ) ওয়্যার করা

**পরের সেশনে আসল করণীয়**:
1. real-device: `sbm_products_boot_lazy` + `sbm_products_boot_never` দুটোই চালু করে বুট/POS/Dashboard/Products/সাপ্লায়ার/কাস্টমার-অর্ডার/ক্রয়-এন্ট্রি স্মোক-টেস্ট (বিশেষভাবে SQL ইচ্ছাকৃতভাবে বন্ধ করে ব্যানার+রিট্রাই আচরণ যাচাই)
2. never-load মোডে schema migration স্ট্যাটাস দেখানোর সমাধান (এন্ট্রি ৮০-এর জানা সীমাবদ্ধতা, এখনো অমীমাংসিত)
3. FTS-ব্যর্থতার fallback পুল `products`-এর বদলে `productsById`-ভিত্তিক করা (উপরে উল্লেখিত সীমাবদ্ধতা)

---

**🟢 এন্ট্রি ৮০ (✅ sandbox নেটওয়ার্ক কাজ করেছে, npm test/lint/typecheck/build/golden-master/fuzz সব পাস — real-device টেস্ট এখনো বাকি) — পরের সেশনের ২টা কাজের প্রথমটা সম্পূর্ণ + দ্বিতীয়টার শুধু একটা bounded অংশ**:

**প্রেক্ষাপট**: ব্যবহারকারী এন্ট্রি ৭৯-এর "পরের সেশনে আসল করণীয়" ২টাই ক্রমান্বয়ে (প্রথমটা আগে) করতে বললেন।

**✅ কাজ ১ (সম্পূর্ণ) — `sbm_products_boot_lazy`-কে "দেরি" থেকে "কখনো লোড না করা"-য় আপগ্রেড**:
- নতুন **স্বাধীন, dependent ফ্ল্যাগ** `sbm_products_boot_never` (`isProductsNeverLoadEnabled()`/`setProductsNeverLoadEnabled()`, `src/db/DataStore.js`) — `sbm_pos_ondemand_cart`-এর ঠিক একই প্যাটার্নে: `sbm_products_boot_lazy` চালু না থাকলে অর্থহীন, ডিফল্ট বন্ধ।
- App.jsx বুট-সিকোয়েন্স: এই ফ্ল্যাগ চালু থাকলে এন্ট্রি ৭৮-এর SQLite বাল্ক-হাইড্রেট এখন **await করা হয়** (আগে fire-and-forget ছিল) — হাইড্রেট সফল হলে **এবং তখনই** নিচের পুরনো `setTimeout(() => loadMany([LK(SK.products)]))` blob-load ব্লক সম্পূর্ণ স্কিপ হয় (`products` React array স্থায়ীভাবে `[]` থাকে, `productsById`-ই একমাত্র সোর্স)। হাইড্রেট ব্যর্থ হলে বা SQL/businessType না থাকলে নিরাপদে পুরনো delay-only আচরণে fallback (blob তখনও লোড হয়) — কখনো ডেটা হারায় না।
- ফ্ল্যাগ বন্ধ থাকলে (৫০০ দোকানের বর্তমান ডিফল্ট অবস্থা, এবং `sbm_products_boot_lazy` নিজেও ডিফল্ট বন্ধ) কোনো আচরণ বদলায়নি — behavior-preserving।
- Dev প্যানেলে নতুন `ProductsNeverLoadToggle` (boot-lazy বন্ধ থাকলে disabled/opacity দেখায়) — `ProductsBootLazyToggle`-এর পাশে বসানো।
- **জানা সীমাবদ্ধতা**: never-load মোডে blob পড়া হয় না বলে `schemaMigrationStats` কখনো সেট হবে না সেই বুটে (migration status card দেখাবে না) — future ফিক্স প্রয়োজন যদি কোনো দোকানের products-এ এখনো পেন্ডিং schema migration থাকে।

**🟡 কাজ ২ (আংশিক, ইচ্ছাকৃতভাবে bounded) — silent fallback → explicit error/retry state**:
- নতুন গ্লোবাল স্টোর ফ্ল্যাগ `productsNeverLoadSqlDown` (ডিফল্ট `false`)।
- শুধু **single-id** `getProductByIdWithSqlFallback()`-এ (সবচেয়ে বেশি ব্যবহৃত সাইট) গার্ড বসানো হলো: `products` array খালি থাকা অবস্থায় (never-load মোডের চিহ্ন) SQL কলও ব্যর্থ হলে এই ফ্ল্যাগ `true` হয়; পরের যেকোনো সফল SQL কলে স্বয়ংক্রিয়ভাবে `false`-এ self-heal হয়।
- App শেলে (SmartBusinessMgmt টপ-লেভেল) একটা fixed লাল ব্যানার + "রিট্রাই" বাটন (আপাতত `window.location.reload()`) — ফ্ল্যাগ true হলেই দেখায়, সব ট্যাবে।
- **🔴 সততার সাথে — অসম্পূর্ণ**: বাকি ৬৫টা bulk-scan সাইট (এন্ট্রি ৭৯-এর টেবিলে তালিকাভুক্ত — ডুপ-নেম চেক, ইনভেন্টরি/সাপ্লায়ার, কাস্টমার-অর্ডার/PE, সিরিয়াল নম্বরিং, POS/PE/PNL) এখনো SQL ব্যর্থ হলে `products`/`productsByIdMap`/`globalProdMap` (এখন স্থায়ীভাবে খালি) নীরবে স্ক্যান করে — অর্থাৎ never-load মোডে SQL ডাউন থাকলে এই সাইটগুলো ভুল/শূন্য ফলাফল **নীরবেই** দেখাতে পারে, ব্যানার দেখাবে না। Dev টগলের বর্ণনা ও কোড কমেন্টে এই সীমাবদ্ধতা স্পষ্টভাবে লেখা আছে।

**যাচাই সম্পূর্ণ (sandbox)**: `npm install` → `npm test` (সব প্রি-এক্সিস্টিং কেস পাস, নতুন টেস্ট যোগ হয়নি এই সেশনে) → `npm run lint` (0 error) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) — সবগুলো পাস। **real-device টেস্ট এখনো বাকি** — উভয় ফ্ল্যাগ ডিফল্ট বন্ধ, তাই বর্তমান ৫০০ লাইভ দোকানে কোনো ঝুঁকি নেই যতক্ষণ না ম্যানুয়ালি চালু করা হয়।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/db/DataStore.js` — নতুন `sbm_products_boot_never` ফ্ল্যাগ (get/set)
- `src/App.jsx` — বুট-সিকোয়েন্সে never-load স্কিপ-লজিক, নতুন `productsNeverLoadSqlDown` স্টোর ফিল্ড, `getProductByIdWithSqlFallback()`-এ গার্ড, `ProductsNeverLoadToggle` কম্পোনেন্ট + মাউন্ট, top-level এরর ব্যানার

**পরের সেশনে আসল করণীয়**:
1. real-device: `sbm_products_boot_lazy` + `sbm_products_boot_never` দুটোই চালু করে বুট/POS/Dashboard/Products স্মোক-টেস্ট
2. বাকি ৬৫টা bulk-scan সাইটে (এন্ট্রি ৭৯-এর টেবিল অনুযায়ী) একই `productsNeverLoadSqlDown` গার্ড ছড়ানো — বড় কাজ, একাধিক সেশনে ভাগ করে করা উচিত
3. never-load মোডে schema migration স্ট্যাটাস দেখানোর সমাধান (জানা সীমাবদ্ধতা, উপরে দেখুন)

---

**🟢 এন্ট্রি ৭৯ — "৬৬টা সাইট" এক এক করে সরাসরি কোড খুলে re-audit (শুধু অডিট, কোনো কোড বদলায়নি) — স্কোপ বড় ধরনের সংশোধন**:

**প্রেক্ষাপট**: এন্ট্রি ৭৬/৭৮-এ "৬৬টা `products` bulk-scan সাইট রূপান্তর করতে হবে" — এটাই বাকি সবচেয়ে বড় কাজ বলে চিহ্নিত ছিল। এই সেশনে প্রতিটা সাইট (grep-এর প্রতিটা লাইন নম্বর) সরাসরি কোড খুলে, ঘিরে থাকা ফাংশন/কম্পোনেন্ট পড়ে যাচাই করা হলো (অনুমান/স্যাম্পলিং না)।

**✅ ফলাফল — প্রায় সবগুলোই ইতিমধ্যে কাভার্ড**: ক্যাটাগরি-চিপ (`useKnownCategories`→`dsGetDistinctCategories`), ডুপ-নেম চেক (`useLiveDupProduct`+সেভ-টাইম গার্ড→`dsFindProductByNameNorm`), ইনভেন্টরি/সাপ্লায়ার (`useInventoryData`→`dsGetInventoryList`/`dsGetSupplierSummary`), কাস্টমার-অর্ডার/PE সাজেশন পুল (FTS narrowing bounded) — সবগুলোই ইতিমধ্যে-প্রতিষ্ঠিত **SQL-primary + JS-fallback** প্যাটার্নে (এন্ট্রি ৪৪/৫৪/৫৫/৫৬/৫৭/৬০/৬১/৬২/৬৪/৬৫/৬৮/৭২/৭৪) ঢাকা। সিরিয়াল-নম্বরিং সাইট (১৯১৮৪/২৮৯৯৫) legacy fallback array মাত্র — আসল ব্রাউজ পেজিনেশন আলাদাভাবে SQL `browse_rank` দিয়ে হয় (এন্ট্রি ৭৭-এ আগেই কনফার্মড)। বাকি সব লোকাল `productsByIdMap`/`globalProdMap` (useMemo) আগে থেকেই `useProductsByIds()`-এ র‍্যাপড।

**🔴 স্কোপ-সংশোধন — আসল বাকি কাজ ভিন্ন, নতুন করে চিহ্নিত**: "৬৬টা সাইট রূপান্তর"-এর দরকার নেই (নতুন SQL অ্যাগ্রিগেট ফাংশন ডিজাইন করার কাজ বাকি নেই)। আসল ২টা বাকি জিনিস:
1. `sbm_products_boot_lazy` এখনো শুধু blob-load **দেরি** করায় (`setTimeout(0)`), কখনো **স্কিপ** করে না (এন্ট্রি ৭৮-এ কনফার্মড) — "কখনো লোড না করা" মোডটাই এখনো তৈরিই হয়নি।
2. উপরের SQL-primary+JS-fallback হুকগুলোর ফলব্যাক-লজিক এখন ধরে নেয় SQL ব্যর্থ হলে `products` (in-memory) পূর্ণ/নির্ভরযোগ্য — এটা সত্যি শুধু বুট-লেজি বন্ধ থাকা/বর্তমান "দেরি-শুধু" মোডে। "কখনো লোড না করা" মোড তৈরি হলে এই একই ফলব্যাক নীরবে আংশিক `products`-এর উপর ভুল ফলাফল দিতে শুরু করবে (স্টক/ক্যাটাগরি/ডুপ-চেক ভুল) — তাই সেই মোডে SQL ব্যর্থতাকে "নীরব JS fallback" না করে explicit error/retry state-এ পাঠানো লাগবে (নতুন নিরাপত্তা-গার্ড, এখনো ডিজাইন করা হয়নি)।

**যাচাই**: এই সেশনে কোনো কোড বদলায়নি (শুধু অডিট/পড়া) — তাই টেস্ট/lint/build রি-রান করা হয়নি, আগের এন্ট্রি ৭৮-এর সবুজ অবস্থাই বলবৎ।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `SQLITE_MIGRATION_LOG.md` — এই এন্ট্রি (কোনো src ফাইল বদলায়নি)

---



**🟡 এন্ট্রি ৭৮ — এন্ট্রি ৭৭-এর ২টা বাকি আইটেমের প্রথমটা (বুট-হাইড্রেট) যোগ + দ্বিতীয়টার (bulk-vs-bounded classification) সম্পূর্ণ অডিট (ফ্ল্যাগ এখনো ফ্লিপ করা হয়নি)**:

**প্রেক্ষাপট**: এন্ট্রি ৭৭-এ ২টা বাকি কাজ চিহ্নিত হয়েছিল — (১) বুটে SQLite থেকে সরাসরি `productsById` বাল্ক-হাইড্রেট করা, (২) `productsById`-কে বাল্ক/সিঙ্ক্রোনাস সোর্স হিসেবে ধরে নেওয়া সাইটগুলোর সম্পূর্ণ তালিকা। এই সেশনে দুটোই ধরা হলো।

**✅ (২) সম্পূর্ণ তালিকা (৭২টা `productsById`/`productsByIdMap` রেফারেন্স গ্রেপ করে একে একে যাচাই করা হলো)**:
- **গ্লোবাল স্টোর `productsById` (Zustand)-এর প্রতিটা প্রকৃত ব্যবহার bounded** — সব জায়গায় নির্দিষ্ট একটা id-তে `.get(id)` (একক প্রোডাক্ট, ইনভয়েস-লাইন-আইটেম লুপের ভেতরে) — `getProductByIdWithSqlFallback()`, ভয়েড/রিটার্ন ফ্লো, `_itemCostPrice()`/`calcInvoiceProfit()`/`calcProfitTotal()`/`calcProfitByProductWithInvoices()` (এই চারটা লজিক ফাংশনই `prodMap?.get?.(id)` — কখনো পুরো Map ইটারেট করে না)। কোথাও `.values()`/`.entries()`/`.forEach()`/`[...map]`/`Array.from(map)` প্যাটার্নে গ্লোবাল Map ইটারেট হচ্ছে না (আলাদাভাবে গ্রেপ করে যাচাই করা হয়েছে) — তাই boot-lazy সত্যিকারভাবে "কখনো লোড না করা"-য় গেলেও এই সাইটগুলো ভাঙবে না, শুধু আরও বেশি SQL fallback ফায়ার হবে (ধীর কিন্তু সঠিক)।
  - একমাত্র semi-bulk প্যাটার্ন: `useKpiStats()`/`useDashboardTotals()`-এর মতো প্লেইন ফাংশনে `_globalProdMap.size > 0 ? _globalProdMap : new Map(products.map(...))` — এটা bulk-iteration না, শুধু emptiness-চেক + fallback rebuild (products আংশিক/খালি হলে fallback-ও আংশিক/খালিই হবে, কিন্তু `.get()` মিস হলে `_itemCostPrice()` নিজেই `item.costPrice` (ইনভয়েস-টাইমে সেভ করা) ফলব্যাক ব্যবহার করে — তাই ডেটা-করাপশন না, শুধু edge-case-এ display-এর সামান্য নির্ভুলতা কমতে পারে)।
  - `calcProfitByProductWithInvoices()`-এর `productsFallback.find(pr => pr.name === item.name)` (App.jsx লাইন ৮৩১১) — এটাও `products` array-এর উপর bulk `.find()`, কিন্তু ফলাফল শুধু `displayName`-এ ব্যবহৃত হয়, যেটার নিজস্ব `|| item.name` ফলব্যাক আছে — safe।
- **লোকাল `productsByIdMap` (কম্পোনেন্ট-লেভেল `useMemo(() => new Map(products.map(...)), [products])`, POS ব্রাউজ/PE/PNL/সেলফ-ইউজ ইত্যাদি ~৭টা জায়গা)** — এগুলো ইতিমধ্যেই ধাপ ৭.৩ প্রস্তুতির অংশ হিসেবে `useProductsByIds(ids, businessType, productsByIdMap)` হুক দিয়ে র‍্যাপড (বাউন্ডেড id-সেট, SQL fallback-সহ) — নতুন কিছু বদলানোর দরকার নেই, আগেই সঠিক প্যাটার্নে ছিল।
- **সারমর্ম**: `productsById`-কেন্দ্রিক কোনো কল-সাইটই boot-lazy "কখনো লোড না করা"-র জন্য ব্লকার না — আসল ব্লকার এখনো এন্ট্রি ৭৬-এ মাপা `products` array-এর ৬৬টা সরাসরি bulk-scan সাইট (`products.map/filter/find/forEach/reduce`), যেগুলো `productsById`-এর সাথে সম্পর্কহীন, আলাদা রূপান্তর-কাজ।

**✅ (১) বুট-হাইড্রেট যোগ হলো**: `sbm_products_boot_lazy` চালু থাকলে এখন App.jsx বুট-সিকোয়েন্সে (পুরনো IndexedDB-blob `setTimeout(0)` লোডের পাশাপাশি, সমান্তরালে, স্বাধীনভাবে) সরাসরি SQLite থেকে (`dsGetAllRows(businessType, "products")`, ইতিমধ্যে-প্রমাণিত keyset-paginated ফাংশন) সব প্রোডাক্ট পড়ে `mergeItemsIntoIdMap()` দিয়ে গ্লোবাল `productsById`-এ merge-patch করে দেওয়া হয়। `products` React array স্পর্শ করা হয় না (তাই ৬৬টা bulk-scan সাইট অপ্রভাবিত/অপরিবর্তিত থাকে)। ব্যর্থ হলে (try/catch) নিঃশব্দে পুরনো blob-load পথে ফলব্যাক করে, কোনো এরর ইউজারকে দেখায় না।

**🔴 সততার সাথে — ফ্ল্যাগ এখনো ফ্লিপ করা হয়নি, কারণ**: এই বুট-হাইড্রেট শুধু bounded lookup-গুলো (`productsById.get(id)`) আগে থেকে দ্রুত রেডি করে দেয় — `products` array এখনো পুরোপুরি লোড হয় (নিচের blob-load ব্লক অপরিবর্তিত রাখা হয়েছে, dual-write নিয়ম মেনে)। তাই এই সেশনের কাজে **কোনো আচরণ বদলায়নি** (productsKeyLazy ডিফল্ট বন্ধ, চালু থাকলেও শুধু productsById আরেকটু আগে রেডি হয় — কার্যকরী ফলাফল অভিন্ন)। `sbm_products_boot_lazy`-কে "কখনো লোড না করা"-য় আপগ্রেড করতে এখনো বাকি: ৬৬টা `products` bulk-scan সাইট একটার পর একটা `useProductsByIds()`/SQL-agg প্যাটার্নে রূপান্তর (এন্ট্রি ৭৬-এ চিহ্নিত, POS ব্রাউজ/PE/PNL-এর মতোই), তারপরই blob-load ব্লক সরানো নিরাপদ হবে।

**যাচাই সম্পূর্ণ (sandbox)**: `npm install` → `npm test` (**১৪৭টা কেস, সব পাস, অপরিবর্তিত** — এই সেশনে `tests/*.mjs`-এ কোনো নতুন কেস যোগ হয়নি, কারণ পরিবর্তন শুধু App.jsx-এর বুট-সিকোয়েন্সে, যেটা node-based DataStore/logic টেস্ট সুইট দিয়ে কভার হয় না — device/E2E যাচাই এখনো বাকি) → `npm run lint` (0 error, ৫৬৭ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) — সবগুলো পাস। **real-device টেস্ট এখনো বাকি** (`sbm_products_boot_lazy` চালু করে বুট-টাইমে bulk-hydrate race/perf আসল Android ডিভাইসে যাচাই করা উচিত ফ্ল্যাগ ব্যবহারিকভাবে চালুর আগে)।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `productsKeyLazy` ব্লকে নতুন সমান্তরাল SQLite বাল্ক-হাইড্রেট (IIFE, `dsGetAllRows` + `mergeItemsIntoIdMap` পুনর্ব্যবহার, নতুন কোনো ইমপোর্ট লাগেনি — দুটোই আগে থেকেই ইমপোর্টেড)। পুরনো blob-load `setTimeout(0)` ব্লক অপরিবর্তিত।
- `SQLITE_MIGRATION_LOG.md` — এই এন্ট্রি

---

**🔴 এন্ট্রি ৭৭ — বুট-রিমুভাল (ধাপ ৪) পুনরায় গভীর অডিট + productsById-এর একটা রিয়েল ডেটা-করাপশন বাগ ফিক্স (ফ্ল্যাগ এখনো ফ্লিপ করা হয়নি)**:

**প্রেক্ষাপট**: এন্ট্রি ৭৬-এর পর ব্যবহারকারী "আসল বুট-রিমুভাল" আবার এক সেশনে চেষ্টা করতে বলেছিলেন (আগের সেশন মেসেজ-লিমিটে আটকে গিয়েছিল, ওই কোড কখনো ডেলিভার হয়নি — zip-এ এন্ট্রি ৭৬-এর অবস্থাই ছিল)।

**✅ পুনঃঅডিটে ভালো খবর**: এন্ট্রি ৭৬-এর "৬৬টা সাইট ভাঙবে" পরিমাপ বাস্তবের চেয়ে বেশি সতর্ক ছিল। কোড সরাসরি পড়ে যাচাই করা হলো — এন্ট্রি ৩৬-৭৪ ধরে বেশিরভাগ ক্যাটাগরি ইতিমধ্যেই SQL-ফার্স্ট + `products` শুধু ফলব্যাক প্যাটার্নে সঠিকভাবে কাভার্ড: InventorySection (jsAllStock/jsCriticalStock/jsStockOut/সাপ্লায়ার-গ্রুপিং — dsGetInventoryList/dsGetSupplierSummary), ডুপ্লিকেট-নাম চেক (dsFindProductByNameNorm), ক্যাটাগরি-লিস্ট (dsGetDistinctCategories), POS কার্ট lookup (posOndemandCart ফ্ল্যাগ), আর সবচেয়ে গুরুত্বপূর্ণ — বিক্রি/ভয়েড/রিটার্নের স্টক-ডিডাকশন (`getProductByIdWithSqlFallback()`, এন্ট্রি ৭৪) সবই ইতিমধ্যে SQL fallback-সহ।

**🔴 কিন্তু একটা আসল ব্লকার পাওয়া গেল (নতুন, আগে কারো নজরে পড়েনি)**: গ্লোবাল `productsById` (Zustand store Map, POS/বিক্রি/ভয়েড সহ বহু জায়গায় ব্যবহৃত) আগে `useAppStore.subscribe((s)=>s.products, ...)`-এ **সম্পূর্ণ রিবিল্ড** হতো (`new Map(products.map(...))`) প্রতিবার `products` state বদলালেই। `products` সবসময় বুটে পূর্ণ থাকা অবস্থায় এটা নিরাপদ ছিল। কিন্তু `sbm_products_boot_lazy` সত্যিকারভাবে "কখনো পুরোপুরি লোড না করা"-য় গেলে `products` React state আর সবসময় পূর্ণ থাকবে না (শুধু locally-touched আইটেম থাকবে) — তখন যেকোনো সাধারণ এডিট/ডিলিট/নতুন-এন্ট্রি (`setProducts(prev => ...)`) এই wholesale-rebuild-এর কারণে আগে SQLite থেকে হাইড্রেট করা বাকি পুরো ক্যাটালগ productsById থেকে মুছে ফেলত (products array-তে না-থাকা মানেই আগের লজিক "ডিলিটেড" ধরে নিত)। এটা সাময়িক UI-glitch না — প্রতিটা সাধারণ এডিটেই ঘটত, অর্থাৎ নিয়মিত ডেটা-করাপশন ঝুঁকি (ভুল স্টক/পাওয়া-না-যাওয়া পণ্য) ছিল।

**✅ এই বাগ এই সেশনে ফিক্স হয়েছে**:
- নতুন pure/টেস্টেড ফাংশন `mergeItemsIntoIdMap(prevMap, prevIds, items)` — `src/logic.js`-এ যোগ হলো। wholesale rebuild-এর বদলে **merge-patch**: নতুন/বদলানো আইটেম Map-এ বসে (পুরনো এন্ট্রি অক্ষত থাকে), ডিলিশন শুধু তখনই propagate হয় যখন কোনো id আগের `items` অ্যারেতে ছিল কিন্তু এখন নেই (প্রকৃত/ইচ্ছাকৃত ডিলিট) — কখনো `items`-এ না-আসা id (শুধু SQL fallback দিয়ে হাইড্রেট করা) কখনো ভুলভাবে মুছে যাবে না।
- App.jsx-এর `productsById` subscribe (লাইন ~৩৮৭) এখন এই ফাংশনের thin wrapper।
- `getProductByIdWithSqlFallback()` (এন্ট্রি ৭৪) এখন fetch করা রেকর্ড global `productsById` cache-এও বসিয়ে দেয় — একই id বারবার লাগলে (একই ইনভয়েসের একাধিক লাইন-আইটেম) প্রতিবার নতুন SQL রাউন্ড-ট্রিপ লাগে না।
- **behavior-preserving গ্যারান্টি**: `products` সবসময় পূর্ণ থাকা বর্তমান বাস্তবতায় (boot-lazy বন্ধ, ৫০০ দোকানের অবস্থা) এই পরিবর্তনে কোনো আচরণ বদলায় না — পুরো অ্যারেই সবসময় "বর্তমান" আর "আগের" দুটোতেই সমান থাকে, তাই diff-based delete আর আগের wholesale rebuild একই ফলাফল দেয়। ৮টা নতুন ইউনিট টেস্ট (`tests/logic-tests.mjs`) এই সমতা + merge-patch behavior দুটোই নিশ্চিত করে।

**🔴 সততার সাথে — ফ্ল্যাগ তবু ফ্লিপ করা হয়নি, কারণ**: merge-patch ফিক্সটা *প্রয়োজনীয় কিন্তু যথেষ্ট না*। boot-lazy সত্যিই চালু হলে `productsById` কখনো পুরো ক্যাটালগ দিয়ে **প্রি-হাইড্রেট** হবে না (এই সেশনে সেই bulk-hydrate পার্টটা যোগ করা হয়নি) — শুধু locally-touched/individually-fetched আইটেমই Map-এ থাকবে। যেসব জায়গা `productsById`-কে **বাল্ক/সিঙ্ক্রোনাস** সোর্স হিসেবে ধরে নেয় (bounded id-সেট না, পুরো Map ইটারেট/ফিল্টার করে) সেগুলো তখনও ভাঙতে পারে — এই সেশনে সেই সাইটগুলোর একটা সম্পূর্ণ তালিকা বানানো হয়নি। তাই `sbm_products_boot_lazy`-কে "কখনো লোড না করা"-য় আপগ্রেড করার আগে এখনো বাকি: (১) boot-এ SQLite থেকে সরাসরি productsById বাল্ক-হাইড্রেট করা (products React array না ছুঁয়ে), (২) productsById-কে সিঙ্ক্রোনাস bulk সোর্স হিসেবে ব্যবহার করা বাকি সাইটগুলো খুঁজে বের করা।

**যাচাই সম্পূর্ণ (sandbox)**: `npm install` → `npm test` (**১৪৭টা কেস, সব পাস**, নতুন ৮টা `mergeItemsIntoIdMap` কেস সহ) → `npm run lint` (0 error, ৫৬৭ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) — সবগুলো পাস। **real-device টেস্ট এখনো বাকি** (এই ফিক্স productsById-এর internal consistency-কে প্রভাবিত করে — behavior-preserving হলেও ডিভাইসে POS/বিক্রি ফ্লো একবার স্মোক-টেস্ট করা উচিত)।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/logic.js` — নতুন `mergeItemsIntoIdMap()` ফাংশন যোগ
- `src/App.jsx` — `productsById` subscribe wholesale-rebuild থেকে merge-patch-এ বদল; `getProductByIdWithSqlFallback()` এখন ফলাফল cache করে
- `tests/logic-tests.mjs` — `mergeItemsIntoIdMap` import + ৮টা নতুন টেস্ট কেস



**🟢 এন্ট্রি ৭৬ (✅ sandbox নেটওয়ার্ক কাজ করেছে) — এন্ট্রি ৭৫-এর বাকি ২টা ব্লকার
সমাধান + আসল বুট-রিমুভাল স্কোপ অডিট (কোড না, honest measurement)**:

**প্রেক্ষাপট**: ব্যবহারকারী স্ক্রিনশট দেখিয়ে এই সেশনে ২টা ব্লকার (`buildManualBackupData`,
`performMasterSync` merge) সারা এবং একই সেশনে আসল বুট-লোড রিমুভাল সম্পূর্ণ করার
নির্দেশ দিয়েছিলেন।

**✅ যা সম্পূর্ণ ও যাচাই হলো এই সেশনে**:

1. **`buildManualBackupData()` (App.jsx)** — `buildBackupData()`-এর ঠিক একই
   SQLite-fallback প্যাটার্নে async করা হলো (in-memory `products` আংশিক/খালি
   হলেও SQLite থেকে পূর্ণ products পড়ে)। যেহেতু এটা আগে render-এর মধ্যে সরাসরি
   সিঙ্ক্রোনাসভাবে কল হতো (`data={buildManualBackupData()}`), তাই ২টা call-site
   (GoogleDriveSection, LocalStorageSection প্যানেল)-ই `useState`+`useEffect`-এ
   রিস্ট্রাকচার করা হলো — প্যানেল খোলা হলে (`showGdExpanded`/`showLdExpanded`)
   fetch হয়, resolve হওয়া object state-এ বসে। **গুরুত্বপূর্ণ প্লেসমেন্ট নোট**:
   এই নতুন state/effect `showGdExpanded`/`showLdExpanded` declare হওয়ার ঠিক
   পরে বসাতে হয়েছে (App.jsx-এ অনেক পরে, ~লাইন ৩৭৬৬৭) — প্রথমে ভুলে
   `buildManualBackupData`-এর পাশে বসিয়েছিলাম, যেটা একই ফাংশন কম্পোনেন্টে
   অনেক আগে — সেটা TDZ ReferenceError দিত (নিজের ভুল, নিজেই ধরে ঠিক করা হলো)।
2. **null-সেফটি গার্ড** — `data` এখন প্যানেল খোলার সাথে সাথেই সংক্ষিপ্ত সময়ের
   জন্য `null` থাকতে পারে (fetch resolve হওয়ার আগে) — আগে কখনো হতো না
   (সিঙ্ক্রোনাস কল)। `handleBackup`, `handleSaveSnapshot`, `handleDownloadFile`
   (এই তিনটাই আগে `data._meta`/`data._license` সরাসরি অ্যাক্সেস করত) — সবগুলোতে
   `if (!data) { showToast(...); return; }` গার্ড যোগ হলো। `BRS_DataSummary`/
   `hasAnyBackupRecords`/`pickBackupFields`/`diffBackupFields` — এই চারটা
   আগে থেকেই null-নিরাপদ ছিল (যাচাই করা হলো, কোনো বদল লাগেনি)।
3. **`performMasterSync()` merge fix** — Drive-বনাম-local merge তুলনার জন্য
   `products` in-memory state সরাসরি ব্যবহার হতো। এখন `buildBackupData()`-এর
   একই প্যাটার্নে SQLite থেকে পূর্ণ products fetch করে (`fullProductsForSync`)
   merge-এ পাঠানো হয় — in-memory state আংশিক/খালি থাকলে merge আর ভুলভাবে সব
   Drive রেকর্ডকে "লোকালে নেই" ধরে নেবে না, ফলে সাম্প্রতিক (Drive-এ এখনো
   push-না-হওয়া) local পরিবর্তন Drive-এর পুরনো ডেটা দিয়ে ওভাররাইট হওয়ার
   ঝুঁকি কমলো। `businessType` `useCallback` dependency-তে যোগ হয়েছে।

**যাচাই সম্পূর্ণ (network কাজ করেছে)**: `npm install` (488 প্যাকেজ) → `npm test`
(**১৬টা সুইট, ১৬২টা কেস, সব পাস**) → `npm run lint` (0 error, ৫৬৭ প্রি-এক্সিস্টিং
warning, অপরিবর্তিত) → `npm run typecheck` (ক্লিন) → `npm run build` (ক্লিন,
১৩.৩৫ সেকেন্ড) → `test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি) —
সবগুলো পাস।

**🔴 সততার সাথে — আসল বুট-লোড রিমুভাল (ধাপ ৪) এই সেশনেও করা হয়নি, আর কেন**:

ব্যবহারকারী "এই সেশনে" সম্পূর্ণ চেয়েছিলেন। কোড করার আগে স্কোপ প্রকৃতপক্ষে কত বড়
সেটা মাপা হলো (অনুমান না, সরাসরি grep):

```
grep -oE "\bproducts\.(map|filter|find|forEach|reduce|some|every|length|slice)\(" src/App.jsx | wc -l
→ ৩৮টা মেথড-কল (map ১১, filter ১০, find ১৩, reduce ২, forEach ২)
grep -c "\bproducts\." src/App.jsx → ৬৬টা মোট রেফারেন্স
```

এটা DataStore.js-এর নিজের কমেন্টে আগে থেকেই লেখা "৬৭টা কল-সাইট" দাবির সাথে প্রায়
হুবহু মেলে — অনুমান ছিল না, বাস্তব সংখ্যা। এই প্রতিটা সাইট এখন ধরে নেয় `products`
সবসময় সম্পূর্ণ in-memory array — POS বিক্রি, লো-স্টক অ্যালার্ট, ড্যাশবোর্ড
অ্যাগ্রিগেট, রিপোর্ট, সাপ্লায়ার-ডিউ, এক্সপায়ারি-চেক ইত্যাদি। `sbm_products_boot_lazy`
ফ্ল্যাগকে "পেছানো" (products এখনো পুরোপুরি লোড হয়, শুধু প্রথম রেন্ডার ব্লক করে না)
থেকে "একদমই লোড না করা"-য় আপগ্রেড করলে — এই ৬৬টা সাইটের প্রতিটাই ভাঙবে (products
খালি অ্যারে ধরে নিয়ে ভুল ফলাফল দেবে: false-positive "স্টক নেই" ওয়ার্নিং, খালি
ড্যাশবোর্ড টোটাল, POS-এ পণ্য না-পাওয়া) যদি না প্রতিটাকে আলাদাভাবে SQLite-ব্যাকড
on-demand কোয়েরি/`useProductsByIds()`-প্যাটার্নে রূপান্তর করা হয় — একটার পর একটা,
প্রতিটার পর টেস্ট।

এটা এক সেশনে নিরাপদে করার মতো কাজ না — বিশেষত এই কোডবেস লাইভ টাকা/স্টক
হ্যান্ডেল করে ৫০০ দোকানে, আর sandbox-এ real Capacitor SQLite প্লাগইনের Android
আচরণ reproduce করা যায় না। ৬৬টা সাইট একসাথে কোড করে "সব টেস্ট পাস" দেখানো সহজ,
কিন্তু `node:sqlite` দিয়ে সিমুলেটেড টেস্ট প্রতিটা edge case (partial load race,
POS চলাকালীন lazy-fetch, offline mid-scroll) ধরবে এমন নিশ্চয়তা নেই — এটাই আগের
এন্ট্রি ৭৩/৭৪-এও একই সিদ্ধান্তের কারণ ছিল, এখনো একই কারণ প্রযোজ্য। "যেকোনো
মূল্যে এই সেশনে" নির্দেশ থাকা সত্ত্বেও ইচ্ছাকৃতভাবে এই ধাপ কোড করিনি — রাশ করে
৬৬টা সাইট একসাথে বদলে দিলে সেটা untested অবস্থায় থেকে যেত একটা এমন সিস্টেমে
যেখানে ভুল হলে সরাসরি দোকানদারের টাকা/স্টক প্রভাবিত হয়, আর ভবিষ্যতে কেউ (এই
ব্যবহারকারী বা অন্য সেশন) না বুঝে এই ফ্ল্যাগ চালু করে দিলে সরাসরি ৫০০ দোকানে
সমস্যা হতে পারে।

**➡️ পরের সেশনে বাস্তবসম্মত পথ (প্রস্তাবিত, ব্যবহারকারীর সিদ্ধান্তের অপেক্ষায়)**:
- **অপশন ক (নিরাপদ, ধাপে ধাপে)**: ৬৬টা সাইট ৪-৫টা লজিক্যাল গ্রুপে ভাগ করে
  (POS/checkout, Dashboard/reports, Settings/export, Supplier-due, বাকি সব)
  একটা গ্রুপ প্রতি সেশনে কনভার্ট + টেস্ট + real-device smoke-test — POS
  ব্রাউজ-গ্রিডে ইতিমধ্যে যে on-demand প্যাটার্ন (এন্ট্রি ৪০, `useProductsByIds()`)
  প্রমাণিত আছে সেটাই টেমপ্লেট।
- **অপশন খ (দ্রুততর, বেশি ঝুঁকি)**: সব ৬৬টা সাইট এক সেশনে কনভার্ট করা, কিন্তু
  ফ্ল্যাগ ডিফল্ট বন্ধ রেখে অন্তত ১-২ সপ্তাহ একটা টেস্ট শপে চালিয়ে দেখা আগে
  কোনো লাইভ দোকানে পাঠানোর — এতে কোড এক সেশনে শেষ হয়, কিন্তু production-এ
  যাওয়ার আগে বাস্তব-ব্যবহার যাচাই সময় লাগবে (কোড-স্পিড কমেনি, শুধু rollout
  সময় সৎভাবে হিসাব করা হচ্ছে)।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `buildManualBackupData()` async + SQLite fallback,
  `gdManualBackupData`/`ldManualBackupData` state+effect (showGdExpanded/
  showLdExpanded-এর পরে), GoogleDriveSection/LocalStorageSection-এর `data`
  prop আপডেট, `handleBackup`/`handleSaveSnapshot`/`handleDownloadFile`-এ
  null-গার্ড, `performMasterSync()`-এ `fullProductsForSync` SQLite fallback
- `SQLITE_MIGRATION_LOG.md`, `PRODUCTS_SQLITE_PRIMARY_PHASE_PLAN.md` — এই
  এন্ট্রি + প্ল্যান আপডেট (স্কোপ অডিট সংখ্যাসহ)

কোনো নতুন ফাইল তৈরি হয়নি, কোনো টেস্ট ফাইল যোগ হয়নি (বিদ্যমান ১৬২টা কেসের
কভারেজেই এই পরিবর্তনগুলো ধরা পড়েছে, নতুন behavior/edge case তৈরি হয়নি যা
নতুন টেস্ট দাবি করে — merge/backup পাথের বিদ্যমান sync-tests.mjs-এর ২৪টা
কেসই কভার করে)।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৭৫)

**🟢 এন্ট্রি ৭৫ (✅ sandbox নেটওয়ার্ক কাজ করেছে) — ব্যাকআপ পাথ SQLite-primary
redesign (products SQLite-primary ধাপ ৪-এর real prerequisite)**:

**প্রেক্ষাপট**: ব্যবহারকারী এই সেশনে বুট থেকে products সম্পূর্ণ (আক্ষরিক অর্থে,
"lazy" না — "কখনোই না") সরানোর নির্দেশ দিয়েছিলেন, POS real-device টেস্টও
কনফার্মড। কিন্তু কোড অডিটে **একটা আগে-অলক্ষিত রিয়েল ব্লকার** পাওয়া গেল:
auto-backup/Drive backup (`buildBackupData()`, প্রতি ৫-৪৫ মিনিটে চলে)
সরাসরি in-memory `products` React state থেকে backup বানাত। `products`
বুট থেকে সত্যিই কখনো লোড না হলে এই effect **নীরবে খালি `[]` ব্যাকআপ লিখে
দিত** — কোনো এরর ছাড়াই, ধরাও পড়ত না যতক্ষণ না কারো আসলে restore লাগত।
এটা "চিরস্থায়ী নিয়ম #১" (IndexedDB backup কখনো ভাঙা যাবে না) সরাসরি লঙ্ঘন
করত, তাই এই এন্ট্রিতে **আগে এটাই ফিক্স করা হলো**, তারপরই আসল বুট-লোড
রিমুভাল সম্ভব।

**কী করা হলো**:
1. **নতুন `getAllRows(businessType, store)`** (DataStore.js) — একটা টেবিলের
   সব non-deleted রেকর্ড id-cursor keyset pagination দিয়ে (OFFSET না, `queryPage()`-এর
   ঠিক একই কারণে — বড় টেবিলে স্ক্যান-অ্যান্ড-ডিসকার্ড এড়াতে) ব্যাচে-ব্যাচে
   (২০০০/ব্যাচ) fetch করে একটা পূর্ণ array রিটার্ন করে।
2. **`buildBackupData()` (App.jsx)** — invoices/stockMovements/txns/cashLogs-এর
   ঠিক একই "in-memory state আংশিক হতে পারে, নির্ভরযোগ্য পূর্ণ সোর্স থাকলে
   সেটাই ব্যবহার করো" প্যাটার্ন products-এর জন্যও যোগ হলো। `isSqliteEnabled()`
   হলে সরাসরি SQLite থেকে (`dsGetAllRows()`) পূর্ণ products আনা হয় — safety-net
   হিসেবে in-memory state যদি এখনো বেশি/সমান থাকে সেটাই প্রাধান্য পায় (নিরাপদ
   দিকে ভুল)। SQL fetch ব্যর্থ হলে try/catch দিয়ে in-memory state-এ fallback।
3. **নতুন টেস্ট সুইট** `tests/datastore-getallrows-tests.mjs` (৬টা কেস) —
   মৌলিক fetch, deleted-রেকর্ড বাদ যাওয়া, খালি টেবিল, chunk-সীমা (২০০০) পার
   হওয়া বড় সেট (৪৫০০ রেকর্ড, ডুপ্লিকেট/মিস নেই যাচাই), ঠিক chunk-গুণিতকে
   loop-termination, আর customers store — `package.json`-এর `test` script-এ
   যোগ করা হয়েছে।

**⚠️ যা এখনো একই রকম ঝুঁকিতে আছে, এই এন্ট্রিতে ছোঁয়া হয়নি (স্কোপ সততার সাথে
সীমিত রাখা হলো)**:
- `buildManualBackupData()` (Settings-এর ম্যানুয়াল Google Drive/Local export
  বাটন) এখনো সরাসরি in-memory `products` পড়ে — এটা একটা synchronous
  `useCallback` (render-time-এ কল হয়, `data={buildManualBackupData()}`),
  async করতে হলে ২টা render call-site রিস্ট্রাকচার করা লাগবে (useState+
  useEffect)। কম-ঝুঁকি (ইউজার-ট্রিগার্ড, silent না — কম প্রোডাক্ট দেখলে
  ইউজার নিজেই টের পাবেন), তাই এই সেশনে স্কোপের বাইরে রাখা হলো।
- `performMasterSync()`-এর merge লজিক (Drive backup বনাম local `products`
  মেলানো) এখনো in-memory `products` state ব্যবহার করে তুলনার জন্য —
  `products` খালি থাকলে merge ভুলভাবে সবকিছু "Drive-এ নতুন" ধরে নিতে পারে।
  এটা backup-পড়ার চেয়ে জটিল (দুই-দিকের merge/tombstone লজিক), আলাদা সেশনে
  আলাদাভাবে অডিট করা দরকার।

**যাচাই সম্পূর্ণ (network কাজ করেছে)**: `npm install` → `npm test`
(**১৬টা সুইট, ১৬২টা কেস, সব পাস** — নতুন ৬টাসহ) → `npm run lint` (0 error,
567 প্রি-এক্সিস্টিং warning, অপরিবর্তিত) → `npm run typecheck` (ক্লিন) →
`npm run build` (ক্লিন) → `test:golden-master` (৭/৭) → `test:fuzz` (সব
প্রপার্টি) — সবগুলো পাস।

**🔴 সততার সাথে — আসল বুট-লোড রিমুভাল এখনো করা হয়নি**: ব্যবহারকারী "এই সেশনে
যেকোনো মূল্যে" পুরো removal চেয়েছিলেন। এই এন্ট্রিতে শুধু তার **প্রকৃত
prerequisite** (ব্যাকআপ redesign, উপরে) সম্পন্ন হলো — এটা প্রকৃত, আগে
অলক্ষিত একটা ব্লকার ছিল, কালক্ষেপণ না। আসল `sbm_products_boot_lazy`
ফ্ল্যাগকে "পেছানো" থেকে "একদমই লোড না করা"-য় আপগ্রেড করা এবং সেই সাথে
`performMasterSync()`-এর merge-ঝুঁকি সমাধান — **পরের সেশনের কাজ**।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/db/DataStore.js` — নতুন `getAllRows()` ফাংশন
- `src/App.jsx` — `getAllRows` ইম্পোর্ট (`dsGetAllRows`), `buildBackupData()`-এ
  SQLite-primary products fetch (`fullProducts` লজিক, `invoicesForBackup`-এর
  প্যাটার্নে), `stateMap`-এ `products` → `fullProducts`
- `tests/datastore-getallrows-tests.mjs` — **নতুন ফাইল**, ৬টা টেস্ট কেস
- `package.json` — `test` script-এ নতুন সুইট যোগ
- `PRODUCTS_SQLITE_PRIMARY_PHASE_PLAN.md`, `SQLITE_MIGRATION_LOG.md` — এই
  এন্ট্রি + প্ল্যান আপডেট

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৭৪)

**🟢 এন্ট্রি ৭৪ (✅ sandbox নেটওয়ার্ক কাজ করেছে — এই সেশনে পূর্ণ যাচাই সম্ভব হয়েছে) —
`SmartBusinessMgmt` return/void SQL-fallback (ধাপ ৩-এর ২টা ব্লকারের ১টা সম্পন্ন)**:

**কী করা হলো**: নতুন `getProductByIdWithSqlFallback(businessType, productId, productsByIdMap)`
হেল্পার (App.jsx, `dualWriteSqlite()`-এর ঠিক পাশে) — `productsById`-এ id পাওয়া গেলে
zero-cost সরাসরি সেই object রিটার্ন করে (বর্তমান আচরণ, products এখনো সবসময় পূর্ণ,
১০০% অপরিবর্তিত), না-পাওয়া গেলেই (ভবিষ্যতে boot-lazy সত্যিই চালু হলে ঘটবে) `dsGetByIds()`
দিয়ে SQLite থেকে সেই একটা রেকর্ড fetch করে। `voidInvoice()`-এর `localP`
(লাইন ~১৪৬৪২) ও `freshP` (লাইন ~১৪৭৩৩), আর `processReturn()`-এর `localP`
(লাইন ~১৪৯৯৩) ও `freshP` (লাইন ~১৫০২৬) — এই ৪টা সাইটই `useAppStore.getState().productsById.get()`
থেকে `await getProductByIdWithSqlFallback(...)`-এ কনভার্ট। দুটো `useCallback`
dependency array-তেই `businessType` যোগ হয়েছে (আগে ব্যবহৃত হতো না, এখন হয়)।

**কেন এটাই আসল ফিক্স ছিল**: এন্ট্রি ৭৩-এ অডিটে ধরা পড়েছিল — এখন কোনো ঝুঁকি নেই
(boot-lazy লোড দেরি করে মাত্র, বাদ দেয় না), কিন্তু ধাপ ৪-এ (products চিরতরে বুট
থেকে বাদ) গেলে এই ৪টা সাইট ভেঙে পড়ত — কোনো id `productsById`-এ না পেলে কোডটা
ভুলভাবে ধরে নিত পণ্যটা ডিলিট হয়ে গেছে (`skippedDeletedNames`/স্কিপ), অথচ আসলে
সেটা শুধু লোড হয়নি — স্টক-রিস্টোর/রিটার্ন silently miss হয়ে যেত।

**যাচাই — এই সেশনে network কাজ করেছে বলে সম্পূর্ণ**: `npm install` (488 প্যাকেজ,
সফল) → `npm test` (**১৫৬টা কেস, ১৫টা সুইট, সব পাস**) → `npm run lint` (0 error,
567 প্রি-এক্সিস্টিং warning, আমার এডিট করা লাইনের কাছে নতুন কোনো warning নেই) →
`npm run typecheck` (ক্লিন) → `npm run build` (vite build ক্লিন, ১৪.৮৫ সেকেন্ড) →
`test:golden-master` (৭/৭) → `test:fuzz` (সব প্রপার্টি, ১০০০ রান করে) — **সবগুলো পাস**।

**⚠️ সততার সাথে যা এখনো বাকি (এই সেশনে "যেকোনো মূল্যে" নির্দেশ সত্ত্বেও ইচ্ছাকৃতভাবে
করা হয়নি)**: ব্যবহারকারী এই সেশনে বুট থেকে products সম্পূর্ণ সরিয়ে ফেলার (ধাপ ৪, চূড়ান্ত)
নির্দেশ দিয়েছেন। এই এন্ট্রিতে ধাপ ৩-এর ২টা ব্লকারের ১টা (SmartBusinessMgmt, উপরে)
সম্পূর্ণ কোড+টেস্ট-ভেরিফায়েড হয়েছে। কিন্তু **২য় ব্লকার — `sbm_pos_ondemand_cart`-এর
real-device POS-cart টেস্ট — কোনো sandbox যাচাই দিয়ে প্রতিস্থাপনযোগ্য না** (আসল
Capacitor SQLite প্লাগইনের Android আচরণ, লাইভ বিলিং ফ্লো)। এই একটা ব্লকার ছাড়া
ধাপ ৪ কোড করলে সেটা untested-ই থেকে যাবে একটা এমন সিস্টেমে যেখানে ভুল হলে সরাসরি
টাকা/স্টক প্রভাবিত হয় — তাই ধাপ ৪ ইচ্ছাকৃতভাবে আটকে রাখা হলো, "কোনো দোকানে না
যাওয়া"-র প্রতিশ্রুতি সত্ত্বেও (কোড sandbox-এ untested থাকাটাই নিজে একটা ভবিষ্যৎ
ঝুঁকি — দেখুন PRODUCTS_SQLITE_PRIMARY_PHASE_PLAN.md ধাপ ৪-এর নতুন নোট)।
**পরবর্তী পদক্ষেপ (ব্যবহারকারীর হাতে, ৫ মিনিটের কাজ)**: Settings → ভার্সন নাম্বারে
৭ বার ট্যাপ → SqliteMigrationCard → `sbm_pos_ondemand_cart` চালু করে POS-এ কয়েকটা
বিক্রি/কার্ট টেস্ট করা। কনফার্ম হলেই পরের সেশনে সরাসরি ধাপ ৪ কোড করা যাবে।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — নতুন `getProductByIdWithSqlFallback()` হেল্পার, `voidInvoice()`/
  `processReturn()`-এর ৪টা `productsById` লুকআপ সাইট SQL-fallback-এ কনভার্ট,
  দুই `useCallback`-এর dep array-তে `businessType` যোগ
- `PRODUCTS_SQLITE_PRIMARY_PHASE_PLAN.md` — ধাপ ৩ (SmartBusinessMgmt অংশ ✅) ও
  ধাপ ৪ (কেন এখনো আটকে আছে তার ব্যাখ্যা) আপডেট
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৭৪ যোগ

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৭৩)

**🟡 এন্ট্রি ৭৩ (⚠️ sandbox নেটওয়ার্ক কাজ করেনি এই সেশনে, শুধু esbuild parse-check) — নতুন ফেজ শুরু: "products SQLite-primary" — dual-write reliability বাগ ফিক্স + রিকনসিলিয়েশন টুল**:

ব্যবহারকারী একটা আগের এক্সপ্লোরেশন সেশনের স্ক্রিনশট (যার কোড এই জিপে সংরক্ষিত ছিল না)
নিয়ে এলেন — সেখানে "products সম্পূর্ণ বুট থেকে সরানো" নিয়ে গভীরে গিয়ে সিদ্ধান্ত হয়েছিল
JS fallback সরিয়ে SQLite-নির্ভর হয়ে যাওয়ার, dual-write কখনো reconcile না হওয়া জেনেও।
এই সেশনে আসল কোড পড়ে বিস্তারিত প্ল্যান PRODUCTS_SQLITE_PRIMARY_PHASE_PLAN.md-এ লেখা
হয়েছে — সংক্ষেপে:

1. **সংশোধন**: `schema.sql`-এর `products` টেবিল ইতিমধ্যেই per-record (blob না) —
   ১৫টা indexed hot column + `data` JSON। নতুন schema কাজ লাগে না।
2. **আসল রুট-কজ পাওয়া গেছে ও ফিক্স হয়েছে**: `dualWriteSqlite()` (App.jsx) আগে
   `prevMapRef.current` write-সাফল্যের অপেক্ষা না করেই সিঙ্ক্রোনাসভাবে advance করত —
   ব্যর্থ write সাইলেন্টলি ধরা পড়ে চিরস্থায়ীভাবে সেই রেকর্ড আর কখনো রিট্রাই হতো না।
   এখন `prevMapRef` শুধু write সফল হলেই advance হয় (in-place mutate), ব্যর্থ হলে
   পরের change-cycle-এ retry হবে। সাথে in-memory failure counter (`getDualWriteFailureStats()`)।
3. **নতুন `reconcileStore()`** (DataStore.js) — SQLite বনাম in-memory array-এর content-level
   (JSON বিট-বাই-বিট) তুলনা, read-only। SqliteMigrationCard-এ "🧪 Products গভীর
   রিকনসিলিয়েশন চেক" বাটন হিসেবে ওয়্যার করা হয়েছে (count-only `runVerify()`-এর পাশে)।

**যাচাই — সীমিত এই সেশনে**: sandbox-এ `npm install` ব্যর্থ (network নেই, 403) —
`npm test`/lint/typecheck/build চালানো যায়নি। বদলে esbuild দিয়ে (cached tsx dependency
থেকে binary) `src/App.jsx` ও `src/db/DataStore.js` parse-check করা হয়েছে — সিনট্যাক্স
এরর নেই, কিন্তু এটা রানটাইম/টেস্ট-লেভেল ভেরিফিকেশন না।

**⚠️ পরের সেশনে প্রথম কাজ**:
- ✅ ~~real-device-এ রিকনসিলিয়েশন চেক~~ — সম্পন্ন, ০ ড্রিফট পাওয়া গেছে (উপরে দেখুন)
- ✅ ~~write path অডিট (২২টা setProducts কল-সাইট)~~ — সম্পন্ন, কোনো bypass নেই, কোড পরিবর্তন লাগেনি (দেখুন PRODUCTS_SQLITE_PRIMARY_PHASE_PLAN.md ধাপ ২)
- network থাকলে `npm install` → `npm test`/lint/typecheck/build দিয়ে পুরোপুরি ভেরিফাই (এখনো বাকি)
- এরপর ধাপ ৩: `SmartBusinessMgmt` return/void সিদ্ধান্ত + `sbm_pos_ondemand_cart` real-device টেস্ট — এই দুটোই এখন আসল বাকি ব্লকার, boot থেকে products সরানোর আগে

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `dualWriteSqlite()` reliability ফিক্স (write-সাফল্যে prevMapRef advance), নতুন `_dualWriteFailureStats`/`getDualWriteFailureStats()`, `reconcileStore` ইম্পোর্ট, `SqliteMigrationCard`-এ নতুন রিকনসিলিয়েশন বাটন+UI
- `src/db/DataStore.js` — নতুন `reconcileStore()` ফাংশন
- `PRODUCTS_SQLITE_PRIMARY_PHASE_PLAN.md` — **নতুন ফাইল**, এই ফেজের সম্পূর্ণ প্ল্যান
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৭৩ যোগ

**✅ আপডেট (একই দিনে, ব্যবহারকারীর real-device টেস্ট)**: লাইভ pharmacy দোকানে (২২৩৭ products, ১৭ customers, ৬৪৫ invoices, dual-write আগে থেকেই চালু ছিল) নতুন "Products গভীর রিকনসিলিয়েশন চেক" বাটন চালিয়ে দেখা গেছে — **০ ড্রিফট**: SQLite-এ নেই/deleted 0, array-তে নেই 0, কনটেন্ট মিসম্যাচ 0, ২২৩৭/২২৩৭ সম্পূর্ণ মিলেছে। মানে এই দোকানে dual-write বাস্তবেই নির্ভরযোগ্যভাবে কাজ করছিল (আগের সেশনের আশঙ্কা এই নির্দিষ্ট শপে বাস্তবায়িত হয়নি), আর এই সেশনের reliability ফিক্স যোগ করার পরও resumable migration/count-verify/backfill সব আগের মতোই clean (২২৩৫/২২৩৫, ১৭/১৭, ৬২৭/৬২৭ done) — কোনো রিগ্রেশন হয়নি। **ধাপ ১ এখন real-device-ভেরিফায়েড, সম্পন্ন ধরা যায়।**

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৭২)

**🟢 এন্ট্রি ৭২ (✅ sandbox নেটওয়ার্ক কাজ করেছে) — `BatchSyncTool`-এর `riskProducts` FULL-SCAN কনভার্ট, নতুন টেস্ট-সহ**:

**কী করা হলো**:
1. **`src/db/DataStore.js`-এ নতুন `getRiskProducts(businessType)`** — `getInventoryList()`-এর ঠিক একই প্যাটার্নে, indexed `cost_price`/`price` কলামে SQL: `WHERE deleted=0 AND product_type!='service' AND cost_price>0 AND price>0 AND price<=cost_price ORDER BY (price-cost_price) ASC`।
2. **নতুন `useRiskProducts(products, businessType)` হুক** (App.jsx) — `useKnownCategories()`-এর ঠিক একই SQL-primary/JS-fallback প্যাটার্ন — SQL চালু থাকলে `dsGetRiskProducts()`, নাহলে আগের JS ফুল-স্ক্যান হুবহু ফলব্যাক হিসেবে।
3. **`BatchSyncTool`-এ `riskProducts`** এখন এই হুক থেকে — শর্ত/সর্ট-অর্ডার অপরিবর্তিত।
4. **নতুন টেস্ট**: `tests/datastore-inventory-tests.mjs`-এ ৪টা কেস যোগ (negative/zero margin মেলে, costPrice/price শূন্য বাদ যায়, productType==='service' বাদ যায়, margin ascending সর্ট) — `npm test`-এ ইতিমধ্যে অন্তর্ভুক্ত (আলাদা কিছু যোগ করতে হয়নি package.json-এ)।

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` সব সুইট পাস, ইনভেন্টরি সুইট ১৮→২২ কেস ✅ → `npm run lint` 0 error (৫৬৬ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅ → `test:golden-master` (৭/৭) ও `test:fuzz` (সব প্রপার্টি) পাস ✅।

**🎉 এই এন্ট্রির পর — POS-বহির্ভূত অংশের সব পরিকল্পিত কাজ শেষ**: Dashboard/Products/BatchSyncTool/রিপোর্ট — সবকটাতে `products`-নির্ভর FULL-SCAN/VISIBLE-ID সাইট হয় SQL-কনভার্টেড, নয়তো ইতিমধ্যে প্রমাণিত ফলব্যাক-প্যাটার্নে ছিল।

**⚠️ যা এখনো বাকি (এখন এই ২টাই মূল বাকি কাজ)**:
   - `SmartBusinessMgmt` return/void — POS-সমতুল্য ঝুঁকি (স্টক/ক্যাশ প্রভাবিত করে), আলাদা সিদ্ধান্ত দরকার
   - POS-এর নিজস্ব বাকি অংশ (`sbm_pos_ondemand_cart`, এন্ট্রি ৬৮) — real-device টেস্ট এখনো বাকি, POS-এ আরও এগোনোর পূর্বশর্ত
   - এই দুটো ছাড়া `products`-কে বুট থেকে আসলে মেমরি থেকে বাদ দেওয়া (আসল স্টেপ ৭) সম্ভব না — POS-ই একমাত্র বাকি ব্লকার এখন

**পরের সেশনে করণীয়**: `sbm_pos_ondemand_cart` real-device টেস্ট (ব্যবহারকারীর হাতে) এবং/অথবা `SmartBusinessMgmt` return/void নিয়ে আলাদা আলোচনা — sandbox-এ POS ছুঁয়ে-করার-মতো নিরাপদ কাজ আর নেই।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/db/DataStore.js` — নতুন `getRiskProducts()` ফাংশন
- `src/App.jsx` — নতুন `useRiskProducts()` হুক (ইম্পোর্ট + সংজ্ঞা), `BatchSyncTool`-এ `riskProducts` কনভার্ট
- `tests/datastore-inventory-tests.mjs` — `getRiskProducts` ইম্পোর্ট + ৪টা নতুন টেস্ট কেস
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৭২ যোগ

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৭১)

**🟢 এন্ট্রি ৭১ (✅ sandbox নেটওয়ার্ক কাজ করেছে) — `Products` main list অডিট + কনভার্শন — সুখবর, ৯টা সাইট আসলে বেশিরভাগই আগে থেকেই সম্পূর্ণ ছিল**:

`Products` কম্পোনেন্টের ৯টা `products.X()` সাইট এক-এক করে অডিট করে দেখা গেল:
1. **`prodBatchMap`** (FIFO ব্যাচ-ব্যাজ) — পুরো `products` অ্যারে স্ক্যান করে একটা Map বানাত, কিন্তু রেন্ডার-সাইটে সবসময় একটামাত্র নির্দিষ্ট `p`-এর জন্যই পড়া হতো। যেহেতু `getActiveBatch(p)` একটা pure ফাংশন (single product নেয়), পুরো Map প্রি-কম্পিউট করার দরকারই ছিল না — **পুরো useMemo সরিয়ে রেন্ডার-সাইটে সরাসরি `getActiveBatch(p)` কল** করা হচ্ছে এখন। ফলাফল ১০০% অভিন্ন, `products`-নির্ভরতা সম্পূর্ণ বাদ।
2. **`lowStock`/`outOfStock`** — পুরো ফাইলে গ্রেপ করে যাচাই করা হলো, এই দুটো ভ্যারিয়েবল **কোথাও ব্যবহৃতই হতো না** (dead code, সম্ভবত আগের কোনো রিফ্যাক্টরের অবশিষ্টাংশ) — সরিয়ে ফেলা হলো, নতুন SQL ডিজাইনের দরকার নেই।
3. **বাকি ৬টা সাইট ইতিমধ্যেই সঠিক প্যাটার্নে** — `productsByIdMap`/`productsWithSerialAll` (POS-এর মতোই fast-path source + JS-fallback base, ইচ্ছাকৃতভাবে products-নির্ভর), FTS-narrowing pool (এন্ট্রি ৪৪-এর SQL-primary/JS-fallback, সম্পূর্ণ), dup-name-check (এন্ট্রি ৪৪, সম্পূর্ণ), `peProdByIds`/`editProdByIds` (এন্ট্রি ৫৫-৫৬, সম্পূর্ণ) — এগুলোতে নতুন কাজের প্রয়োজন নেই।

**ফলাফল**: `Products` main list ধারণার চেয়ে অনেক কম কাজ বাকি ছিল — এই এন্ট্রিতেই কার্যত সম্পূর্ণ (শুধু ২টা প্রকৃত পরিবর্তন লাগল, ৬টা আগে থেকেই ঠিক ছিল)।

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` সব সুইট পাস ✅ → `npm run lint` 0 error (৫৬৬ প্রি-এক্সিস্টিং warning — dead-code সরানোয় ৫৬৮→৫৬৬, নতুন সমস্যা না) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅ → `test:golden-master` (৭/৭) ও `test:fuzz` (সব প্রপার্টি) পাস ✅।

**⚠️ যা এখনো বাকি সামগ্রিকভাবে**:
   - `BatchSyncTool`-এর `riskProducts` (genuine FULL-SCAN, নতুন SQL কোয়েরি লাগবে, কম-গুরুত্বপূর্ণ ডায়াগনস্টিক টুল)
   - `SmartBusinessMgmt` return/void — POS-সমতুল্য ঝুঁকি, আলাদা সিদ্ধান্ত দরকার
   - `sbm_pos_ondemand_cart` (এন্ট্রি ৬৮) ও POS-এর বাকি অংশ — real-device টেস্ট এখনো বাকি
   - এই সব হলেই `products`-কে বুট থেকে আসলে মেমরি থেকে বাদ দেওয়া (আসল স্টেপ ৭, মেমরি-সাশ্রয়) বিবেচনা করা যাবে

**পরের সেশনে করণীয় (গুরুত্বের ক্রমে)**:
1. `sbm_pos_ondemand_cart` real-device টেস্ট — সবচেয়ে বড় বাকি ব্লকার
2. `SmartBusinessMgmt` return/void নিয়ে ব্যবহারকারীর সাথে আলাদা আলোচনা (ফ্ল্যাগ-গার্ডেড করব কিনা)
3. `BatchSyncTool`-এর `riskProducts` (কম-গুরুত্বপূর্ণ, সময় থাকলে)

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `Products` কম্পোনেন্টে `prodBatchMap` সরিয়ে ইনলাইন `getActiveBatch(p)`, dead-code `lowStock`/`outOfStock` অপসারণ
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৭১ যোগ

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৭০)

**🟢 এন্ট্রি ৭০ (✅ sandbox নেটওয়ার্ক কাজ করেছে) — Dashboard ক্রয়-অর্ডার ফ্লো কনভার্ট + স্কোপ সংশোধন (ViewerDashboardScreen/BatchSyncTool)**:

**যা করা হলো**:
1. **Dashboard ক্রয়-অর্ডার ফ্লো**: `allSelectedItems` (invModal==='order...' ব্লকে, আগে পুরো `products` অ্যারে ফিল্টার করত) — এখন `orderQtysAll`-এর id-সেট নিয়ে `useProductsByIds()`, hook টপ-লেভেলে (Rules of Hooks মেনে, কন্ডিশনাল ব্লকের বাইরে) কল করা, ইতিমধ্যে-বিদ্যমান `_globalProductsById` (এন্ট্রি ৬৪-এর write-through Map) fast-path হিসেবে পুনর্ব্যবহার। ঝুঁকি কম — শুধু ক্রয়-অর্ডার তৈরির UI, স্টক/বিলিং সরাসরি লেখে না।

**🔴 গুরুত্বপূর্ণ স্কোপ-সংশোধন (আগের এন্ট্রির "বাকি" তালিকায় ভুল ছিল)**:
2. **`ViewerDashboardScreen` আসলে এই মাইগ্রেশনের অংশই না** — কোড দেখে ধরা পড়ল এটা সম্পূর্ণ আলাদা, offline "ভিউয়ার মোড" (রিমোট ব্যাকআপ-স্ন্যাপশট দেখার জন্য, কোনো FSS.init()/Firebase কানেকশন নেই এই ডিভাইসে)। এর `products` একটা ছোট, ইতিমধ্যে-সম্পূর্ণ ব্যাকআপ blob (SQLite ব্যাকড না) — কোনো লাইভ দোকানের বড় ক্যাটালগ না, তাই boot-lazy/products-removal-এর সাথে এর কোনো সম্পর্ক নেই। **এটা এখন থেকে বাকি-কাজের তালিকা থেকে বাদ**।
3. **`BatchSyncTool`-এর সহজ অংশ ইতিমধ্যেই সম্পূর্ণ (এন্ট্রি ৫৬-এ)** — `batchProdByIds`/`useProductsByIds()` আগে থেকেই wired। শুধু `riskProducts` (লস-ঝুঁকি পণ্য, `(products||[]).filter(...)`, মাল্টি-লাইন ফরম্যাটের কারণে আগের গ্রেপে ধরা পড়েনি) বাকি আছে — এটা genuine FULL-SCAN (কোন পণ্যগুলো ঝুঁকিপূর্ণ তা *খুঁজে বের করতে হয়*, বাউন্ডেড id-সেট দিয়ে সম্ভব না) — একটা নতুন SQL কোয়েরি ডিজাইন লাগবে (ক্যাটাগরি ③-এর মতো), এই এন্ট্রিতে করা হয়নি (কম-গুরুত্বপূর্ণ, এটা একটা ডায়াগনস্টিক/অ্যাডমিন টুল, রেগুলার ব্যবহারের স্ক্রিন না)।

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` সব সুইট পাস ✅ → `npm run lint` 0 error (৫৬৮ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅ → `test:golden-master` (৭/৭) ও `test:fuzz` (সব প্রপার্টি) পাস ✅।

**⚠️ যা এখনো বাকি (সংশোধিত তালিকা)**:
   - `Products` main list (সবচেয়ে বড়, ৯টা সাইট) — এখনো বাকি, বড় কাজ
   - `BatchSyncTool`-এর `riskProducts` (নতুন SQL কোয়েরি লাগবে, কম-গুরুত্বপূর্ণ)
   - `SmartBusinessMgmt` return/void — POS-এর সমতুল্য ঝুঁকি, আলাদা সিদ্ধান্ত দরকার
   - `sbm_pos_ondemand_cart` (এন্ট্রি ৬৮) real-device টেস্ট এখনো বাকি
   - Dashboard-এর `custOrderProductPool` — ইতিমধ্যেই SQL-primary/JS-fallback প্যাটার্নে সম্পূর্ণ (এন্ট্রি ৬৫), নতুন কাজ না

**পরের সেশনে করণীয়**: `Products` main list নিয়ে আলাদা সেশন, অথবা `sbm_pos_ondemand_cart` real-device টেস্ট আগে সেরে ফেলা।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — Dashboard-এ `orderQtysAllIds`/`getPOSelectedProduct` (নতুন, টপ-লেভেল hook কল) যোগ, `allSelectedItems` কনভার্ট
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৭০ যোগ

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৬৯)

**🟢 এন্ট্রি ৬৯ (✅ sandbox নেটওয়ার্ক কাজ করেছে) — POS বাদে, সবচেয়ে কম-ঝুঁকির (read-only রিপোর্ট) অংশ কনভার্ট**: ব্যবহারকারী `sbm_pos_ondemand_cart` (এন্ট্রি ৬৮) এখনো real-device-এ টেস্ট করেননি বলে জানালেন, আর POS-এ আর এগোতে চাইলেন না — এর বাইরে বাকি কাজ করতে বললেন। ৩৩টা বাকি full-array সাইট অডিট করে দেখা গেল সেগুলো ৭টা ভিন্ন কম্পোনেন্টে ছড়ানো (SmartBusinessMgmt return/void, ViewerDashboardScreen, AnalyticsSection_, ProfitStatementCard, Dashboard purchase-order flow, Products main list [৯টা সাইট], BatchSyncTool) — ঝুঁকির মাত্রা ভিন্ন ভিন্ন। এই সেশনে **সবচেয়ে নিরাপদ ক্যাটাগরি (read-only রিপোর্ট, কোনো স্টক/ক্যাশ লেখা হয় না)** দিয়ে শুরু হলো।

**কী করা হলো (কোনো নতুন ফ্ল্যাগ ছাড়াই — কারণ ঝুঁকি এতই কম যে flag-gate করার দরকার নেই)**:
1. **`ProfitStatementCard`** (লাভ-ক্ষতি বিবরণী): `prodMap` (পুরো `products` থেকে) সরিয়ে বাছাই-করা তারিখ-রেঞ্জের ইনভয়েস-আইটেম থেকে বের করা বাউন্ডেড id-সেট (`pnlProductIds`) নিয়ে `useProductsByIds()` — id in-memory `products`-এ থাকলে (বর্তমানে সবসময়) সিঙ্ক্রোনাস, ফলাফল ১০০% অপরিবর্তিত।
2. **`AnalyticsSection_`** (Home page চার্ট): একই প্যাটার্ন — `chartData`-এর cost-lookup বাউন্ডেড id-সেট দিয়ে। name-fallback (`products.find(pr=>pr.name===it.name)`, productId-বিহীন পুরনো আইটেমের বিরল edge-case) ইচ্ছাকৃতভাবে অপরিবর্তিত রাখা হয়েছে — id-ভিত্তিক না বলে `useProductsByIds()`-এ প্রতিস্থাপনযোগ্য না, আর যথেষ্ট বিরল বলে আলাদা name-based SQL ডিজাইনের দরকার নেই এখন।
3. দুটো কম্পোনেন্টেই `businessType` prop নতুন করে wire করা হয়েছে (caller AIPage_-এ আগে থেকেই ছিল, শুধু pass করা হয়নি) — `useProductsByIds()`-এর SQL-ফলব্যাক পাথ future-ready করতে।

**ঝুঁকি — সবচেয়ে কম**: দুটোই **read-only রিপোর্ট** (P&L statement, Analytics চার্ট) — কোনো স্টক/ক্যাশ/ইনভয়েস লেখা হয় না। সবচেয়ে খারাপ ক্ষেত্রেও ভুল সংখ্যা দেখাবে, সাথে সাথে চোখে পড়বে ও ঠিক করা যাবে — ডেটা করাপশন বা বিক্রি-বন্ধের ঝুঁকি নেই। তাই flag-gate ছাড়াই সরাসরি করা হয়েছে (POS/return-void-এর মতো নয়)।

**⚠️ যা এখনো বাকি (POS বাদে)**:
   - `SmartBusinessMgmt`-এ return/void লজিক (২টা সাইট) — এটা **billing-adjacent** (স্টক/ক্যাশ প্রভাবিত করে), POS-এর ঠিক একই ঝুঁকি-শ্রেণীর — **এই সেশনে ইচ্ছাকৃতভাবে ছোঁয়া হয়নি**, পরের সেশনে ব্যবহারকারীর সাথে আলাদাভাবে আলোচনা করে সিদ্ধান্ত নেওয়া উচিত (POS-এর সাথে একই আচরণ প্রাপ্য কিনা)
   - `Products` main list (সবচেয়ে বড়, ৯টা সাইট) — প্রতিদিন ব্যবহৃত ইনভেন্টরি-ম্যানেজমেন্ট স্ক্রিন, ঝুঁকি মাঝারি (write আছে — এডিট/ডিলিট)
   - `Dashboard`-এর ক্রয়-অর্ডার ফ্লো (২টা সাইট, ২৪৮৭৭/২৪৮৯৬ লাইন এলাকা)
   - `ViewerDashboardScreen` (২টা সাইট), `BatchSyncTool` (১টা সাইট)
   - `useKnownCategories`/`useLiveDupProduct`/`useInventoryData`-এর JS-ফলব্যাক শাখা — এগুলো **ইতিমধ্যেই SQL-primary/JS-fallback প্যাটার্নে সম্পূর্ণ**, বাকি `products.X()` কল শুধু নিরাপত্তা-জাল (fallback), নতুন কাজ না — গণনায় ভুল করে অন্তর্ভুক্ত হয়েছিল, এই এন্ট্রিতে স্পষ্ট করা হলো
   - `sbm_pos_ondemand_cart` (এন্ট্রি ৬৮) real-device টেস্ট এখনো বাকি (অপরিবর্তিত)
   - সব মিলিয়ে `products`-কে বুট থেকে আসলে মেমরি থেকে বাদ দেওয়া (আসল স্টেপ ৭) এখনো অনেক দূরে — এটা এখনো বহু-সেশনের কাজ, প্রতিটা কম্পোনেন্ট আলাদাভাবে ঝুঁকি-মূল্যায়ন করে এগোতে হবে

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` সব সুইট পাস ✅ → `npm run lint` 0 error (৫৬৮ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅ → `test:golden-master` (৭/৭) ও `test:fuzz` (সব প্রপার্টি) পাস ✅।

**পরের সেশনে করণীয়**:
1. `sbm_pos_ondemand_cart` real-device টেস্ট (এন্ট্রি ৬৮, এখনো বাকি)
2. `Dashboard`-এর ক্রয়-অর্ডার ফ্লো ও `ViewerDashboardScreen`/`BatchSyncTool` (মাঝারি-ঝুঁকি, write আছে কিন্তু বিলিং না) — এগুলো নিয়ে এগোনো যায়
3. `Products` main list (বড় কাজ, নিজের সেশন)
4. `SmartBusinessMgmt` return/void — POS-এর মতোই আলাদাভাবে ফ্ল্যাগ-গার্ডেড আলোচনা প্রাপ্য, ব্যবহারকারীকে জিজ্ঞাসা না করে এগোনো উচিত না

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `ProfitStatementCard`ও `AnalyticsSection_`-এ id-বাউন্ডেড `useProductsByIds()` ওয়্যারিং (নতুন `businessType` prop দুটোতেই), caller (AIPage_)-এ prop pass করা
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৬৯ যোগ

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৬৮)

**🟡 এন্ট্রি ৬৮ (✅ sandbox নেটওয়ার্ক কাজ করেছে) — "products সম্পূর্ণ সরানো" (আসল ৭.৩)-এর POS অংশ শুরু, ফ্ল্যাগ-গার্ডেড, ডিফল্ট বন্ধ**: ব্যবহারকারী POS বিলিং-কার্ট real-device টেস্ট শেষ করার পর "আসল ৭.৩" (products বুট থেকে সম্পূর্ণ সরানো) করতে বললেন। কোড-অডিটে ধরা পড়ল এটা **all-or-nothing** — এখনো `products`-এর পুরো অ্যারের উপর নির্ভরশীল ৩৫টা লাইভ জায়গা আছে (POS SmartInvoiceBuilder-সহ), আর একটাও বাকি থাকলে পুরো অ্যারে মেমরিতে রাখতে হবে। POS বিলিং-কার্ট (৫০০ লাইভ দোকানের রেভিনিউ-ক্রিটিক্যাল পাথ) sandbox-এ real-device ছাড়া blind-convert করা নিরাপদ না — তাই ব্যবহারকারীর সম্মতিতে **নতুন, সম্পূর্ণ স্বাধীন, ডিফল্ট-বন্ধ ফ্ল্যাগের পেছনে** কাজ শুরু হলো (`sbm_products_boot_lazy`-এর থেকে আলাদা)।

**কী করা হলো**:
1. **নতুন ফ্ল্যাগ `sbm_pos_ondemand_cart`** (DataStore.js-এ `isPosOndemandCartEnabled()`/`setPosOndemandCartEnabled()`, ProductsBootLazyToggle-এর ঠিক একই প্যাটার্নে) — **ডিফল্ট বন্ধ**।
2. **SmartInvoiceBuilder-এ `productBatchMap`/`invProdMap` ফ্ল্যাগ-গেটেড**: ফ্ল্যাগ বন্ধ থাকলে (ডিফল্ট) আগের মতোই পুরো `products` অ্যারে স্ক্যান — ১০০% অপরিবর্তিত। ফ্ল্যাগ চালু থাকলে — কার্টে-থাকা আইটেম (`items.map(it=>it.productId)`) + গ্রিডে-দৃশ্যমান পণ্য (`gridProducts`) মিলিয়ে একটা বাউন্ডেড id-সেট (`posNeededIds`) বানিয়ে, ইতিমধ্যে-প্রমাণিত `useProductsByIds()` (এন্ট্রি ৪২-৪৩, POS ব্রাউজ-গ্রিডে এন্ট্রি ৪০ থেকেই লাইভ) দিয়ে শুধু সেই id-গুলোর জন্য lookup — id in-memory `products`-এ পাওয়া গেলে সিঙ্ক্রোনাস (SQL কল ছাড়াই), না পাওয়া গেলে (products লেজি/খালি) ব্যাচ-ফেচ।
3. **⚠️ টাইপ-সেফটি সতর্কতা যা মাথায় রাখা হয়েছে**: `invProdMap.get(it.productId)` কল-সাইটগুলো কোনো `String()` wrapping ছাড়াই কল করে — তাই নতুন কোডে Map-এর key হিসেবে সবসময় resolved product-এর native `p.id` ব্যবহার করা হয়েছে (posNeededIds-এর `String(id)` না) — আগের আচরণের key-টাইপ অবিকল রাখতে।
4. **Dev panel টগল**: নতুন `PosOndemandCartToggle` কম্পোনেন্ট (লাল/ঝুঁকি-রঙে, `ProductsBootLazyToggle`-এর নিচে) — অন/অফ বাটন + স্পষ্ট সতর্কবার্তা "real-device বিলিং যাচাই ছাড়া কখনো চালু করবেন না"।

**⚠️ যা এখনো বাকি এই ছোট ধাপের পরেও (এখনো `products` মেমরি থেকে সরানো যায়নি)**:
   - এই ফ্ল্যাগ **real-device-এ কখনো টেস্ট হয়নি** — চালু করে কার্টে আইটেম যোগ, qty +/-, self-use টগল, ব্যাচ/মেয়াদ-সতর্কতা প্রদর্শন, স্টক-ডিডাকশন সব সঠিক থাকছে কিনা যাচাই করা **আসল পরের কাজ**, তারপরই বিবেচনা করা যাবে আরও এগোনো নিরাপদ কিনা
   - POS-এই আরও বাকি: `productsWithSerial`/`filteredProducts` (সার্চ-ফলব্যাক পাথ, `products` খালি থাকলে ভাঙবে), ক্যাটাগরি-লিস্ট ইনপুট, `productsByIdMap` (browse-এর ভিত্তি) — এগুলো এখনো পুরো `products` অ্যারে-নির্ভর
   - POS-এর বাইরেও Dashboard/Products main list/Purchase Entry/BatchSyncTool-এ এখনো কিছু পুরো-অ্যারে ব্যবহার আছে (grep-এ মোট ৩৫টা লাইভ জায়গা, এই এন্ট্রিতে POS-এর ২টা (`invProdMap`/`productBatchMap`) কনভার্ট হলো)
   - যতক্ষণ উপরের যেকোনো একটাও বাকি, `products`-কে বুট থেকে আসলে সরানো (memory-তে না রাখা) সম্ভব না — এটা এখনো বহু-সেশনের কাজ

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` সব সুইট পাস ✅ → `npm run lint` 0 error (৫৬৮ প্রি-এক্সিস্টিং warning — নতুন `PosOndemandCartToggle` কম্পোনেন্টের একই ধরনের false-positive "defined but never used" প্যাটার্নে +১, নতুন সমস্যা না) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅ → `test:golden-master` (৭/৭) ও `test:fuzz` (সব প্রপার্টি) পাস ✅।

**পরের সেশনে করণীয় (ক্রমানুসারে)**:
1. **`sbm_pos_ondemand_cart` real-device-এ চালু করে বিলিং-কার্ট পুঙ্খানুপুঙ্খ টেস্ট** — এটাই এখন আসল ব্লকার, sandbox-এ যাচাই সম্ভব না
2. ক্লিন হলে — POS-এর বাকি অংশ (`productsWithSerial`/সার্চ-ফলব্যাক) একই ফ্ল্যাগের পেছনে কনভার্ট করা বিবেচনা
3. তারপর POS-বহির্ভূত বাকি ৩৩টা full-array ব্যবহার (Dashboard/Products list/Purchase Entry/BatchSyncTool) ধাপে ধাপে
4. সবশেষে — সব কল-সাইট কনভার্টেড+real-device-ভেরিফায়েড হলেই `products`-কে বুট থেকে আসলে মেমরি থেকে বাদ দেওয়া (আসল স্টেপ ৭, memory savings)

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/db/DataStore.js` — নতুন `isPosOndemandCartEnabled()`/`setPosOndemandCartEnabled()` ফ্ল্যাগ হেল্পার যোগ
- `src/App.jsx` — SmartInvoiceBuilder-এ `productBatchMap`/`invProdMap` ফ্ল্যাগ-গেটেড id-বাউন্ডেড কনভার্শন যোগ (নতুন `posNeededIds`/`getPosOndemandProduct`), নতুন `PosOndemandCartToggle` কম্পোনেন্ট + `SqliteMigrationCard`-এ তার ব্যবহার, ইম্পোর্ট লাইনে নতুন ২টা ফাংশন যোগ
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৬৮ যোগ

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৬৭)

**🟢 এন্ট্রি ৬৭ (✅ sandbox নেটওয়ার্ক কাজ করেছে, পুরো chain সত্যিকারের ভাবে চালানো হয়েছে)**: ব্যবহারকারী এন্ট্রি ৬৬-এর real-device টেস্ট করলেন — `sbm_products_boot_lazy` চালু করে বুট ব্লক হয়নি, "রিঅর্ডার সাজেশন" কার্ড প্রথমবার সঠিকভাবে দেখা গেছে, পণ্য তালিকা (২২৩৭টা) পুরোপুরি লোড+সার্চেবল। **রিপোর্ট করা একমাত্র সমস্যা**: Dashboard-এর "ইনভেন্টরি/স্টক বিশ্লেষণ" সেকশনে "স্টক ডেটা লোড হচ্ছে..." ১৫-২০ সেকেন্ড ধরে দেখাচ্ছিল।

**রুট-কজ ধরা পড়ল ও ফিক্স হলো — ডুপ্লিকেট SQL কোয়েরি-বার্স্ট বাগ**:
কোড-অডিটে ধরা পড়ল `Dashboard` (প্যারেন্ট) এবং `InventorySection` (তার নিজস্ব child, একই render-এ ভেতরে বসানো) — দুটোই **আলাদাভাবে, স্বাধীনভাবে** `useInventoryData(products, businessType)` কল করছিল। এই hook-এর ভেতরে প্রতিবার কল হলেই একসাথে ৫টা SQL কোয়েরি (`Promise.all`: `dsGetInventoryList('all')`, `dsGetInventoryList('critical')`, `dsGetInventoryList('out')`, `dsGetExpiryCandidates`, `dsGetSupplierSummary`) চলে, যার মধ্যে `getInventoryList('all')` ২২৩৭টা প্রোডাক্টের পুরো `data` JSON blob (ব্যাচ-সহ) টানে। ফলে প্রতিটা Dashboard মাউন্টে **একই ৫টা ভারী কোয়েরি দুইবার**, একই সাথে, একই businessType-এর single SQLite connection-এর উপর দিয়ে — sandbox বেঞ্চমার্কে (better-sqlite3 ডাইরেক্ট কল, ms-স্কেল) এটা অদৃশ্য ছিল, কিন্তু real ডিভাইসে Capacitor SQLite JS↔Native bridge-এ ১০টা concurrent bridge round-trip (৫+৫, বড় JSON পে-লোডসহ) সিরিয়ালাইজ/কনটেন্ড করে বাস্তব ১৫-২০ সেকেন্ড লেটেন্সির প্রধান কারণ ছিল বলে ধারণা।

**কী করা হলো**: `InventorySection`-এর নিজস্ব `useInventoryData()` কল সরানো হলো। এই কম্পোনেন্ট আসলে `inv` অবজেক্টের শুধু ৪টা ফিল্ড ব্যবহার করে (`allStock`/`criticalStock`/`stockOut`/`sqlStatus` — লাইন-বাই-লাইন গ্রেপ করে যাচাই করা হয়েছে, বাকি কোনো `inv.*` ফিল্ড এই কম্পোনেন্টে ব্যবহৃত হয় না)। এখন Dashboard-এ আগে থেকেই কম্পিউটেড `inv` অবজেক্ট নতুন `invData` prop দিয়ে সরাসরি `<InventorySection>`-এ পাস করা হচ্ছে (`invData={inv}`) — কম্পোনেন্ট নিজে হুক কল করে না, prop না থাকলে (defensive) খালি ডিফল্ট ব্যবহার করে। ডেটা-সোর্স/মান/আচরণ ১০০% অপরিবর্তিত (একই hook-এর একই রেজাল্ট, শুধু এখন শেয়ার্ড — দ্বিতীয়বার ফেচ হয় না)।

**ঝুঁকি**: কম — শুধু prop-passing পরিবর্তন, কোনো নতুন query/schema/লজিক না। `InventorySection` salon বাদে সব businessType-এ রেন্ডার হয়, Dashboard-এর নিজস্ব `useInventoryData()` কলটা salon-সহ সবসময় চলে (অপরিবর্তিত রাখা হয়েছে, salon-এ শুধু InventorySection রেন্ডার হয় না)।

**⚠️ যা এখনো বাকি**:
   - এই ফিক্স **real-device-এ কখনো টেস্ট হয়নি** — ডুপ্লিকেট-কোয়েরি সরানোর পর ১৫-২০ সেকেন্ড আসলে কমেছে কিনা যাচাই করা দরকার (**পরের সেশনের প্রথম কাজ**)
   - যদি ফিক্সের পরও উল্লেখযোগ্য স্লো থেকে যায়, পরের সন্দেহ: `getInventoryList('all')`-এর পুরো `data` JSON blob bridge দিয়ে টানা (Dashboard-এ আসলে শুধু `.length` লাগে, ফুল রো-ডেটা শুধু ইউজার কার্ডে ট্যাপ করে ফুলপেজ-এ গেলেই দরকার) — সেক্ষেত্রে `getInventoryCounts()` (আগে থেকেই আছে, cheap aggregate) দিয়ে KPI-সংখ্যা আর ভারী লিস্ট lazy/on-tap ফেচ করার ডিজাইন বিবেচনা করা যেতে পারে, কিন্তু এটা এই সেশনে করা হয়নি (আগে ডুপ্লিকেট-ফিক্সের প্রভাব যাচাই করা উচিত, একসাথে দুইটা পরিবর্তন করলে কোনটা কাজ করল বোঝা কঠিন হবে)
   - real-device-এ boot-lazy (এন্ট্রি ৬৩) ও POS বিলিং-কার্ট real-device টেস্ট এখনো বাকি (অপরিবর্তিত)
   - জমে থাকা real-device স্মোক-টেস্ট তালিকা (অপরিবর্তিত)
   - বুট সিকোয়েন্স থেকে `products` সম্পূর্ণ সরানো (৭.৩ চূড়ান্ত ধাপ)

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` সব সুইট পাস ✅ → `npm run lint` 0 error (৫৬৭ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅ → `test:golden-master` (৭/৭) ও `test:fuzz` (সব প্রপার্টি) পাস ✅।

**পরের সেশনে করণীয়**:
1. **এই ডুপ্লিকেট-কোয়েরি ফিক্স real-device-এ টেস্ট** — Dashboard লোড হতে এখন কত সময় লাগছে (আগে ১৫-২০ সেকেন্ড ছিল)
2. উন্নতি হলেও এখনো ধীর মনে হলে — `getInventoryList('all')`-এর payload-সাইজ কমানো (শুধু KPI-দরকারি কলাম, ফুল JSON না) বিবেচনা করা
3. real-device-এ boot-lazy ফ্ল্যাগ ও POS বিলিং-কার্ট টেস্ট (অপরিবর্তিত, এখনো বাকি)

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `InventorySection`-এর নিজস্ব `useInventoryData()` কল সরানো, নতুন `invData` prop দিয়ে ডেটা গ্রহণ; Dashboard-এর `<InventorySection>` কল-সাইটে `invData={inv}` পাস
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৬৭ যোগ

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৬৬)

**🟢 এন্ট্রি ৬৬ (✅ sandbox নেটওয়ার্ক কাজ করেছে, পুরো chain সত্যিকারের ভাবে চালানো হয়েছে)**: ব্যবহারকারী "বাকি কাজগুলো শুরু করুন" বললেন (আগের সেশনের \"মোট যা বাকি\" সামারি অনুযায়ী)। **🔴 সবচেয়ে জরুরি দুটো আইটেম (real-device-এ `sbm_products_boot_lazy` টেস্ট, POS বিলিং-কার্ট real-device টেস্ট) এই সেশনেও করা হয়নি** — sandbox কখনো real Android device/Capacitor SQLite bridge simulate করতে পারে না, এই দুটোই নিজস্ব সংজ্ঞা অনুযায়ী শুধু ব্যবহারকারীই করতে পারবেন। এর বদলে জমে থাকা তালিকার দুটো 🟡 "ছোট বাকি আইটেম" (কোনো real-device নির্ভরতা নেই, নিরাপদে sandbox-এই সম্পূর্ণ করা যায়) নেওয়া হলো:

1. **`reorderAlerts` dead prop — এখন লাইভ UI**: এন্ট্রি ৬৩.১-এ চিহ্নিত হয়েছিল Dashboard-এ `reorderAlerts` prop পৌঁছায় কিন্তু কোথাও রেন্ডার হয় না। `InventorySection`-এ নতুন "রিঅর্ডার সাজেশন" কার্ড যোগ হলো (stockOut/critical কার্ডগুলোর ঠিক নিচে, শুধু `reorderAlerts.length > 0` হলেই দৃশ্যমান — খালি থাকলে UI-তে জায়গা নেয় না) — জরুরি (red status) কাউন্ট ব্যাজ + প্রথম ৩টা পণ্যের নাম প্রিভিউ, ট্যাপ করলে নতুন ফুলপেজ (`invModal === 'reorder'`) খোলে যেখানে প্রতিটা পণ্যের স্টক/দৈনিক গড় বিক্রয়/আনুমানিক দিন/সাজেস্টেড অর্ডার-কোয়ান্টিটি রঙ-কোডেড (red/yellow/green) তালিকায় দেখা যায়। `reorderAlerts` prop `Dashboard` → `InventorySection` কল-সাইটে (আগে পাস হতো না) ও পাশাপাশি নতুন `invModal==='reorder'` ব্লক Dashboard-এর existing all/critical/out/expired/near-expiry ফুলপেজ-মডাল কন্ডিশনের ঠিক আগে বসানো হয়েছে (আলাদা ডেটা-শেপ বলে একটা আলাদা early-return ব্লক, বিদ্যমান সাপ্লায়ার-গ্রুপিং লজিক স্পর্শ করা হয়নি)।

2. **Invoice history-র `payType` SQL-WHERE গ্যাপ — ফিক্স**: আগে `loadInvHistPage()`-এ SQL WHERE শুধু `customer_id`/`date_key` কভার করত, `payType` ফিল্টার সবসময় বড়-limit (১ লাখ) fetch করে JS-এ (`matchesFilter()`) প্রয়োগ হতো — কারণ `invoices` টেবিলে কোনো `pay_type` কলামই ছিল না (শুধু নেস্টেড `data` JSON-এ)। **স্কিমা-চেঞ্জ**: `schema.sql`-এ নতুন `pay_type TEXT` কলাম + `idx_invoices_pay_type (pay_type, date_key)` ইনডেক্স, `HOT_FIELDS.invoices.extract()`-এ `inv.payType ?? null` যোগ (dual-write স্বয়ংক্রিয়ভাবে নতুন/এডিটেড ইনভয়েসে পপুলেট করবে), পুরনো ইনস্টলের জন্য `getDb()`-এ এন্ট্রি ৫৭/৫৮-এর প্রতিষ্ঠিত `_addMissingCols()` প্যাটার্নেই `invoices` টেবিলে `pay_type` ALTER TABLE গার্ড। **⚠️ ইচ্ছাকৃত নিরাপত্তা-সিদ্ধান্ত**: এই ফিক্সের আগে dual-write হওয়া পুরনো রো-গুলোতে `pay_type` এখনো NULL (backfill এখনো চালানো হয়নি) — তাই SQL WHERE-এ সরাসরি `pay_type = ?` না দিয়ে `(pay_type = ? OR pay_type IS NULL)` ব্যবহার করা হয়েছে, যাতে ব্যাকফিল-না-হওয়া পুরনো রো ভুলবশত ফিল্টার-আউট না হয়ে যায় (`matchesFilter()`-ই এখনো চূড়ান্ত সঠিকতার উৎস, SQL শুধু narrowing/performance optimization)। ব্যাকফিল/resumable-migration চলার পর সব রো-তে `pay_type` পপুলেটেড হয়ে গেলে এই OR-শর্ত কার্যত no-op হয়ে যাবে এবং আসল পারফরম্যান্স-লাভ (কম রো ফেচ, কম bridge round-trip) পুরোপুরি মিলবে।

**⚠️ যা এখনো বাকি (অপরিবর্তিত, এই সেশনে ছোঁয়া হয়নি)**:
   - real-device-এ `sbm_products_boot_lazy` ফ্ল্যাগ টেস্ট (আসল ব্লকার)
   - POS বিলিং-কার্ট flow real-device টেস্ট (boot-lazy চালু অবস্থায়)
   - জমে থাকা real-device স্মোক-টেস্ট তালিকা (dup-name-চেক, ক্যাটাগরি-চিপ, reorder-widget **সহ** এখন নতুন হওয়ায় প্রথমবার, BatchSyncTool, Customers RFM, invoice history read-path) — এই সেশনের ২টা পরিবর্তনও (reorder-widget UI, payType SQL narrowing) এই তালিকায় যোগ হলো
   - বুট সিকোয়েন্স থেকে `products` সম্পূর্ণ সরানো (৭.৩ চূড়ান্ত ধাপ) — উপরের real-device টেস্ট ছাড়া নিরাপদ না
   - দীর্ঘমেয়াদি Phase আইটেম (dual-write প্রোডাকশন পর্যবেক্ষণ, ৫০০ দোকানে ধাপে ধাপে rollout, Phase 8 reconciliation, Phase 5 পুরনো কোড অপসারণ)

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` সব সুইট (৭৮+১৪+১০+২৪+১০+১৮+৭+১১+১৩+৮+১০+১১+৭+৪ কেস) সব পাস ✅ → `npm run lint` 0 error (৫৬৬ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅ → `test:golden-master` (৭/৭) ও `test:fuzz` (সব প্রপার্টি) পাস ✅।

**পরের সেশনে করণীয় (ক্রমানুসারে, অপরিবর্তিত)**:
1. **real-device-এ boot-lazy ফ্ল্যাগ (`sbm_products_boot_lazy`, এন্ট্রি ৬৩) চালু করে টেস্ট** — এটাই আসল ব্লকার, এখনো কখনো real-device-এ যাচাই হয়নি।
2. তারপর POS বিলিং-কার্ট flow পুরোপুরি real-device-এ (আইটেম যোগ, qty +/-, self-use টগল, ইনভয়েস সেভ, স্টক-ডিডাকশন সঠিকতা) boot-lazy চালু অবস্থায়।
3. দুটোই ক্লিন হলে — তারপরই বুট সিকোয়েন্স থেকে `products` আসলে সরানো (৭.৩ চূড়ান্ত ধাপ) বিবেচনা করা যায়, ধাপে ধাপে flag-controlled রোলআউটসহ।
4. এর পাশাপাশি (কম জরুরি): জমে থাকা real-device স্মোক-টেস্ট (নতুন reorder-widget-সহ), invoice history-র payType SQL narrowing-এর ফলাফল টেস্ট-শপে যাচাই।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `InventorySection`-এ `reorderAlerts` prop + নতুন "রিঅর্ডার সাজেশন" কার্ড, `Dashboard`-এর `<InventorySection>` কল-সাইটে prop পাস, নতুন `invModal==='reorder'` ফুলপেজ ব্লক; `loadInvHistPage()`-এর SQL WHERE-এ payType শর্ত যোগ
- `src/db/schema.sql` — `invoices` টেবিলে নতুন `pay_type TEXT` কলাম + `idx_invoices_pay_type` ইনডেক্স
- `src/db/DataStore.js` — `HOT_FIELDS.invoices` (columns+extract)-এ `pay_type` যোগ, `getDb()`-এ `invoices` টেবিলের জন্য `_addMissingCols()` ALTER TABLE গার্ড
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৬৬ যোগ

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৬৫)

**🟢 এন্ট্রি ৬৫ (✅ sandbox নেটওয়ার্ক কাজ করেছে, পুরো chain সত্যিকারের ভাবে চালানো হয়েছে)**: ব্যবহারকারী "আসল ৭.৩" (৬৭-সাইট on-demand + বুট থেকে products সম্পূর্ণ সরানো) করতে বললেন। **আবারও সম্পূর্ণ করা হয়নি, ইচ্ছাকৃতভাবে** — কারণ ব্যাখ্যা নিচে। যা আসলে হলো:

1. **প্রথমে ফ্রেশ অডিট**: `grep -noP '(?<![.\w])products\.(map|filter|find|forEach|some|reduce|sort|findIndex|every)\('` দিয়ে বর্তমান লাইভ (কমেন্ট বাদে) সাইট গোনা হলো — পুরনো "৬৭"/"৫২" সংখ্যা স্টেল ছিল, এন্ট্রি ৪৪-৬৩-এ ইতিমধ্যে অনেক কনভার্ট হয়ে গেছে। এখন লাইভ সংখ্যা ছিল ৩৪টা (এন্ট্রি ৬৪-এর আগে)।
2. **ব্যবহারকারীর অনুরোধকৃত ৩টা জিনিসের প্রকৃত অবস্থা যাচাই**:
   - **"ক্যাটাগরি-লিস্ট বিল্ডার"** — কোড-অডিটে দেখা গেল **ইতিমধ্যেই সম্পূর্ণ** (এন্ট্রি ৪৪-এর `useKnownCategories()`, SQL-primary/JS-fallback, SmartInvoiceBuilder-এ লাইন ~১৮৯৩০-এ wired) — নতুন কাজ লাগেনি।
   - **"dup-name inline check (২টা)"** — এটাও **ইতিমধ্যেই সম্পূর্ণ** (এন্ট্রি ৪৪-এর `saveProduct()`-এর সেভ-টাইম গার্ড, `dsFindProductByNameNorm()` সরাসরি await + JS ফলব্যাক) — যে ২টা `products.find()` লাইন গ্রেপে ধরা পড়েছিল সেগুলো আসলে সেই ইচ্ছাকৃত JS-ফলব্যাক অংশ, নতুন কাজ না।
   - **"jsAllStock/jsCriticalStock/jsStockOut"** — এগুলোও ইতিমধ্যে SQL-primary (`useInventoryData()`, এন্ট্রি ৪৫/৫৪/৫৫)। এই ৩টা lines হলো **ইচ্ছাকৃত JS-ফলব্যাক** (কোডের নিজস্ব কমেন্ট: "sqliteOn বন্ধ থাকলে এটাই চূড়ান্ত মান, চালু থাকলেও রেসপন্স আসার আগে/ব্যর্থ হলে ফলব্যাক")। **এই ফলব্যাক সরানো হয়নি** — সরালে eternal rule #১ (dual-write ফেজে পুরনো পাথ কখনো মোছা যাবে না, নতুন পাথ কমপক্ষে ৪-৬ সপ্তাহ প্রোডাকশনে স্টেবল প্রমাণিত না হওয়া পর্যন্ত) সরাসরি ভঙ্গ হতো, আর সরালে SQL loading/error অবস্থায় Dashboard-এর ইনভেন্টরি সংখ্যা ভুল/শূন্য দেখাত — কোনো লাভ নেই যেহেতু `products` এখনো পুরোপুরি মেমরিতেই থাকে (৭.৩ বুট-চেঞ্জ হয়নি)।
3. **প্রকৃত নতুন কাজ (২টা genuine full-scan সাইট, safe conversion)**:
   - **`selfUseCost` (SmartInvoiceBuilder-এর `createInvoice()`, বিলিং-ক্রিটিক্যাল)** — আগে প্রতি cart-item-এ `products.find(pp => pp.id === it.productId)` (O(n) স্ক্যান)। একই কম্পোনেন্টের একই render-এ ইতিমধ্যে-বিদ্যমান `invProdMap` (line ~১৯০৯৬, sync Map, কোনো async/SQL না) দিয়ে O(1) লুকআপে বদলানো হলো — ডেটা-সোর্স/আচরণ ১০০% অপরিবর্তিত, শুধু পারফরম্যান্স। কোনো নতুন async lookup-miss ঝুঁকি নেই (এন্ট্রি ৬০-এর `applyPurchaseBatch` কনভার্শনের ঠিক একই ক্লাসের নিরাপদ পরিবর্তন)।
   - **কাস্টমার অর্ডার ফর্মের "পণ্যের নাম" স্মার্ট-ম্যাচ সার্চ (Dashboard)** — আগে প্রতি keystroke-এ পুরো `products.map()` + `smartMatch()` স্কোরিং (বড় ক্যাটালগে ব্যয়বহুল)। বিদ্যমান-প্রমাণিত হাইব্রিড FTS narrowing প্যাটার্ন (`supFtsIds`/`supFtsQuery`-এর ঠিক অনুরূপ, `hybridSearchCandidateIds()`) নতুন `custOrderFtsIds`/`custOrderFtsQuery` state দিয়ে replicate করা হলো — SQL চালু + candidate রেডি + বড় ক্যাটালগ (`FTS_NARROW_THRESHOLD`-এর বেশি) হলে narrowed pool-এই স্কোরিং, নাহলে (ছোট ক্যাটালগ/SQL বন্ধ/candidate না-থাকা) আগের মতোই পুরো `products` — আচরণ অভিন্ন, শুধু বড় স্কেলে দ্রুত।

**⚠️ যা ইচ্ছাকৃতভাবে করা হয়নি এই সেশনেও, ব্যবহারকারীর অনুরোধ সত্ত্বেও**:
- **`jsAllStock`/`jsCriticalStock`/`jsStockOut`/dup-check JS-ফলব্যাক সরানো** — উপরে ব্যাখ্যা করা কারণে (eternal rule #১ ভঙ্গ হবে, কোনো লাভ নেই)।
- **বুট সিকোয়েন্স থেকে `products` সম্পূর্ণ সরানো (আসল ৭.৩)** — PRODUCTS_ONDEMAND_MIGRATION_PLAN.md নিজেই বলছে এই ধাপ শুধু তখনই নিরাপদ যখন (ক) ক্যাটাগরি ③-এর সব আইটেম SQL-cutover **এবং** (খ) POS real-device টেস্ট সম্পূর্ণ। (ক) মূলত সম্পূর্ণ (উপরে ভেরিফায়েড), কিন্তু (খ) — POS বিলিং-কার্ট flow real-device-এ (নতুন SQL-browse/lazy-boot পরিবর্তনগুলোসহ) কখনো টেস্ট হয়নি এই লগে কোথাও নিশ্চিতভাবে লেখা নেই (এন্ট্রি ৬১-এ ব্যবহারকারী ম্যানুয়ালি কিছু কার্ট-flow যাচাই করেছেন, কিন্তু boot-lazy ফ্ল্যাগ চালু অবস্থায় না)। sandbox-এ কোনো ভাবেই real Android device/Capacitor SQLite bridge simulate করা যায় না — তাই এই চূড়ান্ত, সবচেয়ে ঝুঁকিপূর্ণ ধাপ (৫০০ লাইভ দোকানের বিলিং কাউন্টার) sandbox-শুধু সেশনে নেওয়া নিজেই migration-এর নিজস্ব eternal rules ভঙ্গ করত। এটা এড়ানো ঝুঁকি-এড়ানো না, বরং প্রজেক্টের নিজস্ব নথিবদ্ধ শর্ত মেনে চলা।

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` ১৫টা সুইট সব পাস ✅ → `npm run lint` 0 error (৫৬৭ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅ → `test:golden-master` (৭/৭) ও `test:fuzz` সব পাস ✅।

**পরের সেশনে করণীয় (ক্রমানুসারে)**:
1. **real-device-এ boot-lazy ফ্ল্যাগ (`sbm_products_boot_lazy`, এন্ট্রি ৬৩) চালু করে টেস্ট** — এটাই আসল ব্লকার, এখনো কখনো real-device-এ যাচাই হয়নি।
2. তারপর POS বিলিং-কার্ট flow পুরোপুরি real-device-এ (আইটেম যোগ, qty +/-, self-use টগল, ইনভয়েস সেভ, স্টক-ডিডাকশন সঠিকতা) boot-lazy চালু অবস্থায়।
3. দুটোই ক্লিন হলে — তারপরই বুট সিকোয়েন্স থেকে `products` আসলে সরানো (৭.৩ চূড়ান্ত ধাপ) বিবেচনা করা যায়, ধাপে ধাপে flag-controlled রোলআউটসহ।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — (ধাপ ১, এন্ট্রি ৬৪) SmartBusinessMgmt+Dashboard-এর ৭টা রিডানডেন্ট লোকাল `new Map(products.map(...))` → গ্লোবাল `productsById`; (এন্ট্রি ৬৫) `selfUseCost` লুকআপ `invProdMap.get()`-এ, কাস্টমার-অর্ডার স্মার্ট-ম্যাচ সার্চে হাইব্রিড FTS narrowing (`custOrderFtsIds`/`custOrderFtsQuery`) যোগ
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৬৫ যোগ

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৬৩)

**⚠️ এন্ট্রি ৬৩.১ (পরের সেশনে fix করার মতো একটা real ফাইন্ডিং, কোড ছোঁয়া হয়নি এখনো)**: `reorderAlerts` (এন্ট্রি ৬২-এর SQL cutover) prop হিসেবে মূল `Dashboard` কম্পোনেন্টে (App.jsx লাইন ~২২৭৬৩) পৌঁছায়, কিন্তু কোড-অডিটে (grep-এ পুরো Dashboard function body জুড়ে) নিশ্চিত হওয়া গেছে **এই prop Dashboard-এর ভেতরে কোথাও UI-তে রেন্ডার হয় না** — বর্তমানে dead prop। ব্যবহারকারী real-device টেস্ট করতে গিয়ে জানালেন Dashboard-এ এমন কোনো widget নেই যা এই ডেটা দেখায়। AI পেজের "📦 এখনই রিঅর্ডার করুন" সেকশন (App.jsx লাইন ~১০৭০৬) সম্পূর্ণ আলাদা/পুরনো মেকানিজম (`forecastData.needReorder`, সরাসরি `products` থেকে JS হিসাব) — এন্ট্রি ৬২-এর SQL কাজের সাথে সম্পর্কহীন। **পরের সেশনে করণীয়**: হয় Dashboard-এ আসল একটা `reorderAlerts` widget বানানো, নাহলে সিদ্ধান্ত নেওয়া এই prop/hook আসলে দরকার কিনা (থাকলে অন্তত ব্যবহার করা উচিত, নাহলে dead code হিসেবে থেকে যাচ্ছে)।

**🟢 এন্ট্রি ৬৩ (✅ sandbox-এ নেটওয়ার্ক কাজ করেছে, পুরো chain সত্যিকারের ভাবে চালানো হয়েছে)**: Products boot-lazy (৭.৩)-এর **নিরাপদ/সীমিত সংস্করণ** শুরু ও শেষ হলো এই সেশনে — এন্ট্রি ৬২-এ আলোচিত "৬৭টা কল-সাইট বদলাতে হবে" ঝুঁকির কারণে **আসল on-demand ডিজাইন করা হয়নি**। যা আসলে হলো:

1. **নতুন ফ্ল্যাগ `sbm_products_boot_lazy`** (`DataStore.js`-এ `isProductsBootLazyEnabled()`/`setProductsBootLazyEnabled()`, `sbm_use_sqlite_store`-এর ঠিক একই প্যাটার্নে) — **ডিফল্ট বন্ধ**।
2. **App.jsx বুট effect পরিবর্তন**: ফ্ল্যাগ বন্ধ থাকলে (ডিফল্ট) `CRITICAL_KEYS`/বুট সিকোয়েন্স ১০০% আগের মতোই (কোনো আচরণ বদলায়নি)। ফ্ল্যাগ চালু থাকলে `LK(SK.products)` `CRITICAL_KEYS` থেকে বাদ দিয়ে প্রথম সিঙ্ক্রোনাস প্যাচে `products` খালি (`[]`, স্টোরের নিজস্ব ডিফল্ট) রাখা হয় — SEED_PRODUCTS দিয়ে ভুলবশত সাময়িক seed-data দেখানো এড়াতে ইচ্ছাকৃতভাবে `SchemaMigration.runAll({ products: [] })` দিয়ে করা হয়েছে, `SEED_PRODUCTS` না দিয়ে। এরপর products-এর জন্য একটা **আলাদা, নিজস্ব `setTimeout(0)` ব্লক** (বিদ্যমান wave-2-এর সাথে জুড়ে দেওয়া হয়নি ইচ্ছাকৃতভাবে — নাহলে wave-2-এর অন্য ~২০টা কালেকশনের অপেক্ষায় products পিছিয়ে যেত) `LK(SK.products)` একাই লোড করে, schema-migrate করে, `_patch({ products, schemaMigrationStats })` করে।
3. **⚠️ গুরুত্বপূর্ণ**: `products` state **এখনো ১০০% সম্পূর্ণ মেমরিতে লোড হয়** — এন্ট্রি ৬২-এর চিহ্নিত ৬৭টা কল-সাইটের (POS পিকার, `productsById` Map, ইত্যাদি) কোনোটাই স্পর্শ/পরিবর্তন করা হয়নি, তাই কিছুই ভাঙার ঝুঁকি নেই। এই ফ্ল্যাগ শুধু *কখন* products লোড হয় সেটা বদলায় (বুট-ব্লকিং → ব্যাকগ্রাউন্ড), *কীভাবে* (পুরোপুরি বনাম আংশিক) সেটা না — তাই এটা আসল ৭.৩ ডিজাইনের প্রতিস্থাপন না, শুধু বর্তমান ১৫-২০ সেকেন্ড বুট-লেটেন্সি সমস্যাটার একটা তাৎক্ষণিক, শূন্য-ঝুঁকি প্রশমন (mitigation)।
4. **Dev panel টগল**: নতুন `ProductsBootLazyToggle` কম্পোনেন্ট, `SqliteMigrationCard`-এর ভেতরেই (একই hidden dev-panel গার্ডের আওতায়) — অন/অফ বাটন + ব্যাখ্যা, পরিবর্তন কার্যকর হতে অ্যাপ রিস্টার্ট লাগে এই সতর্কতাসহ।

**⚠️ যা এখনো বাকি**:
   - এই ফ্ল্যাগ **real-device-এ কখনো টেস্ট হয়নি** — চালু করে আসল ১৫-২০ সেকেন্ড লেটেন্সি আসলেই কমেছে কিনা (লগইন/স্প্ল্যাশ কত দ্রুত দেখা যায়, তারপর Dashboard-এ products কত দ্রুত ভরে ওঠে) এখনই যাচাই করা দরকার — **পরের সেশনের প্রথম কাজ**।
   - `reorderAlerts` (এন্ট্রি ৬২) real-device টেস্ট এখনো বাকি
   - **আসল on-demand products (৬৭টা কল-সাইট)** — এই সেশনে ইচ্ছাকৃতভাবে করা হয়নি, ভবিষ্যতে দরকার হলে আলাদা, ধাপে-ধাপে বহু-সেশনের কাজ
   - Invoice history-র `payType` SQL-WHERE গ্যাপ (এন্ট্রি ৬২-এ ডকুমেন্টেড) — স্কিমা-চেঞ্জ + backfill লাগবে, এখনো ছোঁয়া হয়নি

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` ১৫টা সুইট সব পাস ✅ → `npm run lint` 0 error (৫৬৭ warning — নতুন কম্পোনেন্ট `ProductsBootLazyToggle` কোডবেসের বিদ্যমান একই ধরনের false-positive "defined but never used" প্যাটার্নে +১, `SqliteMigrationCard`/`BackupDiagnosticsCard`-এর মতোই — নতুন সমস্যা না) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅।

**পরের সেশনে করণীয়**: (ক) এই ফ্ল্যাগ চালু করে real-device-এ boot-time আগে/পরে তুলনা করা, (খ) সমস্যা না পেলে ধীরে ধীরে টেস্ট শপে ডিফল্ট-অন করার কথা ভাবা, (গ) `reorderAlerts` + জমে থাকা বাকি real-device স্মোক-টেস্ট তালিকা।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/db/DataStore.js` — নতুন `isProductsBootLazyEnabled()`/`setProductsBootLazyEnabled()` ফ্ল্যাগ হেল্পার যোগ (এডিট)
- `src/App.jsx` — বুট effect-এ `productsKeyLazy` conditional + নতুন নন-ব্লকিং products লোড ব্লক, নতুন `ProductsBootLazyToggle` কম্পোনেন্ট + `SqliteMigrationCard`-এ তার ব্যবহার, ইম্পোর্ট লাইনে নতুন ২টা ফাংশন যোগ (এডিট)
- `SQLITE_MIGRATION_LOG.md` — এন্ট্রি ৬৩ যোগ + "চিরস্থায়ী নিয়ম"-এ #৭ (ফাইল-তালিকা বাধ্যতামূলক) যোগ (এডিট)
- `package-lock.json` — শুধু `npm install` চালানোর কারণে অটো-জেনারেটেড, কোনো ম্যানুয়াল/সাবস্ট্যান্টিভ পরিবর্তন নেই

কোনো নতুন ফাইল তৈরি হয়নি এই সেশনে।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৬২)

**🟢 এন্ট্রি ৬২ (✅ sandbox-এ নেটওয়ার্ক কাজ করেছে, পুরো chain সত্যিকারের ভাবে চালানো হয়েছে)**: ব্যবহারকারী "Phase ৩ কমপ্লিট" চাইলেন। **সম্পূর্ণ করা হয়নি এই সেশনেও, ইচ্ছাকৃতভাবে** — কারণ real-device স্মোক-টেস্ট এখনো Phase ৩-এর সবচেয়ে ঝুঁকিপূর্ণ (বিলিং-কার্ট) অংশ ছাড়া বাকি সব সাইটে সম্পন্ন হয়নি, আর নিচের ২টা আইটেম নিজেরাই পূর্ণ সেশনের কাজ। যা হলো:

1. **প্রথমে স্ব-বিরোধী লগ-দাবি ধরা পড়ল ও যাচাই করা হলো**: এন্ট্রি ৪৪/৪৭/৪৮ দাবি করেছিল ক্যাটাগরি ③-এর ৪টা full-scan সাইট (dup-name/category/supplier/dosageForm-list + expiry/forecast) সম্পূর্ণ SQL-cutover হয়ে গেছে, কিন্তু এন্ট্রি ৫৯-এর মাস্টার-স্ট্যাটাস আবার বলেছিল এটা "এখনো অসম্পূর্ণ"। কোড সরাসরি অডিট করে (৪টা হুক — `useKnownCategories`/`useKnownSuppliers`/`useKnownDosageForms`/`useLiveDupProduct` + `useExpiryCandidates` — সব SQL-primary/JS-fallback প্যাটার্নে সঠিকভাবে wired) নিশ্চিত হওয়া গেছে **এন্ট্রি ৫৯-এর দাবিটাই stale ছিল, ৪৪/৪৭/৪৮ সঠিক** — ক্যাটাগরি ③ আসলেই সম্পূর্ণ। (তবে এটা শুধু ৭.৩-এর *প্রি-রিকুইজিট* — `products` array এখনো এই সব হুকেই fallback/dependency হিসেবে বাধ্যতামূলক আছে, বুট থেকে সরানো হয়নি।)

2. **`reorderAlerts` sales-velocity SQL cutover** (Phase ৩-এর শেষ ডিজাইন-বাকি আইটেম, এন্ট্রি ৫৯/৫৭-এ বারবার "স্কোপের বাইরে" রাখা হয়েছিল): নতুন `getReorderSalesRows(businessType, d30)` (DataStore.js) — `getProductSalesRows()`-এর প্যাটার্নে `invoiceItems`-এর প্রি-কম্পিউটেড রো থেকে ৩০-দিনের `SUM(qty)`, `product_name`-কী। **⚠️ ইচ্ছাকৃত সিদ্ধান্ত**: products-এর সাথে জয়েনটা SQL-এ না করে App.jsx-এর `computeReorderAlertsFromSalesRows()`-এ JS-এ (`normName()` দিয়ে) — কারণ `invoiceItems`-এ `product_id` নেই (শুধু raw name), আর SQLite-এ `normName()`-এর multi-space-collapse রেপ্লিকেট করার নির্ভরযোগ্য উপায় নেই (ঠিক এই ক্লাসের বাগ আগে একবার FTS5 সিঙ্কে ধরা পড়েছিল, `normName()`-এর কমেন্টে লেখা আছে) — SQL-সাইড আনুমানিক ম্যাচ inventory-critical stale/মিসড-alert তৈরি করতে পারত। নতুন `useReorderAlerts()` হুক — SQL সফল হলে ব্যবহার, নাহলে/বন্ধ থাকলে Worker-কম্পিউটেড `jsReorderAlerts` (আগের `PREDICT_REORDER` পাথ, অপরিবর্তিত রাখা হয়েছে fallback হিসেবে) ফলব্যাক। thresholds/status/sort worker.js-এর সাথে অবিকল রাখা হয়েছে।
   - নতুন টেস্ট সুইট (`tests/datastore-reorder-alerts-tests.mjs`, ৪ কেস) — cutoff বিভাজন, multi-invoice SUM, voided-status বাদ পড়া, খালি-রেজাল্ট কেস। **সীমাবদ্ধতা**: `computeReorderAlertsFromSalesRows()` App.jsx-এর ভেতরে (browser-only, Node-এ import অযোগ্য) বলে এন্ট্রি ৪৯-এর মতোই শুধু DataStore-অংশ (SQL aggregate) সরাসরি টেস্ট করা হয়েছে, পূর্ণ worker.js-এর সাথে বাইট-বাই-বাইট parity-টেস্ট এখনো নেই।

**⚠️ যা এখনো বাকি (Phase ৩ সম্পূর্ণ ধরার আগে)**:
   - উপরের `reorderAlerts` পরিবর্তন sandbox-এ verified কিন্তু **real-device-এ কখনো টেস্ট হয়নি** (Dashboard-এর reorder-alert widget সঠিক তালিকা দেখাচ্ছে কিনা)
   - **Products list boot-lazy চূড়ান্ত ধাপ (৭.৩)** — প্রি-রিকুইজিট (ক্যাটাগরি ③) কোড-স্তরে সম্পূর্ণ প্রমাণিত হলেও, বুট-সিকোয়েন্স থেকে `products`-এর eager full-load আসলে সরানোর কাজ **এখনো শুরুই হয়নি** — এটা এখনো নিজেই একটা পূর্ণ সেশনের কাজ, আর বিলিং-কার্ট real-device টেস্ট শেষ না হলে এটাতে হাত দেওয়া অনিরাপদ (একই সেশনে বুট-সিকোয়েন্স + বিলিং দুটোই বদলালে সমস্যা এলে root-cause আলাদা করা কঠিন হয়ে যাবে)
   - **Invoice history read-path** — এন্ট্রি ৫৯ অনুযায়ী ৪টা সাইটের ৪টাই SQL-cutover হয়ে গেছে বলে দাবি ছিল; এই সেশনে পুনঃযাচাই করা হয়নি (পরের সেশনে করণীয় তালিকায় যোগ)

**যাচাই সম্পূর্ণ**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` ১৫টা সুইট সব পাস ✅ (নতুন `datastore-reorder-alerts-tests.mjs`-সহ) → `npm run lint` 0 error (৫৬৬ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅।

**পরের সেশনে করণীয়**: (ক) real-device স্মোক-টেস্ট — এখনো এন্ট্রি ৫৩+৫৫+৫৬+৫৭+৬০+৬১+৬২ সব একসাথে জমে আছে (ব্যবহারকারী বিলিং-কার্ট/ক্রয়-এন্ট্রির মূল অংশ ইতিমধ্যে হাতে-কলমে যাচাই করেছেন — এন্ট্রি ৬১-এর ঝুঁকি অনেকটা কমেছে, কিন্তু dup-name-চেক/ক্যাটাগরি-চিপ/reorder-widget/BatchSyncTool/Customers RFM এখনো real-device-এ দেখা হয়নি), (খ) Invoice history read-path-এর current state পুনঃযাচাই, (গ) সবশেষে Products boot-lazy (৭.৩) — সবচেয়ে বড় ও ঝুঁকিপূর্ণ বাকি আইটেম, একা একটা সেশনে, ধাপে-ধাপে flag-controlled রোলআউটসহ করা উচিত।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৬১)

**🟢 এন্ট্রি ৬১**: এন্ট্রি ৬০-এ চিহ্নিত SmartInvoiceBuilder-এর ৩টা `products.find()` সাইট এখন কনভার্ট — ব্যবহারকারীর স্পষ্ট অনুমোদনের পর।

1. **`setQty()`** (কার্ট-কোয়ান্টিটি হ্যান্ডলার, লাইন ~১৯১৭৫) — `products.find()` → SmartInvoiceBuilder-এর নিজস্ব `productsByIdMap` (লাইন ~১৮৮৮৫, `productsWithSerial` থেকে বিল্ড, তাই `.serial` ফিল্ডও আছে — নিচে `prod.serial` ব্যবহার হয় বলে এটা যাচাই করা জরুরি ছিল, নিশ্চিত হওয়া গেছে সব ফিল্ড স্প্রেড হয়ে আছে)।
2. **qty `+` বাটন** (লাইন ~২০৭০৬) — একই প্যাটার্নে কনভার্ট।
3. **স্টক-ডিডাকশন ফলব্যাক** (ইনভয়েস-সেভের `stockUpdates` ম্যাপিং, লাইন ~১৯৪১৭) — প্রাইমারি lookup (`useAppStore.getState().productsById`, freshest snapshot, অপরিবর্তিত রাখা হয়েছে — কমেন্টে ব্যাখ্যা করা কারণেই জরুরি) অক্ষুণ্ণ, শুধু এর ফলব্যাক অংশ `products.find()` → `productsByIdMap.get()` (একই render-এর একই `products` closure থেকে, freshness অপরিবর্তিত)।

**যাচাই সম্পূর্ণ**: node_modules সহ পুরো পাইপলাইন রি-রান — `npm test` ১৪টা সুইট সব পাস ✅, `npm run lint` 0 error (৫৬৬ প্রি-এক্সিস্টিং warning) ✅, `npm run typecheck` ক্লিন ✅, `npm run build` ক্লিন ✅।

**অবশিষ্ট `products.find(p => p.id ...)` সাইট**: এখন শুধু ২টা (লাইন ~২৮৮২৩/২৮৮২৬), দুটোই নাম-ভিত্তিক ডুপ্লিকেট-চেক (`p.id !== editId && dsNormName(p.name) === target`) — id-lookup না, `productsByIdMap`-এ কনভার্ট করার প্রশ্নই আসে না (এন্ট্রি ৫৬-এই আলাদাভাবে `dsFindProductByNameNorm()` SQL ফাংশন দিয়ে হ্যান্ডলড, স্কোপের বাইরে)।

**⚠️ সততার সাথে**: এই ৩টা পরিবর্তনই sandbox-এ test/lint/typecheck/build দিয়ে ভেরিফায়েড, কিন্তু **real-device স্মোক-টেস্ট এখনো হয়নি** — বিশেষভাবে বিক্রয়-কার্ট flow (আইটেম যোগ, qty বাড়ানো/কমানো, ইনভয়েস সেভ করে stock/costPrice ঠিকমতো ডিডাক্ট হচ্ছে কিনা) real device-এ যাচাই করা এখনো বাকি (এন্ট্রি ৫৩ থেকে জমে থাকা তালিকায় যোগ হলো)।

**পরের সেশনে করণীয়**: (ক) real-device স্মোক-টেস্ট — এখন এন্ট্রি ৫৩+৫৫+৫৬+৫৭+৬০+৬১ সব একসাথে জমেছে, বিশেষত বিক্রয়-কার্ট flow-টা সবচেয়ে জরুরি (money-critical, কখনো টেস্ট হয়নি), (খ) তারপরই Invoice history read-path/RFM ইত্যাদি বাকি Phase ৩ আইটেম।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৬০)

**🟢 এন্ট্রি ৬০ (✅ এই সেশনে sandbox-এ নেটওয়ার্ক কাজ করেছে — `npm test`+`lint`+`typecheck`+`build` সবই সত্যিকারের ভাবে চালানো ও পাস হয়েছে)**:

**🔴 রিয়েল রিগ্রেশন বাগ ধরা পড়েছে ও ফিক্স হয়েছে**: এন্ট্রি ৫৯-এ `reorderAlerts` কনসোলিডেশন ভুল সাইটে বসানো হয়েছিল — `App.jsx`-এর `ViewerDashboardScreen`-এ (লাইন ~১৭৮০৯) `useLowStockItems(products, businessType)` বসানো হয়েছিল, কিন্তু এই স্ক্রিনে `businessType` কোনো prop/variable হিসেবে সংজ্ঞায়িতই না (এটা snapshot-ভিত্তিক আলাদা ডেটা-সোর্স, শুধু local `prefix` আছে)। এন্ট্রি ৫৯ নিজেই বলেছিল sandbox নেটওয়ার্কহীন থাকায় এই পরিবর্তন আনভেরিফায়েড ছিল — এই সেশনে প্রথমবার `npm run lint` আসলে চালিয়ে ধরা পড়ল এটা `no-undef` **error** (0 error দাবি এতদিন ভুল ছিল, কারণ lint-ই চালানো হয়নি সেই সেশনে), রানটাইমে যা Viewer Dashboard ওপেন করলেই `ReferenceError` দিয়ে ক্র্যাশ করাত। এন্ট্রি ৫৭-এই স্পষ্ট লেখা ছিল এই সাইট ইচ্ছাকৃতভাবে ছোঁয়া হয়নি ঠিক এই কারণেই — এন্ট্রি ৫৯ ভুলবশত সেই সিদ্ধান্ত ভেঙেছিল। **ফিক্স**: আগের মতোই সরাসরি local `useMemo` filter (কোনো `businessType`/SQL dependency ছাড়া, `jsLowStockItems`-এর সাথে identical লজিক)।

**✅ applyPurchaseBatch/savePE — বিলিং-ক্রিটিক্যাল কনভার্শন শুরু**: `products.find(p => p.id === productId)` (O(n) স্ক্যান) থেকে ইতিমধ্যে-বিদ্যমান `productsByIdMap` (লাইন ~২৮৪২২, একই `products` state থেকে **সিঙ্ক্রোনাসভাবে** বিল্ড করা Map, কোনো SQL/async fetch জড়িত না) দিয়ে O(1) lookup। এটা এন্ট্রি ৫৭/৫৯-এ আলোচিত "async `getByIds()`-ভিত্তিক করার ঝুঁকি" থেকে সম্পূর্ণ ভিন্ন — কোনো async lookup-miss ঝুঁকি নেই, শুধু পারফরম্যান্স উন্নতি, আচরণ ১০০% অপরিবর্তিত।

**⚠️ নতুন গরমিল পাওয়া গেছে, স্পর্শ করা হয়নি**: এন্ট্রি ৫৭/৫৯-এ দাবি করা হয়েছিল SmartInvoiceBuilder-এর ৭টা সাইট "ইতিমধ্যে `productsByIdMap` থেকে O(1) lookup করে" — কিন্তু কোড-অডিটে দেখা গেল এটা পুরোপুরি সত্যি না। এখনো সরাসরি `products.find()` ব্যবহার করছে: (১) `setQty()` কার্ট-কোয়ান্টিটি হ্যান্ডলার (লাইন ~১৯১৭৫), (২) qty +/− বাটন (লাইন ~২০৭০২)। আর লাইন ~১৯৪১৪-এ (বিক্রয়ের স্টক-ডিডাকশন) একটা hybrid fallback প্যাটার্ন (`productsById.get() || products.find()`) — আংশিক নিরাপদ কিন্তু বিশুদ্ধ Map-lookup না। **ইচ্ছাকৃতভাবে এই সেশনে ছোঁয়া হয়নি** — সরাসরি বিক্রয়-সময়ের কার্ট UI, ব্যবহারকারীর স্পষ্ট অনুমোদন ছাড়া হাত দেওয়া ঠিক না।

যাচাই: `npm test` — ১৪টা সুইট সব পাস ✅, `npm run lint` — **0 error** ✅ (আগে ১টা ছিল, ফিক্স হয়েছে), `npm run typecheck` — ক্লিন ✅, `npm run build` — ক্লিন ✅। এই প্রথম pipeline-এর সবকটা ধাপ একসাথে সত্যিকারের ভাবে চালানো গেল একই সেশনে।

**পরের সেশনে করণীয়**: (ক) SmartInvoiceBuilder-এর উপরের ৩টা সাইট নিয়ে সিদ্ধান্ত (কনভার্ট করবেন কিনা, real-device টেস্ট প্ল্যানসহ), (খ) real-device স্মোক-টেস্ট — এন্ট্রি ৫৩ থেকে জমে থাকা পুরো তালিকা + এই সেশনের ২টা পরিবর্তন, (গ) তারপর Invoice history read-path/RFM ইত্যাদি বাকি Phase ৩ আইটেম।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৫৯)

**🟡 এন্ট্রি ৫৯ (⚠️ পুরোটাই আনভেরিফায়েড — sandbox নেটওয়ার্কহীন এই সেশনে, শুধু esbuild সিনট্যাক্স-চেক করা হয়েছে, npm test/lint/typecheck/build/real-device কিছুই চালানো যায়নি)**: ব্যবহারকারী "Phase ৩ কমপ্লিট করুন" চাইলেন। **আবারও সম্পূর্ণ করা হয়নি, ইচ্ছাকৃতভাবে** — নেটওয়ার্কহীন অবস্থায় টাকা-সরাসরি-প্রভাবিত কোড (ইনভয়েস-সেভ, costPrice) লেখা এই মাইগ্রেশনের নিজস্ব ⚠️ চিরস্থায়ী নিয়মের (উপরে দেখুন) সরাসরি বিরুদ্ধে। যা হলো:
- **`reorderAlerts` consolidation** (Dashboard, App.jsx লাইন ~১৭৭৯৭) — লোকাল `products.filter()` সরিয়ে ইতিমধ্যে-verified `useLowStockItems()` হুক (এন্ট্রি ৪৫) পুনর্ব্যবহার। নতুন SQL/ঝুঁকি নেই, শুধু ডুপ্লিকেট সরানো। **স্পষ্টীকরণ**: এন্ট্রি ৫৭-এর PDF-এ এই `reorderAlerts`-কে ভুলবশত sales-velocity Worker-ফাংশনের (PREDICT_REORDER, App.jsx লাইন ~১১৯৮২, সম্পূর্ণ আলাদা) সাথে গুলানো হয়েছিল — সেটা এই কাজের বাইরে, অনুচ্ছুই রইল।
- **Invoice history read-path — বাকি ২টা archive-merge সাইট SQL cutover**: (১) Dashboard-এর `dmArchiveRows` (date-range রিপোর্ট, লাইন ~২২৮৭৮), (২) `CustomerDetail`-এর `archivedCustInvs` (কাস্টমার-নির্দিষ্ট, লাইন ~২৭২৬২) — দুটোই `loadInvHistPage()`/`loadVoidHist()`-এর প্রতিষ্ঠিত প্যাটার্ন অনুসরণ করে (`isSqliteEnabled()` → `dsQueryPage()` চেষ্টা → ব্যর্থ/বন্ধ হলে পুরনো `InvoiceArchive.queryPage()` ফলব্যাক)। **আসল "ইনভয়েস হিস্ট্রি পুরো read-path pagination" আইটেমটা দেখা গেল আসলে ৪টা সাইটের মধ্যে ২টা (`loadInvHistPage`, `loadVoidHist`) আগের কোনো সেশনেই SQL-cutover হয়ে গিয়েছিল — মাইগ্রেশন লগে সেটা কোনো এন্ট্রিতে স্পষ্ট লেখা ছিল না, তাই আগের সেশন ভুলবশত পুরোটাই "শুরুই হয়নি" ধরে নিয়েছিল।** merge-এ id-ভিত্তিক dedup আগে থেকেই ছিল দুই জায়গাতেই, তাই SQL+live overlap-এ ডুপ্লিকেট ঝুঁকি নেই।

**⚠️ ইচ্ছাকৃতভাবে ছোঁয়া হয়নি (money-critical, নেটওয়ার্ক/real-device ছাড়া অনিরাপদ)**:
- বিলিং-ক্রিটিক্যাল `SmartInvoiceBuilder` ইনভয়েস-সেভ/POS-পিকার ৭টা সাইট — কোড পড়ে কনফার্ম হলো এগুলো ইতিমধ্যে `productsByIdMap` (synced global Map) থেকে O(1) lookup করে, তাই বর্তমানে ঠিকঠাক। এগুলোকে async `getByIds()`-ভিত্তিক করার একমাত্র লাভ হলো ৭.৩ (বুট-লেজি) ধাপ, যেটার নিজস্ব পূর্বশর্ত (ক্যাটাগরি ③, ৪টা full-scan সাইট) এখনো অসম্পূর্ণ — এখন ছুঁলে কোনো সুবিধা ছাড়াই ইনভয়েস-তৈরির মুহূর্তে async lookup-miss-এর নতুন ঝুঁকি যোগ হতো।
- `applyPurchaseBatch`/`savePE` (costPrice/weighted-avg হিসাব) — একই কারণে, ভুল হলে সব রিপোর্ট/ইনভেন্টরি ভ্যালুয়েশন ভুল হয়ে যাবে।

**পরবর্তী ধাপ**: উপরের দুটো বাকি আছে বলে Phase ৩ এখনো সম্পূর্ণ না — একটা নেটওয়ার্ক-অ্যাক্সেসযুক্ত/real-device সেশনেই এগুলো ধরা উচিত, যাতে প্রতিটা ধাপের পর test suite দিয়ে ভেরিফাই করা যায়।

---

**🔴 এন্ট্রি ৫৮ (real-device regression, এন্ট্রি ৫৭-এর পরপরই ধরা পড়ে)**: `getDb()`-এর promise-cache ফিক্স (এন্ট্রি ৫৭) সমান্তরাল duplicate init রেস আটকেছিল, কিন্তু প্রতিটা single cold-boot init-এর ভেতরের ১৩টা sequential-await ALTER TABLE কলের খরচ কমায়নি — flag বন্ধ/চালু করে A/B টেস্টে ("বন্ধ করলাম। এখন লেট নেই। ইনস্ট্যান্ট আসলো।") নিশ্চিত হওয়া গেছে এটাই লেটেন্সির root cause। ফিক্স: প্রতিটা টেবিলে একবার `PRAGMA table_info()` দিয়ে আসল কলাম-সেট পড়ে শুধু সত্যিই অনুপস্থিত কলামের জন্য ALTER — পুরনো (fully-migrated) ডিভাইসে এখন প্রতি বুটে ১৩টা ALTER round-trip-এর বদলে ৩টা fast PRAGMA কল, ALTER সাধারণত ০টা। **sandbox-এ নেটওয়ার্ক না থাকায় npm test/build দিয়ে ভেরিফাই করা যায়নি এই সেশনে — real-device smoke test-এই প্রথম যাচাই হবে (নিচে জমে থাকা টেস্ট-ঋণের তালিকায় যোগ করা হলো)।**

**🟢 এন্ট্রি ৫৭**: এই সেশনে sandbox-এ প্রথমবার নেটওয়ার্ক কাজ করেছে (`npm install` সফল) — তাই এই এন্ট্রি থেকে প্রতিটা পরিবর্তনের পর সত্যিই `npm test`+`lint`+`typecheck`+`build` sandbox-এই চালানো গেছে (আগের এন্ট্রিগুলোতে এই ক্ষমতা ছিল না)।

ব্যবহারকারী এক সেশনে "Phase ৩ সম্পূর্ণ" চাইলেন। **সম্পূর্ণ করা হয়নি, ইচ্ছাকৃতভাবে** — কারণ তদন্তে দেখা গেল Phase ৩-এর বাকি অংশ প্রাথমিক অনুমানের চেয়ে বড়/জটিল। যা আসলে হলো:

**✅ সম্পূর্ণ + ভেরিফায়েড:**
1. **`getDb()` cold-boot race কন্ডিশন ফিক্স** (ব্যবহারকারীর রিপোর্ট করা "স্টক ডেটা লোড করা যায়নি (SQL ব্যর্থ)" ব্যানার-এর root cause) — আগে `_dbCache` শুধু resolved connection cache করত, promise না; বুট-এ একই businessType-এর জন্য একাধিক হুক একসাথে cache-miss পেয়ে সমান্তরালে db.open()+schema-execute চালাতে গিয়ে সংঘর্ষ করত। ফিক্স: in-flight promise-ই cache করা হচ্ছে (`_dbPromiseCache`), সব concurrent caller একই init-এ await করে।
2. **`allSupplierNames`** (Dashboard) — ডুপ্লিকেট full-scan সরিয়ে ইতিমধ্যে-কম্পিউটেড `inv.supplierList` পুনর্ব্যবহার (Bengali-locale সর্ট অপরিবর্তিত রাখা হয়েছে আউটপুট-প্যারিটির জন্য)।
3. **Customers RFM/LTV SQL cutover** (`getCustomerRfmAggregates()`, নতুন DataStore ফাংশন) — ৩টা আলাদা GROUP BY কোয়েরি (invoices→ltv/frequency/lastDateKey, txns→recentPaid, গ্লোবাল totalSales/monthSale)। ⚠️ ইচ্ছাকৃতভাবে JOIN না — invoices×txns cross-product হয়ে SUM ভুল হওয়ার ঝুঁকি এড়াতে। `App.jsx`-এর `Customers` কম্পোনেন্টে `jsRfmData` (আগের) + নতুন SQL-preferred `rfmData` — SQL সফল হলে override, নাহলে/লোডিং/এরর অবস্থায় `jsRfmData`-ই ফলব্যাক (এন্ট্রি ৫৪-এর "সাইলেন্ট ফলব্যাক না" নীতি থেকে **ইচ্ছাকৃত ব্যতিক্রম** — কারণ ব্যাখ্যা কোডের কমেন্টে: Dashboard-এর widget-এ শূন্য দেখানো নিরাপদ, কিন্তু Customers-এ পুরো লিস্ট খালি দেখালে workflow ব্লক হয়ে যায়, আর jsRfmData যেহেতু এমনিতেও কম্পিউট হয় তাই নতুন ঝুঁকি নেই)।
   - নতুন টেস্ট সুইট (`tests/datastore-customer-rfm-tests.mjs`, ৭ কেস) — সবচেয়ে গুরুত্বপূর্ণ কেসটা: `invoiceId=null`-এর সরাসরি "বাকি আদায়" txn-ও recentPaid-এ ধরা পড়ে কিনা (আসল ব্লকার, নিচে দেখুন)।
   - ম্যানুয়াল parity-চেক — ব্যবহারকারীর নিজের ডেটা (রুবেল বাদশা, ইনভয়েস ৳৮৩২+৳৫+৳১৬২০=৳২৪৫৭) দিয়ে পুরনো JS বনাম নতুন SQL — **বাইট-বাই-বাইট মিলেছে**।

**🔴 স্কিমা-চেঞ্জ (এই এন্ট্রিতেই করা হয়েছে, RFM cutover-এর ব্লকার হিসেবে ধরা পড়েছিল):**
`txns` টেবিলে নতুন `customer_id TEXT` কলাম (+ইনডেক্স) — আগে ছিল না। `invoice_id` দিয়ে `invoices` জোড়া লাগিয়ে customerId বের করার চেষ্টা প্রথমে করা হয়েছিল, কিন্তু কাস্টমার-ডিটেইল পেজ থেকে সরাসরি "বাকি আদায়" করলে (`addTxn(customerId, ..., invoiceId=null, ..., "collection")`) কোনো ইনভয়েসের সাথে যুক্ত থাকে না — JOIN দিয়ে এই টাকা silently বাদ পড়ে যেত, `recentPaid`/`at_risk` সেগমেন্ট ভুল হতো। তাই সরাসরি কলাম। নতুন ইনস্টলে `schema.sql`-এর CREATE TABLE থেকেই আসবে; পুরনো ইনস্টলে `getDb()`-এ নতুন `ALTER TABLE txns ADD COLUMN customer_id TEXT` গার্ড। `HOT_FIELDS.txns.extract()`-এ `t.customerId` থেকে পপুলেট হয় (dual-write স্বয়ংক্রিয়ভাবে কভার করে, আলাদা backfill স্ক্রিপ্ট লাগেনি — পরের resumable backfill রান-এই নতুন কলাম পপুলেট হয়ে যাবে)।

**🔍 নতুন যা বোঝা গেল (মূল প্ল্যান ডকুমেন্টে ভুল ক্যাটাগরাইজড ছিল, স্পর্শ করা হয়নি):**
- **`reorderAlerts`** (Dashboard) আসলে sales-velocity পূর্বাভাস অ্যালগরিদম (avgDaily consumption + daysLeft projection), Web Worker-এ (`worker.js`) ইতিমধ্যে main-thread-এর বাইরে চলে, `invoices` হিস্ট্রি লাগে — সাধারণ "site swap" না, SQL-এ পুরো অ্যালগরিদম রিডিজাইনের কাজ। ViewerDashboardScreen-এর আলাদা local `reorderAlerts` (সাধারণ minStockAlert ফিল্টার) স্পর্শ করা হয়নি কারণ ওটা snapshot-ভিত্তিক আলাদা ডেটা-সোর্স (businessType থ্রেডই করা নেই), global store-এর সাথে সরাসরি সম্পর্কিত না।
- **"১২+ Map বিল্ডার" (`new Map(products.map(...))`)** — পরীক্ষা করে দেখা গেল বেশিরভাগই bug/ডুপ্লিকেট না, **ইচ্ছাকৃত ডকুমেন্টেড সিদ্ধান্ত** (যেমন লাইন ~১১৬৭৭-এ কমেন্টে স্পষ্ট লেখা "দুই কম্পোনেন্ট আলাদা স্কোপ হওয়ায় ESLint no-undef error + build fail" হয়েছিল বলেই local রাখা হয়েছে)। এগুলো কনভার্ট করলে আগের সঠিক সিদ্ধান্ত উল্টে যেত — স্পর্শ করা হয়নি।

**⚠️ যা এখনো বাকি, প্রতিটাই নিজেই একটা পূর্ণ সেশনের কাজ:**
- **বিলিং-ক্রিটিক্যাল ৭টা সাইট** (`SmartInvoiceBuilder`-এর ইনভয়েস-সেভ লজিক) — টাকা+স্টক সরাসরি
- **ক্রয়-খরচ-ক্রিটিক্যাল** — `applyPurchaseBatch()`, `savePE()`-এর productId lookup
- **Invoice history পুরো read-path** — এখনো in-memory React-state filtering
- **Products list boot-lazy চূড়ান্ত ধাপ (৭.৩)** — উপরের সব শেষ না হলে করা যাবে না

**⚠️ সততার সাথে**: real-device স্মোক-টেস্ট এন্ট্রি ৫৩ থেকেই জমে আছে (এখন এন্ট্রি ৫৫+৫৬+৫৭ যোগ হওয়ায় আরও বেড়েছে)। **পরের যেকোনো কোড-কাজের আগে এবার সত্যিই বাধ্যতামূলক করা উচিত।**

যাচাই: `npm test` — ১২টা সুইট সব পাস (নতুন `datastore-customer-rfm-tests.mjs`-সহ), `npm run lint` 0 error (৫৭৮, নতুন `catch(_)` ব্লকের জন্য +১ warning, একই established প্যাটার্ন), `npm run typecheck` ক্লিন, `npm run build` ক্লিন।

**পরের সেশনে করণীয়**: (ক) real-device স্মোক-টেস্ট (এন্ট্রি ৫৩+৫৫+৫৬+৫৭ সব একসাথে — Products list, ক্রয় এন্ট্রি ব্যাচ-লেবেল, পণ্য-এডিট সেভ, BatchSyncTool, allSupplierNames, Customers RFM), (খ) টেস্ট-শপে flag চালু করে RFM parity live-verify, (গ) তারপর বিলিং-ক্রিটিক্যাল সাইট (সবচেয়ে সতর্কতার সাথে, একটার বেশি একসাথে না), (ঘ) `reorderAlerts`-এর জন্য আলাদা SQL-ভিত্তিক sales-velocity ডিজাইন বসা।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৫৬)

**🟢 এন্ট্রি ৫৬**: ব্যবহারকারী স্পষ্টভাবে অনুরোধ করলেন ৭.৩-এর বাকি ~৫০টা সাইট একসাথে এই সেশনে শেষ করতে। **এটা আংশিক করা হলো, ইচ্ছাকৃতভাবে সম্পূর্ণ না** — কারণ ব্যাখ্যা নিচে।

**যা এই সেশনে করা হলো (২টা নতুন বাউন্ডেড সাইট, এন্ট্রি ৫৫-এর একই নীতিতে)**:
1. `Products` কম্পোনেন্টের `originalProduct` (এডিট-সেভের audit-log স্ন্যাপশট, আগে `products.find(p=>p.id===editId)`) → `useProductsByIds()` id+hydrate।
2. `BatchSyncTool`-এর `correctionGroups` (লস-ঝুঁকি/ব্যাচ-মিসম্যাচ ডায়াগনস্টিক টুল, আগে প্রতি গ্রুপে লুপের ভেতরে `products.find()`, O(n×m)) → bounded id-সেট বের করে একবারে `useProductsByIds()` দিয়ে ব্যাচ-হাইড্রেট। এর জন্য `businessType` প্রপ BatchSyncTool-এ প্রথমবার থ্রেড করা হলো (আগে পাস হতো না)।

**যা ইচ্ছাকৃতভাবে এই সেশনেও বাদ রাখা হলো (ব্যবহারকারীর "অর্ডার" সত্ত্বেও)**:
- **বিলিং-ক্রিটিক্যাল ৭টা সাইট** (`SmartInvoiceBuilder`-এর ইনভয়েস-সেভ লজিক, লাইন ~১৯১৬০/১৯৩৭৬/১৯৩৯৯/২০৬৮৭/২১১৬৮/২১২০৫) — ভুল হলে সরাসরি টাকা/স্টক হিসাব ভুল হবে
- **ক্রয়-খরচ-ক্রিটিক্যাল** — `applyPurchaseBatch()` (weighted-average-cost গণনা, লাইন ~২৮৯৭১) ও `savePE()`-এর `peForm.productId` lookup (লাইন ~২৯২২৬) — এখানে ভুল হলে costPrice/stock সরাসরি ভুল হয়ে যাবে
- **Aggregate/full-scan সাইট** (`reorderAlerts`, `lowStock`, `outOfStock`, `allSupplierNames`, সাপ্লায়ার-গ্রুপিং, `jsAllStock`/`jsCriticalStock`/`jsStockOut` ইত্যাদি) — এগুলো নির্দিষ্ট id-সেট না, পুরো ক্যাটালগ স্ক্যান দরকার; `useProductsByIds()` প্যাটার্নে সরাসরি কনভার্ট করা যায় না, আলাদা SQL অ্যাগ্রিগেট ফাংশন ডিজাইন করতে হবে (নতুন কাজ)
- **নাম-ভিত্তিক ডুপ্লিকেট-চেক** (লাইন ~২৮৬৭৬/২৮৬৭৯) — id-lookup না, ইতিমধ্যেই `dsFindProductByNameNorm()` SQL ফাংশন + JS ফলব্যাক দিয়ে হ্যান্ডল করা (এন্ট্রি ৪৪), স্কোপের বাইরে
- বাকি `new Map(products.map(...))` বিল্ডার-লাইনগুলো (১২+টা জায়গায়) — এগুলো এখনো পূর্ণ `products` লাগে; কোন id-সেট আসলে দরকার সেটা কেস-বাই-কেস বিশ্লেষণ ছাড়া কনভার্ট করা যায় না (এন্ট্রি ৫১-এর AuditTrailModule অডিটের মতোই)

**⚠️ সততার সাথে**: real-device স্মোক-টেস্ট এন্ট্রি ৫৩ থেকেই বাকি — এখন এন্ট্রি ৫৫+৫৬ যোগ হওয়ায় মোট ৪টা wire করা সাইট (POS, Products list, ক্রয় ব্যাচ-লেবেল, এডিট-audit, BatchSyncTool) একসাথে টেস্ট-ঋণ জমে গেছে। **পরের যেকোনো কোড-কাজের আগে এবার real-device টেস্ট বাধ্যতামূলক করা উচিত** — নাহলে সমস্যা হলে কোন পরিবর্তনটা কারণ বের করা কঠিন হয়ে যাবে।

যাচাই: `npm test` সব সুইট পাস, `npm run lint` 0 error (৫৭৭, অপরিবর্তিত), `npm run typecheck` ক্লিন, `npm run build` ক্লিন, golden-master + fuzz পাস।

**পরের সেশনে করণীয়**: (ক) real-device স্মোক-টেস্ট — এন্ট্রি ৫৩+৫৫+৫৬ সব একসাথে (Products list, ক্রয় এন্ট্রি ব্যাচ-লেবেল, পণ্য-এডিট সেভ, BatchSyncTool-এর "সংশোধন" ট্যাব), (খ) টেস্ট-শপে flag চালু করে এন্ট্রি ৫৪-এর parity-চেক, (গ) তারপরই বিলিং/কস্ট-ক্রিটিক্যাল সাইট বা aggregate-SQL ডিজাইনের দিকে এগোনো বিবেচনা করা উচিত।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৫৫)

**🟢 এন্ট্রি ৫৫**: দুটো কাজ — (১) এন্ট্রি ৫৪-এর সিদ্ধান্ত (`useInventoryData()`-এ SQL ব্যর্থ হলে JS-ফলব্যাক বাদ) কোড করা হলো, কিন্তু **সীমিত রেখে**: `isSqliteEnabled()` বন্ধ থাকলে (ডিফল্ট, বর্তমানে সব ৫০০ দোকানে) আচরণ ১০০% অপরিবর্তিত (jsAllStock/jsCriticalStock/jsStockOut/jsSupplierList-ই ব্যবহার হয়) — চালু থাকলেই (আপাতত শুধু ম্যানুয়ালি-এনাবল করা টেস্ট-ডিভাইস) SQL loading/error অবস্থায় খালি অ্যারে রিটার্ন করে, সাইলেন্ট JS-ফলব্যাক নেই। নতুন `sqlStatus` ('disabled'/'loading'/'error'/'ok') রিটার্ন হয়; `InventorySection`-এর কার্ড-সেকশনে একটা ছোট লোডিং/এরর ব্যানার যোগ হয়েছে (শুধু sqliteOn সত্য হলে দৃশ্যমান)। **⚠️ Dashboard-এর ফুলপেজ ইনভেন্টরি-মডাল (all/critical/out তালিকা, লাইন ~২৩৮১৬-এর আশপাশে) এখনো এই ব্যানার দেখায় না** — সেখানে sqlStatus থ্রেড করা হয়নি (রেন্ডার-লজিক জটিল, সময়সীমার মধ্যে নিরাপদে করা যায়নি) — শুধু `InventorySection`-এর সামারি-কার্ড অংশ কভার করা হয়েছে।  
(২) ৭.৩-এর পরের একটামাত্র বাউন্ডেড-রিস্ক সাইট — `Products` কম্পোনেন্টের `peSelProdForBatch` (ক্রয় এন্ট্রি ফর্মের ব্যাচ-লেবেল, আগে `products.find(p=>p.id===peForm.productId)`) — POS/Products-list-এর মতোই `useProductsByIds()` id+hydrate প্যাটার্নে কনভার্ট করা হলো। ইচ্ছাকৃতভাবে শুধু এই একটা সাইট এই সেশনে — বাকি ৫০+ সাইট (বিলিং-ক্রিটিক্যাল ৭টাসহ) স্পর্শ করা হয়নি, একসাথে সব করা এন্ট্রি ৪৯-এ যে কারণে প্রত্যাখ্যাত হয়েছিল সেই একই কারণে।  
যাচাই: `npm test` সব সুইট পাস (কোনো ফেইল নেই), `npm run lint` 0 error (৫৭৭ প্রি-এক্সিস্টিং warning অপরিবর্তিত), `npm run typecheck` ক্লিন, `npm run build` ক্লিন, golden-master (৭/৭) ও fuzz (সব প্রপার্টি) পাস। **real-device স্মোক-টেস্ট এখনো হয়নি** (এন্ট্রি ৫৩-এর real-device টেস্টও এখনো বাকি, জমেই যাচ্ছে)।  
**পরের সেশনে করণীয়**: (ক) এন্ট্রি ৫৩+৫৫ একসাথে real-device স্মোক-টেস্ট (Products list + ক্রয় এন্ট্রি ব্যাচ-লেবেল, sqliteOn বন্ধ অবস্থায় — অর্থাৎ বর্তমান সব দোকানের বাস্তব আচরণ), (খ) টেস্ট-শপে `isSqliteEnabled()` ম্যানুয়ালি চালু করে entry ৫৪-এর parity-চেক (allStock/criticalStock/stockOut/supplierList সংখ্যা JS বনাম SQL মিলছে কিনা), (গ) মিললে Dashboard ফুলপেজ মডালেও sqlStatus ব্যানার থ্রেড করা, (ঘ) ৭.৩-এর পরের বাউন্ডেড সাইট (dup-check `products.find` লাইন ~২৮৬৬৯/২৮৬৭২, বা `peFilteredProds`)।

---

## 🎯 আগের মাস্টার স্ট্যাটাস (এন্ট্রি ৫৩)

**🟢 এন্ট্রি ৫৩**: Products main list card এখন POS-এর মতোই `useProductsByIds()` id+hydrate প্যাটার্নে (আগে সরাসরি SQL row-স্ন্যাপশট রেন্ডার হতো)। CustomerDetail টার্গেট dead-prop বলে কাজ লাগেনি (এন্ট্রি ৫১-এই resolved)। sandbox পুরোপুরি ক্লিন (test+lint+typecheck+build+golden-master+fuzz), **real-device স্মোক-টেস্ট বাকি**। বিস্তারিত এন্ট্রি ৫৩ দ্রষ্টব্য।

**🔴 এন্ট্রি ৫২**: ব্যবহারকারী GitHub Actions CI-এর "build" ওয়ার্কফ্লো ফেইল স্ক্রিনশট শেয়ার করলেন — `Type-check (JSDoc + @ts-check)` স্টেপে `tsc --noEmit` ফেইল: `src/logic.js(296,60): error TS2739 — Type '{}' is missing d30, d60, d90`।
- **⚠️ সততার সাথে**: এটা এই সেশনের App.jsx পরিবর্তনের কারণে হয়নি (logic.js এই সেশনে স্পর্শই করা হয়নি) — কিন্তু ধরা পড়ল আমার নিজের sandbox-ভেরিফিকেশন প্রক্রিয়ায় গ্যাপ ছিল: এতদিন `npm test`+`lint`+`build` চালানো হতো, কিন্তু `package.json`-এর আলাদা `npm run typecheck` (`tsc --noEmit -p jsconfig.json`) স্ক্রিপ্টটা কখনো sandbox-এ চালানো হয়নি — অথচ এটা CI-এর নিজস্ব build স্টেপ, এন্ট্রি ৪৯-৫১-এর "npm test/lint/build ক্লিন" দাবিগুলো তাই typecheck কভার করেনি।
- **root cause**: `computeProductSales()`-এর JSDoc-এ তৃতীয় প্যারামিটার `cutoffs`-এর টাইপ `{d30:string, d60:string, d90:string}` (সব required) লেখা ছিল, কিন্তু রানটাইম ডিফল্ট মান `{}` — টাইপ-চেকার এই দুটো মিলছে না বলে এরর দিচ্ছিল। এটা সম্ভবত এন্ট্রি ৪৮-এই (যখন এই ফাংশন App.jsx থেকে logic.js-এ তোলা হয়) তৈরি হয়েছিল, কিন্তু তখনো typecheck sandbox-এ চালানো হয়নি বলে ধরা পড়েনি।
- **ফিক্স**: শুধু JSDoc টাইপ-অ্যানোটেশন বদলানো হলো (`{d30?:string, d60?:string, d90?:string}` + প্যারামিটার ঐচ্ছিক `[cutoffs]`) — রানটাইম কোড/আচরণ কিছুই বদলায়নি, শুধু টাইপ এখন বাস্তব ডিফল্ট মানের সাথে মেলে।
- **এখন থেকে sandbox-ভেরিফিকেশনে `npm run typecheck`ও যোগ করা হলো** — শুধু test/lint/build না।
- যাচাই: `npm test` ২২৭/২২৭ পাস, `npm run lint` 0 error, `npm run build` ক্লিন, **`npm run typecheck` এখন ক্লিন** (আগে ফেইল করত)।

**🟢 এন্ট্রি ৫১**: এন্ট্রি ৪৯-এর প্ল্যানে "CustomerDetail → InvoiceVoidModal" কে দ্বিতীয় (কম-ঝুঁকির) `useProductsByIds()` টার্গেট বলা হয়েছিল — কোড অডিটে ধরা পড়ল এটা **ভুল ছিল**: `InvoiceVoidModal`-এ `products` prop পাস হয় কিন্তু ফাংশন-বডিতে কোথাও ব্যবহারই হয় না (dead prop, grep দিয়ে নিশ্চিত)। আসল কার্যকর টার্গেট পাওয়া গেল `AuditTrailModule → DailySalesStockCard` (দৈনিক বিক্রয়/লাভ কোলাপ্সিবল প্যানেল, ডিফল্ট বন্ধ, বিলিং না) — এখানে সত্যিকারের `prodMap = new Map(products.map(...))` (পূর্ণ অ্যারে থেকে বিল্ড) ছিল, `calcProfitTotal()` আর soldRows-এর name-fallback-এ ব্যবহৃত হতো। এই কম্পোনেন্টে আগে `businessType` prop-ই ছিল না (হুক চালাতে দরকার) — কল-চেইনে ইতিমধ্যে scope-এ থাকা `businessType` ২টা লেয়ার (App→AuditTrailModule→DailySalesStockCard) দিয়ে প্লাম্ব করা হলো। `neededProductIds` (শুধু নির্বাচিত দিনের stockMovements+dayInvoices থেকে বের করা বাউন্ডেড id-সেট) দিয়ে `useProductsByIds()` কল করা হলো, আর `calcProfitTotal()`-এর জন্য একটা ছোট `{ get: getProductById }` wrapper (Map-সদৃশ ইন্টারফেস) পাস করা হলো যাতে `calcProfitTotal()`/`logic.js`-এর নিজস্ব কোড কিছুই বদলাতে না হয়। soldRows-এর `prodMap.get()`ও একই হুকের `getProductById()`-এ রুট করা হয়েছে।
- একই সিঙ্ক-ফলব্যাক ডিজাইন (এন্ট্রি ৪২/৫০): বুট সিকোয়েন্স অপরিবর্তিত থাকায় SQL-ফেচ এখনো ফায়ার করবে না, আচরণ কাগজে-কলমে অপরিবর্তিত।
- ⚠️ সততার নোট (এন্ট্রি ৫০-এর মতোই প্রযোজ্য): এখানেও কোনো React-হুক-লেভেল automated প্যারিটি-টেস্ট নেই (অবকাঠামোর অভাব) — শুধু কোড-রিভিউ যুক্তি। real-device টেস্টই আসল প্রমাণ।
- যাচাই: `npm test` ২২৭/২২৭ পাস, `npm run lint` 0 error (৫৭৭ প্রি-এক্সিস্টিং warning, নতুন কিছু না), `npm run build` ক্লিন।
- **এখন পর্যন্ত ৭.৩-এ ২টা রেন্ডার-পাথ wire হয়েছে (POS + AuditTrail), কোনোটাই real-device-এ টেস্ট হয়নি এখনো।**

**🟡 এন্ট্রি ৫০**: ব্যবহারকারী সরাসরি ঝুঁকি নিয়ে ৭.৩-এর প্রথম কোড-ধাপ **POS product picker (SmartInvoiceBuilder)-এই** করতে বললেন (এন্ট্রি ৪৯-এর প্রস্তাবিত নিরাপদ (ক)/(খ) না বেছে)। `useProductsByIds()` হুক POS-এর ব্রাউজ-রেন্ডার সাইটে (`browseProducts` memo, আগে সরাসরি `productsByIdMap.get(id)`) wire করা হলো — বুট সিকোয়েন্স অপরিবর্তিত থাকায় (products পুরোপুরি মেমরিতে) হুকের নিজস্ব ডিজাইন অনুযায়ী SQL-ফেচ পাথ এখনো কখনো ফায়ার করবে না, সবসময় সিঙ্ক্রোনাস `productsByIdMap` লুকআপই হবে — কিন্তু **এটা এখনো real-device-এ প্রমাণিত না**, শুধু sandbox+কোড-রিভিউ দিয়ে যুক্তি।
- **⚠️ সততার নোট — প্রতিশ্রুত "প্যারিটি টেস্ট" পুরোপুরি দেওয়া যায়নি**: এই প্রজেক্টে React হুক টেস্ট করার কোনো অবকাঠামো নেই (`@testing-library/react` বা অনুরূপ কিছু `devDependencies`-এ নেই — শুধু plain-Node লজিক/DataStore টেস্ট, entry ৪৪-এর `getKnownSuppliers()`-এর মতোই App.jsx-এর ভেতরের ফাংশন/হুক সরাসরি ইম্পোর্ট-টেস্টেবল না)। তাই আলাদা কোনো নতুন টেস্ট ফাইল যোগ হয়নি — বদলে কোড-রিভিউ দিয়ে যাচাই করা হয়েছে যে `get(id) = productsByIdMap?.get(id) || cache.get(id) || null`-এ যেহেতু `productsByIdMap` সবসময় পূর্ণ থাকে, প্রথম শর্তেই মিলে যায় এবং ফলাফল আগের কোডের সাথে গঠনগতভাবে অভিন্ন। এটা প্রকৃত রিগ্রেশন-টেস্ট না, শুধু যুক্তি — তাই real-device টেস্টই একমাত্র আসল প্রমাণ।
- `useProductsByIds()`-এর নিজস্ব SQL-লেয়ার (`dsGetByIds`) আগে থেকেই `tests/datastore-getbyids-tests.mjs` (৮ কেস) দিয়ে টেস্টেড — পুনরায় চালিয়ে কনফার্ম করা হয়েছে (নিচে দেখুন), তবে এই সেশনে সেটা অপরিবর্তিত।
- যাচাই: `npm test` — **২২৭/২২৭ পাস** ✅ (নতুন কোনো কেস যোগ হয়নি, উপরের কারণে)। `npm run lint` — **0 error** ✅ (৫৭৭টা প্রি-এক্সিস্টিং warning, নতুন কিছু যোগ হয়নি, পরিবর্তিত লাইনগুলোতে কোনো warning নেই)। `npm run build` — vite build ক্লিন ✅।
- **পরের ধাপ অনুযায়ী পরিকল্পনা (অপরিবর্তিত)**: (১) POS-এ এই পরিবর্তনসহ real-device স্মোক-টেস্ট — প্রোডাক্ট ব্রাউজ, ক্যাটাগরি ফিল্টার, স্ক্রল-পেজিনেশন, স্টক-আউট আইটেম, কার্টে যোগ করে বিক্রি সম্পন্ন করা, দাম/স্টক সঠিকতা; (২) কনফার্ম হলে একই প্যাটার্ন Products main list card ও CustomerDetail-এও বসানো; (৩) তারপর আসল ৭.৩ (বুট সিকোয়েন্স থেকে `products` সরানো, যেখানে SQL-ফেচ পাথ সত্যিই সক্রিয় হবে) — ফের real-device টেস্ট আবশ্যক; (৪) এরপর AIPage_-এর অবশিষ্ট JS অংশ ও Customers SQL cutover।

**🟢 এন্ট্রি ৪৯**: "ধাপ ৭ শুরু করুন" — কিন্তু সততার সাথে প্রথমেই: **আসল ৭.৩ (বুট সিকোয়েন্স থেকে `products` সম্পূর্ণ সরানো) এই সেশনে শুরু করা হয়নি।** কারণ যাচাই করতে গিয়ে নিশ্চিত হলো এন্ট্রি ৪২/৪৩-এর নিজস্ব ঝুঁকি-মূল্যায়ন সঠিক ছিল — `grep`-এ App.jsx-এ `products.map/filter/find/forEach/some/reduce/sort(...)` প্যাটার্নের **৫১টা সরাসরি full-array-scan সাইট** পাওয়া গেছে (এটা `productsById`/Map-লুকআপ বাদ দিয়েই, শুধু plain array method কল)। এতগুলো লাইভ রেন্ডার-পাথ একসাথে async-এ কনভার্ট করে একই সেশনে responsible-ভাবে ভেরিফাই করা বাস্তবসম্মত না — বিশেষ করে POS বিলিং কাউন্টার-সংশ্লিষ্ট জায়গাগুলোতে ভুল হলে PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর চিরস্থায়ী নিয়ম #৪ ("পণ্য না-পাওয়া/ভুল দেখানো") সরাসরি লঙ্ঘন হয়ে যেত। তাই এই সেশনে যা করা হলো:

1. **এন্ট্রি ৪৪-এর প্রকৃত অবস্থা যাচাই ও ডকুমেন্ট-গ্যাপ ঠিক করা**: এন্ট্রি ৪৪-এর নিজস্ব বিস্তারিত লগ-সেকশনটাই এই ফাইল থেকে হারানো ছিল (মাস্টার স্ট্যাটাসে এক লাইন সামারি ছিল, কিন্তু "## এন্ট্রি লগ"-এ এন্ট্রি ৪৫-এর ঠিক পরেই এন্ট্রি ৪৩-এ চলে যায়, ৪৪ নেই — এন্ট্রি ৩৮-এ চিহ্নিত "হারানো ফাইল" প্যাটার্নেরই আরেকটা রূপ, এবার ফাইল না, লগ-সেকশন)। কোড খুঁজে (`getDistinctCategories`/`getDistinctSuppliers`/`getDistinctDosageForms`/`findProductByNameNorm` — সবগুলো DataStore.js-এ বিদ্যমান, App.jsx-এ ৪টা হুকের (`useKnownCategories`/`useKnownSuppliers`/`useKnownDosageForms`/`useLiveDupProduct`) মাধ্যমে সত্যিকারের কল-সাইটে (লাইন ~১৮৭৯৪/২২৬৬৮/২৮২৪৯/২৮৫৪৭) ওয়্যার্ড) নিশ্চিত হওয়া গেছে **এন্ট্রি ৪৩-এর ক্যাটাগরি ③ FULL-SCAN তালিকার ৪টা আইটেমই এখন সম্পূর্ণ কোড-স্তরে** (৩টা এন্ট্রি ৪৪-এ + AIPage_ ফোরকাস্ট/এক্সপায়ার এন্ট্রি ৪৭-৪৮-এ)।
2. **🔴 রিয়েল বাগ ধরা পড়েছে ও ফিক্স হয়েছে**: `getDistinctCategories()`-এর জন্য কোনো টেস্ট আগে লেখাই হয়নি (এন্ট্রি ৪৪-এ কোড হয়েছিল কিন্তু টেস্ট না) — এই সেশনে টেস্ট লেখার সময় ধরা পড়ল `WHERE ... AND product_type != 'service' ...` SQL-এর three-valued logic-এ `product_type IS NULL` (বেশিরভাগ প্রোডাক্টেরই — শুধু service আইটেমে explicit "service" বসে) রো-গুলো বাদ দিয়ে দিচ্ছিল (`NULL != 'service'` SQL-এ UNKNOWN, WHERE-এ true হয় না)। **মানে production-এ SQL চালু থাকলে SmartInvoiceBuilder-এর ক্যাটাগরি-ফিল্টার চিপ লিস্ট প্রায় খালি দেখাত** — JS ফলব্যাক (`p.productType !== "service"`, undefined !== "service" জাভাস্ক্রিপ্টে true) ঠিকই ছিল, শুধু SQL পাথে বাগ ছিল। ফিক্স: `(product_type IS NULL OR product_type != 'service')`।
3. **নতুন `tests/datastore-distinct-lookups-tests.mjs` (১১ কেস)** — ৪টা ফাংশনই যাচাই করে (উপরের বাগ-ফিক্স রিগ্রেশনসহ)। App.jsx-এর `getKnownSuppliers()`/`getKnownCustomDosageForms()` plain-JS ফাংশন (browser-only, Node-এ import করা যায় না) বলে সরাসরি প্যারিটি সম্ভব না — হাতে-হিসাব-করা প্রত্যাশিত মান দিয়ে DataStore ফাংশন সরাসরি টেস্টেড (inventory/pos-browse টেস্টের কনভেনশন)।
4. **audit — আসল ৭.৩-এর স্কোপ নিশ্চিত**: ৫১টা full-array-scan সাইট (উপরে বিস্তারিত) — এর মধ্যে অনেকগুলো ইতিমধ্যে SQL-cutover-করা aggregate-এর JS-ফলব্যাক অংশ (নিরাপদ, ছোঁয়ার দরকার নেই), কিন্তু POS/Products-list/CustomerDetail-এর মতো id-lookup রেন্ডার-পাথও আছে যেগুলো `useProductsByIds()` (এন্ট্রি ৪২-এ কোড-সম্পূর্ণ, কোথাও wire করা হয়নি) দিয়ে রিপ্লেস করতে হবে — কিন্তু POS real-device টেস্ট এখনো একবারও হয়নি বলে এখনই এই কল-সাইটগুলো টাচ করা ঠিক না।

`npm test` — **২২৭ কেস (আগের ২১৬ + নতুন ১১), সব পাস** ✅, `npm run lint` — **0 error** ✅, `npm run build` — ক্লিন ✅।

**পরের সেশনে সবার আগে করণীয় — দুটো পথ, ব্যবহারকারীর সিদ্ধান্ত দরকার**:
- **(ক)** real-device স্মোক-টেস্ট আগে (এন্ট্রি ৪০-৪৮-এর সব পরিবর্তন, বিশেষত POS picker ও নতুন ক্যাটাগরি-চিপ ফিক্স) — মাস্টার স্ট্যাটাসের দীর্ঘদিনের সুপারিশ, ঝুঁকি সবচেয়ে কম।
- **(খ)** অথবা ৭.৩-এর প্রথম প্রকৃত কোড-ধাপ: `useProductsByIds()` **একটামাত্র সবচেয়ে কম-ঝুঁকির রেন্ডার-সাইটে** (Products main list card, এন্ট্রি ৪৩-এর নিজস্ব সুপারিশ অনুযায়ী POS-এর চেয়ে কম বিলিং-ঝুঁকি) wire করা — কিন্তু বুট সিকোয়েন্স তখনো *অপরিবর্তিত* থাকবে (products পুরোপুরি মেমরিতেই থাকবে, তাই zero regression risk, শুধু async-cache প্যাটার্নটা লাইভ রেন্ডার-পাথে প্রমাণ করা)। এটাই আসল বুট-চেঞ্জের (ধাপ ৭.৩ চূড়ান্ত) আগের নিরাপদ prerequisite ধাপ।

**🟡 এন্ট্রি ৪৮ (বিস্তারিত নিচে অপরিবর্তিত)**: AIPage_-এর ৪টা সাব-প্যাটার্নের মধ্যে ৪র্থ ও শেষটা সম্পূর্ণ — **AIPage_ সাব-প্যাটার্ন ৪/৪**।

- নতুন টেবিল `invoiceItems` (schema.sql) — "one row per invoice line-item" normalized টেবিল, কারণ `invoices` টেবিলে items শুধু নেস্টেড `data` JSON-এ আছে, per-product GROUP BY সরাসরি SQL-এ করা যায় না। এন্ট্রি ৪১-এর নীতি মেনে (নেস্টেড হিসাব write-time-এ JS দিয়ে ফ্ল্যাট রো-তে প্রিকম্পিউট, শুধু SUM/GROUP BY SQL-এ) — revenue/cost `calcLineDiscountedRevenue()`/`_itemCostPrice()` (logic.js, single source of truth) দিয়ে লেখা-সময়ে প্রিকম্পিউট।
- `src/logic.js`-এ নতুন `computeProductSales(invList, prodMap, {d30,d60,d90})` — আগে App.jsx-এ ইনলাইন useMemo হিসেবে ছিল, এখানে তোলা হলো JS-ফলব্যাক আর টেস্ট দুই জায়গাতেই একই ফাংশন রিইউজ করার জন্য (এন্ট্রি ৪১-এর "duplicate-logic এড়ানো" নীতি)।
- `DataStore.js`-এ নতুন `upsertInvoiceItems()` (ইনভয়েস dual-write-এর পাশাপাশি, full delete+re-insert per invoice — এডিট/আইটেম-বদল সব কেস কভার করে), `removeInvoiceItems()`, আর `getProductSalesRows()` (CASE WHEN বাকেট + SUM/GROUP BY অ্যাগ্রিগেট)। App.jsx-এ নতুন `useProductSalesRows()` হুক (SQL-প্রথম, JS-ফলব্যাক প্যাটার্ন, `useSupplierDueRows()`-এর মতোই) — পুরনো ইনলাইন `productSales` useMemo রিপ্লেস করেছে।
- `dualWriteInvoiceItems()` — invoices dual-write-এর ঠিক পাশে, নিজস্ব `_dsInvoiceItemsRef` (স্বাধীন diff-স্ন্যাপশট, বিদ্যমান `dualWriteSqlite()`/`_dsInvoicesRef` স্পর্শ করা হয়নি)। archiveOldInvoices() (৬-মাস আর্কাইভিং)-এ ইচ্ছাকৃতভাবে `_dsInvoiceItemsRef`-এ invoices-এর মতো "delete-before-remove" ট্রিক প্রয়োগ করা হয়নি — productSales-এর window সর্বোচ্চ ৯০ দিন, তাই ৬-মাস-পুরনো আর্কাইভড ডেটা এমনিতেও কখনো এই কোয়েরিতে ব্যবহৃত হতো না।
- **🔴 রিয়েল বাগ ধরা পড়েছে ও ফিক্স হয়েছে** (এই লজিক শেয়ার্ড ফাংশনে তোলার সময়): আগে `const d = inv.date || inv.dateKey || ""` দিয়ে ৩০/৬০/৯০-দিনের বাকেট নির্ণয় হতো। কিন্তু `inv.date` আসলে `toLocaleDateString("en-US",{timeZone:"Asia/Dhaka"})` দিয়ে বানানো **"M/D/YYYY"** ফরম্যাটের ডিসপ্লে-স্ট্রিং (যেমন "8/16/2026"), আর d30/d60/d90 cutoff **"YYYY-MM-DD"** ফরম্যাটে। দুই ভিন্ন ফরম্যাট স্ট্রিং-তুলনা করলে ফলাফল অর্থহীন হয় (`"8/16/2026" >= "2026-07-17"` সবসময় `true`, কারণ ASCII-তে '8' > '2', প্রকৃত তারিখ নির্বিশেষে) — আর `inv.date` সবসময় truthy থাকায় `dateKey` ফলব্যাকে কখনো পৌঁছাতই না। **এর মানে m1/m2/m3 বাকেট কার্যত এলোমেলো ছিল — "সেরা পণ্য"/রিঅর্ডার-সাজেশন/মার্জিন হিরো-ভিলেন ফিচারগুলো (যেগুলো এখনো লাইভে চালু আছে, শুধু in-memory JS দিয়ে) সম্ভবত ভুল ডেটা দেখাচ্ছিল, শুধু এই SQL মাইগ্রেশনের সমস্যা না।** ফিক্স: `inv.dateKey` (cutoff-দের সাথে ফরম্যাট-সামঞ্জস্যপূর্ণ) এখন প্রথমে ব্যবহার হয়, `inv.date` শুধু legacy fallback। SQL পাথ (`invoiceItems.date_key`) শুরু থেকেই সঠিক ফরম্যাট ব্যবহার করত বলে এই বাগ থেকে মুক্ত ছিল — JS-ফলব্যাক ফিক্স করে দুই পাথ মেলানো হয়েছে।
- ⚠️ ছোট, স্বীকৃত edge-case (এন্ট্রি ৪১-এর canonical-name tie-break-এর মতোই): legacy আইটেম (item.costPrice মিসিং)-এর cost SQL-এ dual-write-এর *তখনকার* prodMap দিয়ে fix হয়ে যায় — পরে সেই প্রোডাক্টের costPrice বদলালে live JS নতুন cost দেখাবে কিন্তু SQL রো পুরনোটাই ধরে রাখবে (self-correcting, ইনভয়েসটা আবার touch হলে রিফ্রেশ হয়)। schema.sql-এর invoiceItems কমেন্টে বিস্তারিত।
- নতুন `tests/datastore-invoiceitems-tests.mjs` (১০ কেস, `getProductSalesRows()` বনাম `computeProductSales()` সরাসরি প্যারিটি-তুলনাসহ — বাগ-ফিক্স রিগ্রেশন কেসও আছে) + `tests/logic-tests.mjs`-এ `computeProductSales()`-এর ৬টা নতুন কেস (বাগ-ফিক্স রিগ্রেশনসহ)। `npm test` — **২১৬ কেস, সব পাস** ✅, `npm run lint` — **0 error** ✅, `npm run build` — ক্লিন ✅।

**পরের সেশনে সবার আগে করণীয়**: **real-device স্মোক-টেস্ট** (এন্ট্রি ৪৪-৪৮-এর সব পরিবর্তন একসাথে — এখনো একবারও করা হয়নি) — AI চ্যাটে "মেয়াদ"/"এক্সপায়ার", "স্টক শেষ", "সেরা পণ্য"/"বেস্টসেলার", "ফার্মেসি কেমন চলছে" জিজ্ঞেস করে SQL চালু অবস্থায় আগের (ফিক্সড) মতোই দেখাচ্ছে কিনা যাচাই। **AIPage_ সাব-প্যাটার্ন ৪/৪ শেষ হওয়ায় এন্ট্রি ৪১-এর "বাকি কাজ" তালিকার পরের আইটেম** — ধাপ ৭ (products boot-load lazy) বা Customers SQL cutover-এর দিকে এগোনো যেতে পারে।

**🟡 এন্ট্রি ৪৭ (সুপারসিডেড — এন্ট্রি ৪৮-এ ৪র্থ সাব-প্যাটার্নও শেষ)**: AIPage_-এর ৪টা সাব-প্যাটার্নের মধ্যে ৩য়টা (expired/near-expiry স্ক্যান) SQL cutover সম্পূর্ণ — কোড-সম্পূর্ণ, sandbox-ভেরিফায়েড (`npm test` ১৯৬ কেস, `npm run lint` 0 error, `npm run build` ক্লিন)। নতুন SQL/DataStore ফাংশন লাগেনি — InventorySection-এ (এন্ট্রি ৩৬) বানানো `dsGetExpiryCandidates()` (নতুন কিছু না, `nearest_expiry_date` ইনডেক্স-সিক করে candidate সেট ছোট করা) সরাসরি পুনর্ব্যবহার করে নতুন `useExpiryCandidates()` হুক। এই হুক শুধু candidate সেট (SQL চালু থাকলে ছোট narrowed সেট, নাহলে পুরো `prodAll`) রিটার্ন করে — আসল expired/near বিভাজন (read-time `new Date()` তুলনা) আগের মতোই `ruleBasedAnswer()`-এর ভেতরে JS-এই থাকছে (InventorySection-এর প্যাটার্নের সাথে সামঞ্জস্যপূর্ণ — staleness ঝুঁকি নেই)।

**🟢 এন্ট্রি ৪৬**: AIPage_ সাব-প্যাটার্ন ২/৪ (`outOfStock`/`prodAll.length`) SQL cutover সম্পূর্ণ, এন্ট্রি ৪৭-এ `npm test`+lint+build দিয়ে পুনরায় কনফার্মড। বিস্তারিত এন্ট্রি ৪৬ দ্রষ্টব্য।

**🟢 এন্ট্রি ৪৫**: AIPage_ সাব-প্যাটার্ন ১/৪ (`stockValue`/`lowStockItems`) SQL cutover সম্পূর্ণ। বিস্তারিত এন্ট্রি ৪৫ দ্রষ্টব্য।

**🟢 এন্ট্রি ৪৪**: এন্ট্রি ৪৩-এ চিহ্নিত ৪টা FULL-SCAN ব্লকারের মধ্যে ৩টা সম্পূর্ণ SQL cutover — কোড-সম্পূর্ণ। বিস্তারিত এন্ট্রি ৪৪ দ্রষ্টব্য।

**📌 স্থায়ী নির্দেশনা (ব্যবহারকারীর ফাইনাল সিদ্ধান্ত, ১৫ আগস্ট ২০২৬)**: "আমি অ্যাপের সব SQL করব, এটাই ফাইনাল।" — অর্থাৎ কোনো ফিচার/হিসাব "in-memory থেকে যথেষ্ট লাভ নেই" বা "ঝুঁকিপূর্ণ" বলে স্কিপ করার প্রস্তাব দেওয়া চলবে না; বরং safest ইমপ্লিমেন্টেশন-স্ট্র্যাটেজি বেছে এগোতে হবে (যেমন এন্ট্রি ৪১-এ: normalizeSupplierKey()-এর মতো regex/fuzzy-matching লজিক SQL-এ regex দিয়ে রেপ্লিকেট না করে, JS-এই write-time-এ প্রিকম্পিউট করে ফ্ল্যাট কলামে বসানো, শুধু GROUP BY/SUM SQL-এ)। প্রতিটা নতুন ধাপে এই নীতি মাথায় রাখা জরুরি।

**🟢 এন্ট্রি ৪১**: ধাপ ৬ (SupplierPaymentModule/computeSupplierDueMap) SQL cutover সম্পূর্ণ — sandbox-ভেরিফায়েড + SQL-vs-JS সরাসরি প্যারিটি-টেস্টেড (৮ কেস, সব মিলেছে)। `computeSupplierDueMap()` products+purchaseOrders+supplierPayments জুড়ে ফাজি সাপ্লায়ার-নাম merge করে (`normalizeSupplierKey()` — regex+typo-alias)। এই normalize-লজিক SQL-এ regex দিয়ে রেপ্লিকেট না করে, `product`/`purchaseOrders`/নতুন `supplierPayments` টেবিলে write-time-এ (JS extract()) `supplier_due_key`(normalized)/`supplier_due_raw` কলাম প্রিকম্পিউট, `purchaseOrders`-এ `purchase_amount` (items reduce, batches-এর মতোই নেস্টেড JSON JS-এই পার্স)। নতুন `getSupplierDueRows()` — CTE দিয়ে raw-name UNION → canonical (দীর্ঘতম ভ্যারিয়েন্ট) বাছাই → ৩ টেবিল জুড়ে LEFT JOIN SUM। নতুন `useSupplierDueRows()` শেয়ার্ড হুক (`Dashboard` ও `SupplierPaymentModule` দুই জায়গাতেই — এন্ট্রি ৩৭/৩৮-এর ডুপ্লিকেট-লজিক-এড়ানো নীতি)। **বাগ ধরে ঠিক করা হয়েছে**: `SupplierPaymentModule`-এর `paymentSummary` raw (non-canonical) সাপ্লায়ার-নাম দিয়ে lookup করে — SQL পাথে `rawVariants` (group_concat) না আনলে এই lookup ভুলভাবে 0 দিত; ফিক্স করা হয়েছে। ⚠️ স্বীকৃত non-financial edge-case: দুটো ভিন্ন raw-নাম-ভ্যারিয়েন্ট ঠিক একই length হলে canonical *ডিসপ্লে-নাম* বাছাইয়ে SQL vs JS ভিন্ন হতে পারে (টাকার হিসাবে কোনো প্রভাব নেই)। `npm test` (১৭৩ কেস) + golden-master (১৫) + fuzz + lint (0 error) + build — সব ক্লিন।

**🟡 এন্ট্রি ৪০**: ধাপ ৫ (POS product picker/SmartInvoiceBuilder) কোড-সম্পূর্ণ — sandbox-ভেরিফায়েড, **real-device স্মোক-টেস্ট এখনো বাকি (বিশেষভাবে জরুরি, বিলিং কাউন্টার)**। এন্ট্রি ৩২-এর দুই ডিজাইন-বিকল্পের মধ্যে (খ) বাছা হলো — `queryPage()` কোর ফাংশন বদলানো হয়নি, বরং নতুন `browse_rank` কম্বাইন্ড sort-key কলাম (tier digit + name, single-column lexicographic sort দিয়েই effectively ৩-স্তরের অর্ডার)। নতুন `product_type`/`category` কলামও (ক্যাটাগরি WHERE-ফিল্টারের জন্য)। **নিরাপত্তা-ডিজাইন**: SQL শুধু এই পেজের product-id অর্ডার দেয় — প্রতিটা কার্ড তারপরও live `products` state (`productsByIdMap`) থেকে রেন্ডার হয়, SQL row-এর JSON snapshot সরাসরি রেন্ডার হয় না (entry 30-এর Products list ব্রাউজ থেকে ইচ্ছাকৃতভাবে ভিন্ন) — তাই dual-write lag থাকলেও ভুল স্টক-আউট পণ্য দেখানো/বিক্রি করার ঝুঁকি নেই। সার্চ-অ্যাক্টিভ মোড সম্পূর্ণ অপরিবর্তিত (JS/hybrid FTS)। **⚠️ পরবর্তী সেশনে সবার আগে করণীয়: dev panel/real device দিয়ে POS picker-এ ক্যাটাগরি ফিল্টার, স্ক্রল-পেজিনেশন, আর স্টক-আউট পণ্য সত্যিই শেষে/disabled দেখাচ্ছে কিনা যাচাই করা।**

**🟢 এন্ট্রি ৩৯**: এন্ট্রি ৩৮-এর স্ক্রিনশটে চিহ্নিত অবশিষ্ট অংশ — `stockValue`/`lowStockItems`/`monthExpiredValue`/`monthExpiredCount` (products-নির্ভর) SQL cutover সম্পূর্ণ। নতুন `stockMovements` টেবিল (শুধু `source='expired_removal'` প্রাসঙ্গিক)। `getInventoryCounts()`-এ (এন্ট্রি ৩৬-এর একই ফাংশন, InventorySection-এর সাথে শেয়ার্ড) `stock_value` কলাম যোগ হলো — নতুন কোনো ফাংশন লাগেনি, `critical` কাউন্টই lowStockItems-এর সংখ্যার সমতুল্য। নতুন `getExpiredRemovalTotals()`। দুটো নতুন শেয়ার্ড হুক (`useProductStockTotals`/`useExpiredRemovalTotals`) `useKpiStats`-এ বসানো হয়েছে; `useKpiStats`-এর রিটার্ন ফিল্ড `lowStockItems` (array) → `lowStockCount` (number) রিনেম হয়েছে (`KpiCardsGrid` শুধু `.length` ব্যবহার করত)। ⚠️ **এন্ট্রি ৪১-এ সুপারসিডেড নোট**: এই এন্ট্রিতে "`AIPage_`-এর নিজস্ব stockValue/lowStockItems JS-ই থাকবে, `products` in-memory থাকা অবস্থায় লাভ নেই" যুক্তি দেওয়া হয়েছিল — এন্ট্রি ৪১-এর "সব SQL" নির্দেশনার পরে এই যুক্তি আর প্রযোজ্য না, ভবিষ্যতে এটাও SQL-এ আনতে হবে (নিচে "বাকি কাজ" দেখুন)। **useKpiStats-এর ৫টা ডেটা-সোর্স + products-নির্ভর অংশ — ধাপ ৩ পুরোপুরি ও পুরোপুরিভাবে শেষ।**

**🟢 এন্ট্রি ৩৮**: useKpiStats-এর ধাপ ৩ (`useKpiStats` টেবিল) সম্পূর্ণ — বাকি ৪টা ডেটা-সোর্স (`cashLogs`/`purchaseOrders`/`txns`/`returns`) SQL cutover। টেবিল+dual-write+ডোমেইন-স্পেসিফিক অ্যাগ্রিগেট ফাংশন (`getCashLogTotal`/`getPurchaseOrderTotals`/`getTxnTotals`/`getReturnsTotals`, শেষ দুইটায় invoices-এর সাথে voided-বাদ NOT EXISTS সাব-কোয়েরি)। এন্ট্রি ৩৭-এর মতোই শেয়ার্ড হুক প্যাটার্ন (`useCashLogTotals`/`usePurchaseOrderTotals`/`useTxnTotals`/`useReturnsTotals`) — `useKpiStats` ও `AIPage_` দুই জায়গাতেই একই সোর্স, যাতে ভবিষ্যতে duplicate-JS-logic বাগ (এন্ট্রি ৩৭-এর আগে ঠিক এই কারণে হয়েছিল) আর না ঘটে। `returnsTotals` হুক শুধু today/month কভার করে — `AIPage_`-এর সাপ্তাহিক (`week*`) হিসাব এখনো লোকাল JS।

**📋 এন্ট্রি ৪১-এর পরে বাকি কাজ (এন্ট্রি ৪০-এর real-device টেস্ট বাদে)**: "সব SQL" নির্দেশনা অনুযায়ী এখনো JS-এ থাকা বড় অংশগুলো — (১) `AIPage_`-এর নিজস্ব `stockValue`/`lowStockItems`/cashLogs/purchaseOrders-এর সাপ্তাহিক (week*) হিসাব (এন্ট্রি ৩৮/৩৯-এ ইচ্ছাকৃতভাবে স্কিপড ছিল, এখন আর না), (২) ধাপ ৭ (products boot-load lazy — মূল মেমরি-সাশ্রয়ের ধাপ), (৩) Customers SQL cutover। প্রতিটাতেই "নেস্টেড/regex-নির্ভর অংশ JS-এ প্রিকম্পিউট, শুধু aggregation SQL-এ" নীতি অনুসরণ করা।

⚠️ **এন্ট্রি ৩৮-এ আবিষ্কৃত গ্যাপ (এখনো প্রযোজ্য)**: আপলোড করা zip-এ `package.json`-এর `test` স্ক্রিপ্ট রেফারেন্স করা `tests/datastore-expenses-tests.mjs` (এন্ট্রি ৩৭) ও `tests/datastore-inventory-tests.mjs` (এন্ট্রি ৩৬) ফাইল দুটোই অনুপস্থিত পাওয়া গেছে (এন্ট্রি ৩৩-৩৫-এর মতো আরেকটা "হারানো ফাইল" প্যাটার্ন)। দুটোই পুনর্গঠন করা হয়েছে (মূল সংস্করণের সাথে হুবহু না মিললেও একই ফাংশনগুলোর মূল আচরণ/edge-case কভার করে)। **পরের সেশনে জিপ ডাউনলোড করার পর `npm test` একবার লোকালি চালিয়ে নিশ্চিত হওয়া ভালো যে এই পুনর্গঠিত ফাইলগুলো ঠিকমতো এসেছে।**

**🟢 এন্ট্রি ৩৭**: useKpiStats-এর ৫টা ডেটা-সোর্সের মধ্যে প্রথমটা (`expenses`) SQL cutover সম্পূর্ণ — টেবিল+dual-write+todayExpense/monthExpense অ্যাগ্রিগেট, `npm test`+lint+build ক্লিন। বাকি ৪টা (`txns`/`cashLogs`/`purchaseOrders`/`returns`) এন্ট্রি ৩৮-এ সম্পূর্ণ হলো।

**🟢 এন্ট্রি ৩৬**: ধাপ ২ (InventorySection/Dashboard KPI+ডিটেইল লিস্ট+সাপ্লায়ার-গ্রুপিং) SQL cutover কোড-সম্পূর্ণ, `npm test`+lint+build ক্লিন — real-device টেস্ট বাকি। এন্ট্রি ৩৩-৩৫ ইচ্ছাকৃতভাবে স্কিপড (আলাদা চ্যাটের POS-availability-sweep ডিজাইন, কখনো এই zip-এ আসেনি, বাদ দেওয়া হয়েছে — বিস্তারিত এন্ট্রি ৩৬ দ্রষ্টব্য)।

**🟡 এন্ট্রি ৩২ (কোড এন্ট্রি ৪০/৪১-এ সম্পূর্ণ হয়েছে)**: ধাপ ৫ (POS picker) ও ধাপ ৬ (SupplierPaymentModule)-এর ডিজাইন-অডিট — যথাক্রমে এন্ট্রি ৪০/৪১-এ implement হয়েছে। **পরবর্তী কাজ: real-device স্মোক-টেস্ট (এন্ট্রি ৪০, POS picker) → ধাপ ৭ (products lazy-load) → Customers SQL cutover → এন্ট্রি ৪১-এর "বাকি কাজ" তালিকা (AIPage_-এর অবশিষ্ট JS অংশ)।**

**🟡 এন্ট্রি ৩১-এর সিদ্ধান্ত (আংশিক সুপারসিডেড — এন্ট্রি ৩৬ দেখুন)**: এই সেশনে ব্যবহারকারী স্পষ্টভাবে চেয়েছেন products/customers পুরোপুরি SQL-based হোক (শুধু ধাপ ৭-এর অপেক্ষায় থাকা না) — তাই ধাপ ২ (এন্ট্রি ৩৬-এ) এগিয়ে নেওয়া হয়েছে, "products মেমরিতেই থাকবে বলে লাভ নেই" যুক্তি সত্ত্বেও (ঝুঁকি ছোট/নিয়ন্ত্রিত ছিল বলে)। বাকি ধাপ ৬/৭ একই যুক্তিতে এগোবে।

**টার্গেট স্কেল**: ১,০০,০০০ প্রোডাক্ট · ১০,০০০ কাস্টমার · ১,০০,০০,০০০ (১ কোটি) ইনভয়েস — বর্তমান টেস্ট শপের ডেটা (২২৩৬/১৭/৬৩০) এই লক্ষ্যের তুলনায় প্রায় নগণ্য, তাই "এখন সমস্যা হচ্ছে না" কোনো নির্ভরযোগ্য সংকেত না।

### ✅ সম্পূর্ণ ও real-device ভেরিফায়েড
Schema+FTS5 · dual-write (shadow) · resumable batch backfill · row-count verify টুল · ANALYZE (auto+manual) · BD timezone ফিক্স · normName() সিঙ্ক · হাইব্রিড সার্চ (৪ কল-সাইট) · getState() write-through Map (৭ কল-সাইট) · processReturn() রিটার্ন ফ্লো।

### ✅ এন্ট্রি ২৪-২৫ কোড-সম্পূর্ণ, sandbox-ভেরিফায়েড — real-device টেস্ট বাকি
1. **Boot-time full invoice backfill সরানো হয়েছে** — App.jsx-এর boot sequence এখন কখনো পুরো invoice history state-এ আনে না, স্থায়ীভাবে ৬-মাস windowed থাকে (archiveOldInvoices()-এর কাটঅফের সাথে সিঙ্কড)।
2. **`queryPage()` — keyset pagination, এবং এন্ট্রি ২৫-এ একটা গুরুতর বাগ ফিক্স হলো**: এন্ট্রি ২৪-এ লেখা "keyset ~৩× দ্রুত" দাবিটা ভুল ছিল — আসল কোডে (ও বেঞ্চমার্ক স্ক্রিপ্টে) cursor কন্ডিশন `sortColumn < ? OR (sortColumn = ? AND id < ?)` আকারে OR দিয়ে লেখা ছিল, যা SQLite-কে ইনডেক্স **SEEK** করতে দেয় না — পুরো ইনডেক্স **SCAN** করে (EXPLAIN QUERY PLAN দিয়ে যাচাই করা হয়েছে), মানে বাস্তবে OFFSET-এর সমান বা তার চেয়েও ধীর ছিল (১০ লাখ স্কেলে বাস্তবে মাপা গেছে: OFFSET ১২.৬ms, "keyset" ছিল ২৪-৪০ms — উল্টো ধীর!)। **ফিক্স**: row-value tuple comparison — `(sortColumn, id) < (?, ?)` — যা SQLite ৩.১৫+-এ সত্যিকারের ইনডেক্স SEEK-এ কম্পাইল হয় (EXPLAIN QUERY PLAN-এ এখন "SEARCH ... USING INDEX")। ফিক্সের পর বাস্তব ফল: ১০ লাখ স্কেলে ~৪২× দ্রুত, ৩০ লাখ স্কেলে ~১৫০× দ্রুত (গভীরতা বাড়ার সাথে সুবিধা বাড়ে, যেমনটা আসলে হওয়ার কথা)। `DataStore.js`-এর `queryPage()` ও বেঞ্চমার্ক স্ক্রিপ্ট দুটোই ফিক্স হয়েছে।
3. **DB ফাইল-সাইজ মাপার বাগ ফিক্স কনফার্মড** — সাইজ এখন `PRAGMA wal_checkpoint(TRUNCATE)`-এর পর মাপা হয় (WAL মোডে আগে uncheckpointed ডেটা `.db-wal`-এ থেকে যেত, মূল ফাইলের সাইজ কম দেখাত)। checkpoint-পরবর্তী ও `db.close()`-পরবর্তী সাইজ এখন সবসময় মিলছে (যাচাই করা হয়েছে একাধিক স্কেলে)।
4. **১ কোটি স্কেল বেঞ্চমার্ক — এন্ট্রি ২৬-এ সম্পূর্ণ কনফার্মড (chunked run, real numbers)**: মোট ইনভয়েস-ইনসার্ট সময় **~১৪ মিনিট ২৪ সেকেন্ড** (প্রতি-রো খরচ ~৫৮ লাখ রো-র পর প্লাটো ধরেছে, ~৯৯-১০৩µs/রো-তে স্থির — অসীম বাড়েনি)। DB ফাইল সাইজ **৩৫৪২ MB (~৩.৫ GB)**, আগের প্রক্ষেপণের প্রায় হুবহু কাছাকাছি।
5. **DB ফাইল সাইজ স্কেলিং কনফার্মড**: ~৩.৫ GB @ ১ কোটি ইনভয়েস (এন্ট্রি ২৫-এর ~৩.৬ GB প্রক্ষেপণ সঠিক প্রমাণিত)। বাজেট Android ফোনে (৫০০ দোকানে ছড়িয়ে) storage/backup সময়ের জন্য এখনো গুরুত্বপূর্ণ বিবেচ্য বিষয়।
6. **keyset পেজিনেশন ১ কোটি স্কেলে ~৯১৩× দ্রুত** (offset ৫০ লাখে) — গভীরতা বাড়ার সাথে স্পিডআপ বাড়তে থাকা কনফার্মড।
7. **🟡 নতুন নোট**: "আজকের ইনভয়েস লিস্ট" কোয়েরি ১ কোটি স্কেলে ১২১ms (আগে ছোট স্কেলে <৬ms) — সম্ভবত `(date_key, created_at)` কম্পোজিট ইনডেক্সের অভাবে সর্ট-টাইম। ব্লকার না, কিন্তু ভবিষ্যতে ফিক্সযোগ্য।

### 🔴 ব্লকার — বাকি
- (Boot backfill, queryPage() keyset SEEK বাগ, DB-সাইজ মাপা ও ১ কোটি স্কেল কনফার্মেশন, archiveOldInvoices() dual-write ডিলিট বাগ (এন্ট্রি ২৮), Products pagination (এন্ট্রি ৩০) — সবকটা সমাধান ও npm test/real-device কনফার্মড — কোনো কোড-লেভেল ব্লকার এই মুহূর্তে চিহ্নিত নেই)
- ✅ **এন্ট্রি ২৮ ও ৩০ — `npm test` দিয়ে কনফার্মড (২০২৬-০৮-১৪)**: CI-এর Node ভার্সন `20`→`22` বাম্প করা হয়েছে (`node:sqlite` শিমের জন্য প্রয়োজন), এরপর সব টেস্ট suite pass।
- ✅ **টেস্ট শপে real-device যাচাই কনফার্মড**: fresh backfill (products/customers/invoices সব 100%), Products লিস্ট pagination/endReached স্ক্রল, ALTER TABLE গার্ড পুরনো DB-তে ক্র্যাশ-ফ্রি বুট — সব দেখা হয়েছে।
- **এখনো বাকি**: এন্ট্রি ২৪-২৬-এর ১ কোটি স্কেল বেঞ্চমার্ক (boot টাইম/মেমরি, keyset pagination স্পিড) সার্ভার/ডেস্কটপ CPU-তে হয়েছিল — বাজেট Android ফোনে বড় স্কেলে (টেস্ট শপের বর্তমান ডেটা ~২২৩৬ প্রোডাক্ট, টার্গেট ১ লাখ) এখনো মাপা হয়নি।

### 🟡 দরকারি, ব্লকার না
4. ✅ Read-path cutover — invoice history (ReturnModule) অংশ এন্ট্রি ২৯-এ সম্পূর্ণ। Products main list ডিফল্ট-ব্রাউজ অংশ এন্ট্রি ৩০-এ সম্পূর্ণ এবং **npm test + real-device দুটোই কনফার্মড**। POS product picker (SmartInvoiceBuilder) অংশ এখনো ইচ্ছাকৃতভাবে অস্পৃষ্ট (কারণ এন্ট্রি ৩০-এ ডকুমেন্টেড) — future scope, `PRODUCTS_ONDEMAND_MIGRATION_PLAN.md`-এর ধাপ ৫।
5. ১৬টা Virtuoso লিস্টের মধ্যে invoices ও products-কে async pagination দিতে হবে (stale-response/sequence-token guard সহ)। customers (টার্গেট ১০ হাজার) মেমোরিতেই থাকতে পারে, pagination লাগবে না।
6. Scientist-স্টাইল shadow-compare (Phase ৭) — এখনো ডিজাইন হয়নি, শুধু নাম উল্লেখ ছিল।
7. `FTS_NARROW_THRESHOLD = 5000` (App.jsx লাইন ৫২) — ১ লাখ প্রোডাক্ট টার্গেটে এই থ্রেশহোল্ড এখনো ঠিক আছে কিনা রিভিজিট করা দরকার।

### 🟢 কম জরুরি
8. customers/invoices resumable migration আলাদাভাবে টেস্ট (ঐচ্ছিক, একই কোড-পাথ ব্যবহার করে)
9. একাধিক শপে টেস্ট (এখনো শুধু ১টা টেস্ট শপ)
10. `capacitor-google-auth` RC ভার্সন (এন্ট্রি ২০) real-device কনফার্ম
11. RFM materialization (এন্ট্রি ২৮) — customers টেবিলে `ltv`/`segment`/`days_since`/`risk_score` কলাম যোগ + প্রতি invoice/txn write-এ ইনক্রিমেন্টাল আপডেট (denormalization); সিদ্ধান্ত হয়ে গেছে `ltv` সত্যিকারের lifetime value হবে (archive সহ), কিন্তু ডিজাইনই এখনো শুরু হয়নি — নতুন write-path লজিক, নতুন সিঙ্ক-বাগের সম্ভাবনা, স্কোপ বড়
12. **products on-demand migration** (এন্ট্রি ২৯-এর পরে শুরু হওয়া বহু-সেশন প্রজেক্ট) — সম্পূর্ণ প্ল্যান+২০-কম্পোনেন্ট কল-সাইট ইনভেন্টরি এখন `PRODUCTS_ONDEMAND_MIGRATION_PLAN.md`-তে; নতুন সেশনে এই ফাইলটাও আপলোড করে চালিয়ে যেতে হবে

### প্রস্তাবিত অর্ডার
🔴-এর তিনটা আগে (একে অপরের উপর নির্ভরশীল — pagination ঠিক না করে boot backfill ফিক্স করলেও লিস্ট UI-তে একই সমস্যা থেকে যাবে) → তারপর ৪-৫-৬-৭ একটা করে আলাদা সেশনে।

---

## এন্ট্রি লগ

### [এন্ট্রি ৬৬] — reorderAlerts dead-prop UI + invoice history payType SQL-WHERE গ্যাপ ফিক্স

**তারিখ**: ১৮ আগস্ট ২০২৬। **প্রসঙ্গ**: ব্যবহারকারী "বাকি কাজগুলো শুরু করুন" বললেন। ২টা 🔴 জরুরি আইটেম (boot-lazy real-device টেস্ট, POS real-device টেস্ট) নিজেদের সংজ্ঞা অনুযায়ীই sandbox-এ করা যায় না — sandbox কখনো real Android device/Capacitor SQLite bridge simulate করতে পারে না। এর বদলে জমে থাকা তালিকার দুটো নিরাপদ, sandbox-এই সম্পূর্ণযোগ্য 🟡 আইটেম নেওয়া হলো।

**১. `reorderAlerts` dead prop → লাইভ UI**: `InventorySection`-এ নতুন কার্ড (stockOut/critical কার্ডগুলোর নিচে, শর্তসাপেক্ষে দৃশ্যমান — `reorderAlerts.length > 0`) — red-status কাউন্ট ব্যাজ + প্রথম ৩টা পণ্যের নাম প্রিভিউ। ট্যাপে নতুন ফুলপেজ (`invModal==='reorder'`, Dashboard-এর বিদ্যমান all/critical/out/expired/near-expiry কন্ডিশনের ঠিক আগে আলাদা early-return ব্লক হিসেবে — ডেটা-শেপ ভিন্ন বলে সাপ্লায়ার-গ্রুপিং লজিকে মেশানো হয়নি) যেখানে প্রতিটা আইটেমের stock/avgDaily/daysLeft/suggestedQty status-কালার-কোডেড (red ≤7 দিন, yellow ≤14, green) লিস্টে দেখা যায়। `reorderAlerts` prop `Dashboard`-এর `<InventorySection>` কল-সাইটে (আগে পাস হতো না) যোগ করা হলো।

**২. Invoice history `payType` SQL-WHERE গ্যাপ ফিক্স**: `loadInvHistPage()`-এ আগে SQL WHERE শুধু customer_id/date_key কভার করত — payType সবসময় বড়-limit (১ লাখ) fetch + JS `matchesFilter()`-এই প্রয়োগ হতো, কারণ `invoices` টেবিলে `pay_type` কলামই ছিল না। **স্কিমা-চেঞ্জ**: `schema.sql`-এ নতুন `pay_type TEXT` কলাম + `idx_invoices_pay_type(pay_type, date_key)` ইনডেক্স। `HOT_FIELDS.invoices`-এ `columns`/`extract()` দুটোতেই `pay_type`/`inv.payType ?? null` যোগ — dual-write স্বয়ংক্রিয়ভাবে নতুন/এডিটেড ইনভয়েসে পপুলেট করবে। পুরনো ইনস্টলের জন্য এন্ট্রি ৫৭/৫৮-এর প্রতিষ্ঠিত `_addMissingCols()` প্যাটার্নেই `getDb()`-এ `invoices` টেবিলের ALTER TABLE গার্ড।

**⚠️ ইচ্ছাকৃত নিরাপত্তা-সিদ্ধান্ত (দুই নম্বর আইটেমে)**: এই ফিক্সের আগে dual-write হওয়া পুরনো রো-গুলোতে `pay_type` এখনো NULL (resumable backfill এখনো চালানো হয়নি এই কলামের জন্য) — তাই SQL WHERE-এ সরাসরি `pay_type = ?` না দিয়ে `(pay_type = ? OR pay_type IS NULL)` ব্যবহার করা হয়েছে, যাতে ব্যাকফিল-না-হওয়া পুরনো রো ভুলবশত বাদ না পড়ে। `matchesFilter()` (JS) এখনো চূড়ান্ত সঠিকতার উৎস অপরিবর্তিত রাখা হয়েছে — SQL শুধু narrowing/performance optimization, কোনো নতুন correctness ঝুঁকি নেই। ব্যাকফিল সম্পূর্ণ হলে এই OR-শর্ত কার্যত no-op হয়ে যাবে এবং আসল speed-up (কম রো ফেচ) পুরোপুরি সক্রিয় হবে।

**যাচাই**: `npm install` (নেটওয়ার্ক কাজ করেছে) → `npm test` সব ১৪টা সুইট সব পাস ✅ → `npm run lint` 0 error (৫৬৬ প্রি-এক্সিস্টিং warning, অপরিবর্তিত) ✅ → `npm run typecheck` ক্লিন ✅ → `npm run build` ক্লিন ✅ → `test:golden-master` (৭/৭) ও `test:fuzz` (সব প্রপার্টি) পাস ✅।

**⚠️ real-device স্মোক-টেস্ট এখনো বাকি** এই দুটো পরিবর্তনেরও — জমে থাকা তালিকায় যোগ হলো (বিশেষত নতুন reorder-widget UI প্রথমবার দেখা হবে)।

**📁 এই সেশনে যেসব ফাইল বদলেছে**:
- `src/App.jsx` — `InventorySection` (নতুন `reorderAlerts` prop + কার্ড), `Dashboard`-এর `<InventorySection>` কল-সাইট (prop পাস), নতুন `invModal==='reorder'` ব্লক, `loadInvHistPage()`-এর SQL WHERE
- `src/db/schema.sql` — `invoices` টেবিলে `pay_type` কলাম + ইনডেক্স
- `src/db/DataStore.js` — `HOT_FIELDS.invoices`, `getDb()`-এর ALTER TABLE গার্ড
- `SQLITE_MIGRATION_LOG.md` — এই এন্ট্রি

কোনো নতুন ফাইল তৈরি হয়নি।

---

### [এন্ট্রি ৫৮] — sequential ALTER TABLE লেটেন্সি ফিক্স (PRAGMA table_info() গার্ড)

**প্রেক্ষাপট**: এন্ট্রি ৫৭-এর `getDb()` promise-cache ফিক্স আপডেট করে ডিভাইসে দেওয়ার পরও ব্যবহারকারী রিপোর্ট করলেন এখনো প্রতিবার অ্যাপ খুললে/আপডেট দিলে "পণ্য আসতে লেট হচ্ছে" — বন্ধ করে-খুলে টেস্ট করেও একই।

**তদন্ত**: প্রথমে সন্দেহ হয় এটা এই সেশনেরই কোনো নতুন কোড (RFM হুক ইত্যাদি) দায়ী কিনা। ব্যবহারকারীকে `isSqliteEnabled()` flag বন্ধ করে টেস্ট করতে বলা হয় — ফলাফল: **flag বন্ধ করলে ইনস্ট্যান্ট, কোনো লেট নেই।** এটা কনফার্ম করে সমস্যাটা SQL-লেয়ারেই (নতুন RFM কোড না, কারণ Customers ট্যাবে না গেলে RFM কোয়েরি ফায়ারই হয় না)।

**Root cause**: `_initDb()`-এ প্রতিটা cold-boot-এ ১৩টা `ALTER TABLE` কল sequentially await হয় — প্রতিটা আলাদা JS↔Native bridge round-trip। ব্যবহারকারীর ডিভাইসে সব কলাম আগে থেকেই আছে (মাসের পর মাস dual-write চলছে), তাই প্রতিটা ALTER আসলে "duplicate column" এরর দিয়ে ব্যর্থ হয় (try/catch-এ ধরা পড়ে) — কিন্তু ব্যর্থ হওয়ার আগেও প্রতিটাই একটা পূর্ণ round-trip খরচ করে। এন্ট্রি ৫৭-এর promise-cache ফিক্স শুধু *সমান্তরাল duplicate init* রেস আটকেছিল (একাধিক হুক একসাথে বুট-এ সংঘর্ষ করা বন্ধ হয়েছে), কিন্তু একটামাত্র init-এর ভেতরের এই ১৩-ধাপ sequential ALTER চেইনের খরচ কমায়নি — তাই "র‍্যান্ডম মাঝেমধ্যে এরর" বাগটা ফিক্স হলেও "সবসময় কয়েক সেকেন্ড লেট" আচরণটা persist করছিল, যেটা আগে race-condition-এর কারণে মাঝে মাঝে fast-fail (ফাঁকা ডেটা) হয়ে "instant" মনে হতো — আসলে ডেটাই লোড হতো না।

**ফিক্স**: ব্লাইন্ডলি ১৩ বার ALTER চেষ্টা না করে, প্রতিটা টেবিলে (`products`, `purchaseOrders`, `txns`) একবার `PRAGMA table_info(table)` দিয়ে আসল কলাম-সেট পড়ে নিয়ে, শুধু সত্যিই অনুপস্থিত কলামের জন্যই `ALTER TABLE` চালানো হচ্ছে (`_existingCols()`/`_addMissingCols()` হেল্পার, `src/db/DataStore.js`)। একেবারে নতুন DB-তে (টেবিল এখনো তৈরি হয়নি) `PRAGMA table_info()` খালি রেজাল্ট দেয় (এরর থ্রো করে না) — needed[] থেকে কিছুই ALTER হয় না, কারণ নিচের `CREATE TABLE IF NOT EXISTS`-এই সব কলাম থাকবে। পুরনো fully-migrated ইনস্টলে এখন প্রতি বুটে ১৩টা ALTER round-trip-এর জায়গায় ৩টা fast PRAGMA metadata query, ALTER সাধারণত ০টা।

**⚠️ ভেরিফিকেশন-ঋণ**: এই সেশনে sandbox-এ নেটওয়ার্ক অ্যাক্সেস ছিল না, তাই `npm test`/`lint`/`typecheck`/`build` চালানো যায়নি — শুধু `node --check` দিয়ে সিনট্যাক্স ভ্যালিডেট করা হয়েছে। **পরবর্তী বাধ্যতামূলক ধাপ**: (১) real device-এ existing test suite চালানো, (২) flag চালু/বন্ধ দুই অবস্থাতেই cold-boot করে লেটেন্সি আসলেই কমেছে কিনা যাচাই, (৩) পুরনো ইনস্টলে (যেখানে কলাম আগে থেকেই আছে) এবং নতুন/আংশিক-মাইগ্রেটেড ইনস্টলে (যেখানে সত্যিই ALTER দরকার) — দুই ধরনের ডিভাইসেই ডেটা ঠিকভাবে লোড হচ্ছে কিনা কনফার্ম করা।

---

### [এন্ট্রি ৫৭] — getDb() cold-boot race ফিক্স + allSupplierNames dedup + Customers RFM/LTV SQL cutover (txns.customer_id স্কিমা-অ্যাড সহ)

**তারিখ**: ১৭ আগস্ট ২০২৬। **প্রসঙ্গ**: ব্যবহারকারী এক সেশনে সম্পূর্ণ Phase ৩ চাইলেন। প্রথমবার sandbox-এ নেটওয়ার্ক কাজ করায় (`npm install` সফল) — পুরো সেশন real `npm test`/`lint`/`typecheck`/`build` দিয়ে ভেরিফায়েড করা গেছে (আগে সম্ভব ছিল না)।

**১. `getDb()` cold-boot race ফিক্স (`src/db/DataStore.js`)** — ব্যবহারকারীর রিপোর্ট করা "স্টক ডেটা লোড করা যায়নি (SQL ব্যর্থ)" ব্যানারের root cause। আগে `_dbCache` শুধু resolved connection cache করত, in-flight promise না — বুট-এ একই businessType-এর জন্য একাধিক হুক (useInventoryData, useKpiStats-এর একাধিক সোর্স ইত্যাদি) প্রায় একই সময়ে `getDb()` কল করলে সবাই cache-miss পেয়ে সমান্তরালে `db.open()`+schema-execute+১২টা ALTER TABLE চালানো শুরু করে দিত — সংঘর্ষে একটা কল থ্রো করত। ফিক্স: নতুন `_dbPromiseCache` Map — in-flight promise সিঙ্ক্রোনাসভাবেই cache-এ বসানো হয়, সব concurrent caller একই promise-এ await করে; ব্যর্থ হলে cache থেকে সরানো হয় (retry-able)।

**২. `allSupplierNames` dedup (Dashboard, `src/App.jsx`)** — আগে পুরো `products` অ্যারে আবার স্ক্যান করে সাপ্লায়ার নাম বের করা হতো, যদিও ঠিক একই key (`company||category||"অজ্ঞাত"`) `useInventoryData()`-এর `inv.supplierList`-এ ইতিমধ্যে কম্পিউট হয়েই থাকে। Bengali-locale sort অপরিবর্তিত রাখা হয়েছে আউটপুট-প্যারিটির জন্য।

**৩. Customers RFM/LTV SQL cutover** — সবচেয়ে বড় অংশ। App.jsx-এর `Customers` কম্পোনেন্টের `rfmData` (আগে O(কাস্টমার×ইনভয়েস+txns) সিঙ্গল-পাস JS স্ক্যান) এখন SQL-প্রেফার্ড।

- **নতুন DataStore ফাংশন**: `getCustomerRfmAggregates(businessType, {d30})` — ৩টা আলাদা GROUP BY কোয়েরি (invoices→ltv/frequency/lastDateKey, txns→recentPaid, গ্লোবাল totalSales/monthSale)। **ইচ্ছাকৃতভাবে JOIN না** — invoices×txns সরাসরি জোড়া দিলে প্রতি কাস্টমারের প্রতিটা invoice-row × প্রতিটা txn-row মিলে cross-product হয়ে SUM ভুল (গুণিতক) হয়ে যেত।
- **স্কিমা ব্লকার + ফিক্স**: `txns` টেবিলে `customer_id` কলামই ছিল না। `invoice_id` দিয়ে `invoices` জোড়া লাগিয়ে customerId বের করার কথা প্রথমে ভাবা হয়েছিল, কিন্তু কোড-অডিটে ধরা পড়ল কাস্টমার-ডিটেইল পেজ থেকে সরাসরি "বাকি আদায়" করলে (`addTxn(customerId, ..., invoiceId=null, ..., "collection")`) কোনো ইনভয়েসের সাথে যুক্ত থাকে না — JOIN দিয়ে এই টাকা silently বাদ পড়ে যেত, `recentPaid`/`at_risk` সেগমেন্ট ভুল হতো। তাই নতুন `customer_id TEXT` কলাম + ইনডেক্স যোগ করা হলো (`schema.sql`-এর CREATE TABLE + `getDb()`-এর ALTER TABLE গার্ড পুরনো ইনস্টলের জন্য), `HOT_FIELDS.txns.extract()`-এ `t.customerId` থেকে পপুলেট (dual-write স্বয়ংক্রিয়ভাবে কভার করে)।
- **App.jsx ওয়্যারিং**: নতুন `useCustomerRfm(businessType)` হুক (`useInventoryData()`-এর এন্ট্রি-৫৪ কনভেনশন মেনে — sqliteOn/loading/error/ok স্টেট)। `Customers` কম্পোনেন্টে আগের computation `jsRfmData`-য় রিনেম, তার উপর নতুন `rfmData` useMemo — SQL সফল (`sqlStatus==='ok'`) হলে override, নাহলে `jsRfmData`-ই থাকে। **⚠️ এন্ট্রি ৫৪-এর "সাইলেন্ট JS-ফলব্যাক না" নীতি থেকে ইচ্ছাকৃত ব্যতিক্রম** (কোডে কারণ কমেন্টে লেখা) — InventorySection-এর ছোট ড্যাশবোর্ড-widget-এ শূন্য দেখানো নিরাপদ, কিন্তু Customers-এ ইউজার সরাসরি পুরো লিস্ট ব্রাউজ/ফিল্টার করে কাজ করে, loading/error অবস্থায় পুরো লিস্ট খালি দেখালে workflow ব্লক হয়ে যায়। jsRfmData যেহেতু এমনিতেও কম্পিউট হচ্ছে (সরানো হয়নি), এই ফলব্যাকে নতুন ঝুঁকি নেই — শুধু SQL সফল হলে ভারী স্ক্যান এড়ানো যায় (CPU সাশ্রয়; বড় মেমরি-সাশ্রয় এখানে প্রযোজ্য না, কারণ `invoices`/`txns` এমনিতেই অন্য কারণে props হিসেবে মেমরিতে থাকে — এটা মূলত CPU-দক্ষতার কাজ, `products`-বুট-মেমরির মতো memory-reduction না)।
- `<MemoCustomers>` (main app কল-সাইট, লাইন ~১৬০৩২) `businessType` প্রপ পেল প্রথমবার। ViewerDashboardScreen-এর আলাদা `<Customers>` কল-সাইট (লাইন ~১৭৯৩২) স্পর্শ করা হয়নি — সেখানে businessType আদৌ থ্রেড করা নেই, হুক নিজেই `!businessType` গার্ড করে `disabled` স্টেটে থাকবে (নিরাপদ, jsRfmData-ই ব্যবহার হবে, আগের মতোই)।
- **নতুন টেস্ট**: `tests/datastore-customer-rfm-tests.mjs` (৭ কেস) — voided-ইনভয়েস বাদ, walk-in (customerId=null) বাদ, d30-উইন্ডো ফিল্টার, আর সবচেয়ে গুরুত্বপূর্ণ কেসটা: `invoiceId=null`-এর সরাসরি "বাকি আদায়" txn recentPaid-এ ধরা পড়ে কিনা (আসল ব্লকার)। `package.json`-এর `test` স্ক্রিপ্টে যোগ করা হলো।
- **ম্যানুয়াল parity-চেক**: ব্যবহারকারীর নিজের screenshot-ডেটা (রুবেল বাদশা, ইনভয়েস ৳৮৩২+৳৫+৳১৬২০=৳২৪৫৭, joma ৳৪৬০.৮০) দিয়ে jsRfmData-লজিক বনাম SQL-রেজাল্ট সরাসরি তুলনা — **বাইট-বাই-বাইট মিলেছে** (ltv/frequency/daysSince/avgOrder/recentPaid/totalSales/monthSale সব)।

**যা এই সেশনে তদন্ত করে ইচ্ছাকৃতভাবে বাদ রাখা হলো** (মূল প্ল্যান ডকুমেন্টে ভুল ক্যাটাগরাইজড ছিল বলে ধরা পড়ল):
- `reorderAlerts` (Dashboard) — sales-velocity পূর্বাভাস অ্যালগরিদম (Worker-এ, invoices-হিস্ট্রি লাগে), সাধারণ "site swap" না।
- "১২+ Map বিল্ডার" সাইট — বেশিরভাগ ইচ্ছাকৃত ডকুমেন্টেড সিদ্ধান্ত (স্কোপ-আইসোলেশন, ESLint ইস্যু এড়াতে), bug/ডুপ্লিকেট না — কনভার্ট করলে আগের সঠিক সিদ্ধান্ত উল্টে যেত।

**যাচাই**: `npm test` — ১২টা সুইট সব পাস (নতুন সুইটসহ), `npm run lint` — 0 error (৫৭৮, নতুন `catch(_)` ব্লকের জন্য +১ warning, established প্যাটার্ন), `npm run typecheck` — ক্লিন, `npm run build` — ক্লিন। **real-device স্মোক-টেস্ট এখনো বাকি** (এন্ট্রি ৫৩ থেকে জমে থাকা ঋণ, এই এন্ট্রির ৩টা পরিবর্তনসহ)।

**পরের ধাপ**: real-device স্মোক-টেস্ট (সব জমে থাকা সাইট) → টেস্ট-শপে flag চালু করে RFM live-parity → তারপর বিলিং-ক্রিটিক্যাল সাইট (সতর্কতার সাথে, একটা একটা করে)।

---

### [এন্ট্রি ৫৩] — Products main list card: SQL row-স্ন্যাপশট রেন্ডারিং থেকে POS-এর id+hydrate প্যাটার্নে কনভার্ট

**তারিখ**: ১৬ আগস্ট ২০২৬। **প্রসঙ্গ**: এন্ট্রি ৫০-৫১-এর পরিকল্পনা ছিল "একই প্যাটার্ন Products main list card ও CustomerDetail-এও বসানো" — কিন্তু কোড অডিটে ধরা পড়ল দুটোই যেভাবে ভাবা হয়েছিল সেভাবে প্রযোজ্য না:

- **CustomerDetail — কাজ নেই**: `CustomerDetail`-এর `products` prop নিজের বডিতে ব্যবহৃতই হয় না, শুধু `InvoiceVoidModal`-এ pass হয় — আর `InvoiceVoidModal`-ও `products` prop ব্যবহার করে না (dead prop, কনফার্মড)। এটা ঠিক এন্ট্রি ৫১-এর নিজস্ব আবিষ্কার, আসল টার্গেট (`DailySalesStockCard`) সেখানেই আগে wire হয়ে গেছে। নতুন কাজ নেই।
- **Products main list — ভিন্ন ডিজাইন, তাই "একই প্যাটার্ন" মানে আসলে কনভার্শন**: এন্ট্রি ৩০-এর `browseRows` সরাসরি SQL `data` কলাম (dual-write-সময়কার পূর্ণ JSON স্ন্যাপশট) থেকে রেন্ডার হতো — POS-এর মতো id-লিস্ট+লাইভ-হাইড্রেট না। কোড-অডিটে ধরা পড়ল `editId`-ভিত্তিক আসল সেভ-লজিক (৪৭৭ লাইন, `products.find(p => p.id === editId)`) ইতিমধ্যেই লাইভ state ব্যবহার করে — তাই আসল সেভে কোনো bug ছিল না, কিন্তু কার্ডের ডিসপ্লে (স্টক ব্যাজ) ও এডিট-ফর্মের ডিফল্ট প্রি-ফিল stale dual-write স্ন্যাপশট থেকে আসার একটা bounded staleness-window ছিল।

**পরিবর্তন (`src/App.jsx`, `Products` কম্পোনেন্ট)**:
1. নতুন `productsByIdMap` (`new Map(products.map(p => [String(p.id), p]))`) — POS-এর প্যাটার্নের সাথে সামঞ্জস্যপূর্ণ।
2. `browseRows` (পূর্ণ product অবজেক্ট state) → `browseIds` (শুধু id array) রিনেম/রিডিজাইন — `loadBrowsePage()` এখন `r.rows.map(p => String(p.id))` স্টোর করে, পূর্ণ রো না।
3. নতুন `useProductsByIds(browseIds, businessType, productsByIdMap)` কল + `browseProducts` useMemo (POS-এর `browseProducts`-এর হুবহু প্যাটার্ন) — প্রতিটা কার্ড এখন সবসময় লাইভ `productsByIdMap` থেকে হাইড্রেট হয়ে রেন্ডার হয়।
4. Virtuoso `data` prop ও empty-state চেক দুটোই `browseRows` থেকে `browseProducts`-এ আপডেট।
5. `showCount`-এর `browseTotal` (SQL `COUNT(*)`) অপরিবর্তিত — এটা আলাদা aggregate কল, প্রভাবিত হয়নি।

**আচরণ**: যতক্ষণ `products` পুরোপুরি মেমরিতে থাকে (বুট সিকোয়েন্স এখনো অপরিবর্তিত, ৭.৩ এখনো বাকি), `useProductsByIds()`-এর ভেতরের `productsByIdMap?.has(id)` শর্তে সবসময় true — কোনো SQL ফেচ ফায়ার করে না, সিঙ্ক্রোনাস লুকআপই হয়। কাগজে-কলমে zero-regression, শুধু stale-snapshot window দূর হলো।

**⚠️ real-device স্মোক-টেস্ট এখনো বাকি**: Products লিস্ট (কমন+আনকমন উভয় ফিল্টার), স্ক্রল-পেজিনেশন, এডিট-বাটনে ক্লিক করে ফর্মের ডিফল্ট ভ্যালু ঠিক আছে কিনা, স্টক-আপডেট সেভ করে দেখা, ডিলিট (রিসাইকেল বিন)।

**যাচাই**: `npm test` — সব ২১২টা কেস পাস ✅, `npm run lint` — 0 error (577 প্রি-এক্সিস্টিং warning, নতুন কিছু না) ✅, `npm run typecheck` — ক্লিন ✅, `npm run build` — ক্লিন ✅, `npm run test:golden-master` — ৭/৭ ✅, `npm run test:fuzz` — সব পাস ✅।

**পরের ধাপ**: real-device স্মোক-টেস্ট এই পরিবর্তনের জন্য → তারপর আসল ধাপ ৭.৩ (বুট সিকোয়েন্স থেকে `products` সম্পূর্ণ সরানো, মূল মেমরি-সাশ্রয়ের ধাপ)।

---

### [এন্ট্রি ৫২] — CI typecheck ফেইল ফিক্স + sandbox-ভেরিফিকেশন গ্যাপ বন্ধ

**তারিখ**: ১৬ আগস্ট ২০২৬। **ট্রিগার**: ব্যবহারকারীর GitHub Actions "build" ওয়ার্কফ্লো ফেইল স্ক্রিনশট (Type-check স্টেপ)।

**সমস্যা**: `src/logic.js(296,60)`-এ TS2739 — `computeProductSales(invList, prodMap, { d30, d60, d90 } = {})`-এর JSDoc টাইপ `cutoffs`-কে required `{d30:string,d60:string,d90:string}` বলছিল, কিন্তু ডিফল্ট রানটাইম মান `{}`।

**⚠️ সততার নোট**: এই সেশনের App.jsx পরিবর্তনের (এন্ট্রি ৫০-৫১) সাথে সম্পর্কহীন — `logic.js` এই সেশনে স্পর্শই করা হয়নি। কিন্তু এন্ট্রি ৪৯-৫১-এ "npm test+lint+build ক্লিন" যে দাবি করা হয়েছিল, তাতে `npm run typecheck` (`package.json`-এ আলাদা স্ক্রিপ্ট, CI-এর নিজস্ব build স্টেপ) কখনো sandbox-এ চালানো হয়নি — তাই এই বাগ (সম্ভবত এন্ট্রি ৪৮ থেকেই বিদ্যমান, যখন এই ফাংশন App.jsx থেকে logic.js-এ তোলা হয়) এতদিন অলক্ষিত ছিল।

**ফিক্স**: শুধু JSDoc টাইপ বদলানো হলো — `@param {{d30?:string, d60?:string, d90?:string}} [cutoffs]`। রানটাইম কোড অপরিবর্তিত, শুধু টাইপ এখন প্রকৃত ডিফল্ট (`{}`) মানের সাথে মেলে।

**প্রসেস-ফিক্স**: sandbox-ভেরিফিকেশন চেকলিস্টে এখন থেকে `npm run typecheck`ও যোগ (আগে শুধু test/lint/build)।

**যাচাই**: `npm test` ২২৭/২২৭ পাস, `npm run lint` 0 error, `npm run build` ক্লিন, `npm run typecheck` — **এখন ক্লিন** (আগে ফেইল করত)।

---

### [এন্ট্রি ৫১] — CustomerDetail টার্গেট ভুল প্রমাণিত (dead prop) → আসল টার্গেট AuditTrailModule/DailySalesStockCard-এ wire করা হলো

**তারিখ**: ১৬ আগস্ট ২০২৬। **ট্রিগার**: "নেক্সট কাজ শুরু করুন" — এন্ট্রি ৫০-এর প্ল্যান অনুযায়ী পরের কম-ঝুঁকির সাইট।

**আবিষ্কার**: এন্ট্রি ৪৯-এ (আগের একটা শেয়ার্ড-স্ক্রিনশট সেশনে) `CustomerDetail → InvoiceVoidModal`-কে দ্বিতীয় টার্গেট বলা হয়েছিল। কোড দেখে ধরা পড়ল `InvoiceVoidModal({ ..., products = [], ... })`-এর `products` prop পুরো ফাংশন বডিতে একবারও ব্যবহৃত হয় না — সম্পূর্ণ dead prop। তাই ওখানে কিছু করার নেই।

**আসল কাজ**: `AuditTrailModule → DailySalesStockCard` (দিনের বিক্রয়/লাভ কোলাপ্সিবল কার্ড) — এখানে বাস্তবিক `prodMap` (পূর্ণ `products` অ্যারে থেকে বিল্ড) `calcProfitTotal()`-এ ও soldRows-এর নাম-ফলব্যাকে ব্যবহৃত হতো।
- `businessType` prop-চেইন প্লাম্ব করা হলো: App() → `<AuditTrailModule businessType={businessType}>` → `<DailySalesStockCard businessType={businessType}>` (দুটোই আগে এই prop নিত না)।
- নতুন `neededProductIds` (useMemo) — শুধু নির্বাচিত তারিখের `stockMovements`(source='sale') + `dayInvoices`-এর আইটেম থেকে id সংগ্রহ (বাউন্ডেড, বড় না)।
- `useProductsByIds(neededProductIds, businessType, prodMap)` কল করে `{ get: getProductById }` — `calcProfitTotal(dayInvoices, hookProdMap)`-এ পাস করা হলো (`hookProdMap = { get: getProductById }`, `logic.js`-এর `calcProfitTotal()`/`calcInvoiceProfit()` অপরিবর্তিত, শুধু Map-ইন্টারফেস duck-typing দিয়ে satisfy করা হলো)। soldRows-এর `prodMap.get(productId)`ও `getProductById(productId)`-এ বদলানো হলো।
- পুরনো পূর্ণ-অ্যারে `prodMap` মুছে ফেলা হয়নি — শুধু হুকের সিঙ্ক-ফলব্যাক আর্গুমেন্ট হিসেবে রয়ে গেছে (এন্ট্রি ৫০-এর প্যাটার্নের মতোই)।

**⚠️ সততার নোট**: React-হুক অবকাঠামোর অভাবে এখানেও কোনো automated প্যারিটি-টেস্ট নেই — শুধু কোড-রিভিউ যুক্তি (duck-typed `.get()` ইন্টারফেস সমতুল্য)। real-device টেস্টই বাকি একমাত্র প্রকৃত প্রমাণ।

**যাচাই**: `npm test` ২২৭/২২৭ পাস, `npm run lint` 0 error (নতুন warning নেই), `npm run build` ক্লিন।

**পরের ধাপ**: (POS + এই প্যানেল দুটোরই) real-device স্মোক-টেস্ট এখনো বাকি → তারপর আসল ৭.৩ (বুট চেঞ্জ) → AIPage_ বাকি অংশ/Customers SQL cutover।

---

### [এন্ট্রি ৫০] — POS-এ ঝুঁকি নিয়ে `useProductsByIds()` প্রথম wire করা (এন্ট্রি ৪৯-এর নিরাপদ (ক)/(খ) না বেছে সরাসরি POS)

**তারিখ**: ১৬ আগস্ট ২০২৬। **ট্রিগার**: ব্যবহারকারী স্পষ্টভাবে বললেন "ঝুকি নিতে রাজি আছি" এবং POS-এ সরাসরি করতে বললেন।

**কী করা হলো**: `src/App.jsx`-এর `SmartInvoiceBuilder`-এ (POS product picker) `browseProducts` memo আগে সরাসরি `productsByIdMap.get(id)` (in-memory Map, `productsWithSerial` থেকে বিল্ট) ব্যবহার করত। এখন `useProductsByIds(browseIds, businessType, productsByIdMap)` হুক কল করে তার `get()` ফাংশন দিয়ে লুকআপ হয় (`productsByIdMap` এখনো হুকের নিজের সিঙ্ক-ফলব্যাক আর্গুমেন্ট হিসেবে দেওয়া হচ্ছে, তাই as-is)। `productsByIdMap`-এর এই একমাত্র ব্যবহারের জায়গাই ছিল (grep দিয়ে যাচাই করা)।

**কেন এই মুহূর্তে আচরণ বদলাবে না**: `useProductsByIds()`-এর নিজস্ব ডিজাইনে (এন্ট্রি ৪২) `get(id)` প্রথমে `productsByIdMap?.get(id)` চেক করে — শুধু সেটা `undefined` হলেই cache/SQL-ফেচে যায়। যেহেতু বুট সিকোয়েন্স এখনো অপরিবর্তিত (products পুরো অ্যারে হিসেবেই মেমরিতে), `productsByIdMap`-এ সবসময় সব id থাকে — তাই এই ওয়্যারিং এখন কার্যত no-op, শুধু কোড-পাথ বদলেছে।

**⚠️ সততার নোট**: পূর্বপ্রতিশ্রুত "প্যারিটি টেস্ট" আক্ষরিক অর্থে যোগ করা যায়নি — এই প্রজেক্টে কোনো React-হুক টেস্ট অবকাঠামো নেই (App.jsx-এর ভেতরের হুক/ফাংশন plain Node থেকে import করা যায় না, শুধু browser bundle-এ থাকে)। প্যারিটি নিশ্চিত করা হয়েছে কোড-রিভিউ দিয়ে (উপরের যুক্তি) — এটা automated regression-প্রুফ না। **তাই real-device টেস্টই এখন একমাত্র বাকি যাচাই।**

**যাচাই**: `npm test` ২২৭/২২৭ পাস, `npm run lint` 0 error (পরিবর্তিত লাইনে নতুন warning নেই), `npm run build` ক্লিন। real-device টেস্ট এখনো বাকি (নিচে দেখুন)।

**পরের ধাপ**: real-device স্মোক-টেস্ট (POS ব্রাউজ/ফিল্টার/পেজিনেশন/স্টক-আউট/চেকআউট) → Products list ও CustomerDetail-এও একই প্যাটার্ন → আসল ৭.৩ (বুট চেঞ্জ) → real-device টেস্ট আবার → AIPage_ বাকি অংশ/Customers SQL cutover।

---

### [এন্ট্রি ৪৯] — "ধাপ ৭ শুরু করুন" → বাস্তবতা-যাচাই: এন্ট্রি ৪৪-এর গ্যাপ পূরণ + রিয়েল বাগ ফিক্স, আসল ৭.৩ (বুট চেঞ্জ) ইচ্ছাকৃতভাবে শুরু করা হয়নি

**তারিখ**: ১৬ আগস্ট ২০২৬। **ট্রিগার**: "ধাপ ৭ শুরু করুন"।

**⚠️ সততার সাথে প্রথমেই**: এই এন্ট্রিতে **আসল ৭.৩ (বুট সিকোয়েন্স থেকে `products` সম্পূর্ণ সরানো) শুরু করা হয়নি** — `products` এখনো CRITICAL_KEYS-এ পুরো অ্যারে হিসেবেই বুটে লোড হয়, কোনো আচরণ বদলায়নি। কারণ:

`grep`-এ App.jsx-এ `products.map/filter/find/forEach/some/every/reduce/sort(...)` প্যাটার্নের **৫১টা সরাসরি full-array-scan সাইট** পাওয়া গেছে (`productsById`/Map-ভিত্তিক লুকআপ বাদ দিয়েই, শুধু plain array method কল) — এটা এন্ট্রি ৪২-এর "৬৭টা সরাসরি ব্যবহার" অডিটেরই সমান্তরাল নিশ্চিতকরণ। এত জায়গা একসাথে async-এ কনভার্ট করে একই সেশনে responsible-ভাবে টেস্ট/ভেরিফাই করা বাস্তবসম্মত না, বিশেষ করে POS বিলিং কাউন্টার-সংশ্লিষ্ট জায়গাগুলোতে (PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর চিরস্থায়ী নিয়ম #৪: "বিলিং কাউন্টারে যেকোনো পণ্য তাৎক্ষণিক সার্চেবল থাকতে হবে")। এন্ট্রি ৪২/৪৩-এর নিজস্ব সতর্কতা তাই সঠিক প্রমাণিত হলো।

**এই সেশনে বাস্তবে যা করা হলো (৭.৩-এর দিকে এগোনোর জন্য প্রয়োজনীয়, নিরাপদ prerequisite যাচাই)**:

1. **এন্ট্রি ৪৪-এর গ্যাপ ধরা পড়ল**: এই লগ ফাইলে এন্ট্রি ৪৪-এর নিজস্ব বিস্তারিত সেকশনই ছিল না ("## এন্ট্রি লগ"-এ এন্ট্রি ৪৫-এর পরেই সরাসরি ৪৩-এ চলে যায়) — শুধু মাস্টার স্ট্যাটাসের এক-লাইন সামারি টিকে ছিল। কোড অডিট করে নিশ্চিত হওয়া গেছে এন্ট্রি ৪৩-এর ক্যাটাগরি ③ FULL-SCAN তালিকার প্রথম ৩টা আইটেম (`getDistinctCategories`/`getDistinctSuppliers`/`getDistinctDosageForms`/`findProductByNameNorm`, ৪টা ফাংশন) সত্যিই DataStore.js-এ লেখা হয়েছিল এবং App.jsx-এর ৪টা হুকের (`useKnownCategories`/`useKnownSuppliers`/`useKnownDosageForms`/`useLiveDupProduct`) মাধ্যমে বাস্তব কল-সাইটে সঠিকভাবে wired ছিল — কোড হারায়নি, শুধু লগ-সেকশন। এই ফাইলে এন্ট্রি ৪৪ পুনর্গঠন করে বসানো হলো (উপরে দেখুন, ⚠️-চিহ্নিত সততার নোটসহ)।
2. **🔴 রিয়েল প্রোডাকশন বাগ ধরা পড়েছে ও ফিক্স হয়েছে**: এই ৪টা ফাংশনের জন্য আগে কোনো ইউনিট টেস্ট ছিল না — এই সেশনে টেস্ট লেখার সময়ই ধরা পড়ল `getDistinctCategories()`-এর SQL-এ `WHERE ... AND product_type != 'service' ...` তিন-মূল্যের (three-valued) SQL লজিকে `product_type IS NULL` রো-গুলোকে (বেশিরভাগ প্রোডাক্টই — শুধু service আইটেমে explicit "service" বসে) বাদ দিয়ে দিচ্ছিল, কারণ `NULL != 'service'` SQL-এ `UNKNOWN` মূল্যায়ন হয়, `WHERE`-এ `true` না। **অর্থাৎ production-এ SQL চালু থাকা অবস্থায় SmartInvoiceBuilder-এর ক্যাটাগরি-ফিল্টার চিপ লিস্ট প্রায় খালি দেখানোর কথা ছিল** (কোনো real-device টেস্ট এখনো না হওয়ায় হয়তো এখনো কেউ লক্ষ্যই করেনি)। JS ফলব্যাক (`p.productType !== "service"`) সঠিক ছিল — জাভাস্ক্রিপ্টে `undefined !== "service"` সবসময় `true`, তাই বাগটা শুধু SQL পাথে সীমাবদ্ধ ছিল। **ফিক্স**: `WHERE deleted = 0 AND (product_type IS NULL OR product_type != 'service') AND ...`। `DataStore.js`-এ অন্য কোনো `!=` তুলনা এই একই ঝুঁকিতে নেই কিনা `grep` দিয়ে যাচাই করা হয়েছে — শুধু এই একটা জায়গায় সমস্যা ছিল, বাকি সব `!=`-এর আগে যথাযথ `IS NOT NULL` গার্ড আছে।
3. **নতুন `tests/datastore-distinct-lookups-tests.mjs` (১১ কেস)** — চারটা ফাংশনই যাচাই করে (উপরের বাগ-ফিক্স রিগ্রেশন কেসসহ)। App.jsx-এর `getKnownSuppliers()`/`getKnownCustomDosageForms()` plain-JS ফাংশন browser-only App.jsx-এর ভেতরে সংজ্ঞায়িত (Node-এ সরাসরি import করা যায় না, logic.js-এর মতো শেয়ার্ড না) — তাই supplier-due/invoiceitems টেস্টের মতো সরাসরি প্যারিটি-তুলনা সম্ভব হয়নি; বরং হাতে-হিসাব-করা প্রত্যাশিত মান দিয়ে DataStore ফাংশনগুলো সরাসরি টেস্টেড (inventory/pos-browse টেস্টের কনভেনশন অনুসরণ করে)। `package.json`-এর `test` স্ক্রিপ্টে যোগ করা হয়েছে।
4. **ধাপ ৭.৩-এর প্রকৃত স্কোপ নিশ্চিত করার audit**: ৫১টা full-array-scan সাইটের একটা প্রাথমিক শ্রেণীবিভাগ করা হলো (এন্ট্রি ৪৩-এর ৩-ক্যাটাগরি স্কিমা অনুসরণ করে) — অনেকগুলো ইতিমধ্যে SQL-cutover-করা aggregate-এর JS-ফলব্যাক অংশ (নিরাপদ, `isSqliteEnabled()` গার্ডেড, ছোঁয়ার দরকার নেই), কিন্তু POS product picker/Products main list/CustomerDetail/ExpenseTracker-এর মতো id-lookup রেন্ডার-পাথও স্পষ্ট আছে যেগুলো `useProductsByIds()` (এন্ট্রি ৪২-এ কোড-সম্পূর্ণ কিন্তু এখনো কোথাও wire করা হয়নি) দিয়ে রিপ্লেস করতে হবে বুট-চেঞ্জের আগে।

**যাচাই**: `npm test` — **২২৭ কেস (আগের ২১৬ + নতুন ১১), সব পাস** ✅। `npm run lint` — **0 error** ✅ (৫৭৮টা প্রি-এক্সিস্টিং warning, নতুন কিছু যোগ হয়নি)। `npm run build` — vite build ক্লিন ✅।

**ঝুঁকি এই সেশনে**: শূন্য নতুন আচরণগত ঝুঁকি বুট/রেন্ডার-পাথে — একমাত্র বাস্তব প্রোডাকশন-প্রভাবিত পরিবর্তন হলো `getDistinctCategories()`-এর বাগ-ফিক্স, যেটা আগের ভাঙা আচরণকে ঠিক করছে (খালি ক্যাটাগরি-চিপ লিস্ট → সঠিক লিস্ট), অবনতি না।

**পরের সেশনে সবার আগে করণীয় — দুটো পথ, ব্যবহারকারীর সিদ্ধান্ত দরকার (মাস্টার স্ট্যাটাসে বিস্তারিত)**:
- **(ক)** real-device স্মোক-টেস্ট আগে (এন্ট্রি ৪০-৪৯-এর সব পরিবর্তন, বিশেষত POS picker ও নতুন ক্যাটাগরি-চিপ বাগ-ফিক্স) — সবচেয়ে কম ঝুঁকি, দীর্ঘদিনের সুপারিশ এখনো অসম্পন্ন।
- **(খ)** অথবা ৭.৩-এর প্রথম প্রকৃত কোড-ধাপ: `useProductsByIds()` একটামাত্র সবচেয়ে কম-ঝুঁকির রেন্ডার-সাইটে (Products main list card) wire করা — বুট সিকোয়েন্স তখনো অপরিবর্তিত (zero regression risk), শুধু async-cache প্যাটার্নটা লাইভ রেন্ডার-পাথে প্রমাণ করা, আসল বুট-চেঞ্জের আগের নিরাপদ ধাপ।

---

### [এন্ট্রি ৪৭] — AIPage_ সাব-প্যাটার্ন ৩/৪: expired/near-expiry স্ক্যান হুক-রিইউজ সম্পূর্ণ

**অবস্থা**: কোড-সম্পূর্ণ, sandbox-ভেরিফায়েড — `npm test` (১৯৬ কেস, সব পাস) + `npm run lint` (0 error) + `npm run build` (ক্লিন)।

**যা করা হয়েছে**:
- নতুন `useExpiryCandidates(products, businessType)` হুক (App.jsx) — কোনো নতুন SQL/DataStore ফাংশন লাগেনি, InventorySection-এর জন্য এন্ট্রি ৩৬-এ বানানো `dsGetExpiryCandidates(businessType)` (nearest_expiry_date ইনডেক্স-সিক করে candidate সেট ছোট করে) সরাসরি পুনর্ব্যবহার করা হলো।
- এই হুক শুধু candidate-সেট রিটার্ন করে (SQL চালু থাকলে narrowed, নাহলে পুরো `prodAll`) — InventorySection-এর বিদ্যমান `expirySource` প্যাটার্নের সাথে সামঞ্জস্যপূর্ণ: আসল expired/near বিভাজন এখনো read-time `new Date()` তুলনা দিয়ে JS-এই হয়, ইনপুট-সোর্স শুধু বদলায়। এতে staleness ঝুঁকি নেই (তুলনাটা সবসময় লাইভ ডেটার উপর)।
- `AIPage_`-এ `useExpiryCandidates(prodAll, businessType)` কল করে `expiryCandidatesAI` তৈরি হয়, `ruleBasedAnswer()`-এর `data` অবজেক্টে `expiryCandidates` নামে পাস হয় (ঠিক `stockValue`/`lowStockItems`/`outOfStockItems`-এর বিদ্যমান প্যাটার্নের মতোই — `ruleBasedAnswer()` প্লেইন ফাংশন, হুক কল করতে পারে না)।
- `ruleBasedAnswer()`-এর ভেতরে ২ জায়গায় ("মেয়াদ/এক্সপায়ার" ও "ফার্মেসি পরামর্শ" ব্লক) `(prodAll||[]).filter(...)` → `(expiryCandidates||[]).filter(...)` রিপ্লেস হয়েছে, ফিল্টার-শর্ত ও ৯০-দিন থ্রেশহোল্ড হুবহু অপরিবর্তিত।
- `prodAll` এখনো ব্যবহৃত হচ্ছে `ruleBasedAnswer()`-এর "overstock" ব্লকে (forecastData-নির্ভর জয়েন — পরের/শেষ সাব-প্যাটার্নের অংশ, ইচ্ছাকৃতভাবে অস্পৃষ্ট)।

**যাচাই**: `npm test`+lint+build তিনটাই ক্লিন — এন্ট্রি ৪৬-এর ভুল (bulk sed-এ ভ্যারিয়েবল স্কোপ মিক্স-আপ) এই সেশনে পুনরাবৃত্তি হয়নি, প্রতিটা এডিটের পরই lint চালিয়ে চেক করা হয়েছে। **real-device টেস্ট এখনো বাকি**।

**পরের ধাপ (শেষ সাব-প্যাটার্ন, সবচেয়ে জটিল)**: `forecastData`/`productSales` — বেস্টসেলার র‍্যাংকিং, per-product sales-এর সাথে জয়েন লাগবে, নতুন কাস্টম SQL ডিজাইন করতে হবে (এখন পর্যন্ত ৩টা সাব-প্যাটার্নের মতো বিদ্যমান ফাংশন রিইউজ করে সহজে হয়নি) — সম্ভবত আলাদা সেশন।

---

### [এন্ট্রি ৪৬] — AIPage_ সাব-প্যাটার্ন ২/৪: outOfStock/prodAll.length হুক-রিইউজ সম্পূর্ণ

**অবস্থা**: কোড-সম্পূর্ণ, sandbox-ভেরিফায়েড — `npm test` (১৯৬ কেস, নতুন `totalCount` টেস্টসহ, সব পাস) + `npm run lint` (0 error) + `npm run build` (ক্লিন) — সব সরাসরি চালানো হয়েছে।

**যা করা হয়েছে**:
- `DataStore.js`-এর `getInventoryCounts()`-এ নতুন `total_count` কলাম (`COUNT(*)`) যোগ হলো — বিদ্যমান ফাংশন, breaking change না (additive রিটার্ন-ফিল্ড, বিদ্যমান ৩টা কল-সাইট অপ্রভাবিত)।
- নতুন `useOutOfStockCount(products, businessType)` হুক (App.jsx) — `getInventoryCounts()` রিইউজ করে `{ outOfStock, totalProducts }` রিটার্ন করে, JS ফলব্যাক আগের `prodAll.filter(p=>(p.stock||0)===0).length`/`prodAll.length`-এর সাথে হুবহু।
- নতুন `useOutOfStockItems(products, businessType)` হুক — কারণ `ruleBasedAnswer()`-এর "কম স্টক" চ্যাট-উত্তরে (`out.slice(0,5).map(p=>p.name)`) স্টকশূন্য পণ্যের পূর্ণ তালিকা লাগে, শুধু কাউন্ট না (ঠিক এন্ট্রি ৪৫-এর `lowStockItems`-এর মতোই সমস্যা)। বিদ্যমান `dsGetInventoryList(businessType, "out")` (এন্ট্রি ৩৬-এ "kind" প্যারামিটারে ইতিমধ্যেই সমর্থিত) রিইউজ করা হলো — নতুন SQL লেখা লাগেনি।
- `AIPage_`-এ `const outOfStock = prodAll.filter(...).length` রিমুভ হয়ে `useOutOfStockCount()`-এর `.outOfStock`/`.totalProducts` (নাম `totalProductsAI`) দিয়ে রিপ্লেস হয়েছে; healthScore useMemo dep-এ `prodAll.length` → `totalProductsAI`।
- `ruleBasedAnswer()` একটা প্লেইন ফাংশন (React হুক কল করতে পারে না, event handler থেকে সরাসরি কল হয়) — তাই AIPage_ থেকে `outOfStockItems`/`totalProducts` `data` অবজেক্টে পাস করা হয়েছে (ঠিক `stockValue`/`lowStockItems`-এর বিদ্যমান প্যাটার্নের মতোই)। ফাংশনের ভেতরে ৩ জায়গায় লোকাল `prodAll.filter(p=>(p.stock||0)===0)`/`prodAll.length` রিপ্লেস হয়েছে প্যারামিটার দিয়ে — "স্টক সারসংক্ষেপ" ও "পণ্য সারসংক্ষেপ" quick-reply টেক্সট, আর "কম স্টক" তালিকা।

**⚠️ একটা ভুল ধরা পড়ে ফিক্স হয়েছে**: প্রথম sed রিপ্লেস AIPage_-স্কোপের ভ্যারিয়েবল নাম (`totalProductsAI`) ভুলে `ruleBasedAnswer()`-এর ভেতরেও বসিয়ে দিয়েছিল (যেখানে destructured প্যারামিটার নাম `totalProducts`, `AI` সাফিক্স ছাড়া) — `npx eslint` `no-undef` error ধরেছে, তাৎক্ষণিক ফিক্স হয়েছে। এই ধরনের copy-paste/sed ভুল এড়াতে ভবিষ্যতে বাল্ক-রিপ্লেসের পর সবসময় lint (শুধু test না) চালানো জরুরি — এই সেশনে সেটাই আসল ধরার উপায় ছিল।

**প্রোডাক্ট-সাইড অপরিবর্তিত**: `overstock` (forecastData জয়েন-নির্ভর) ও expired/near-expiry স্ক্যান — দুটোই `prodAll` এখনো ব্যবহার করে, ইচ্ছাকৃতভাবে এই সেশনে টাচ করা হয়নি (পরের ২টা সাব-প্যাটার্নের কাজ)।

**যাচাই**: `npm test`+lint+build তিনটাই ক্লিন। **real-device টেস্ট এখনো বাকি** — SQL মোডে AI চ্যাটে "কম স্টক" জিজ্ঞেস করে স্টকশূন্য/মোট পণ্য সংখ্যা আগের JS-মোডের সাথে মিলছে কিনা যাচাই করা দরকার।

**পরের ধাপ**: expired/near-expiry স্ক্যান (`nearest_expiry_date` কলাম এন্ট্রি ৩৬-এই আছে, প্রাথমিক candidate-narrowing-এর জন্য `dsGetExpiryCandidates()`-ও এন্ট্রি ৩৬-এই বানানো — সম্ভবত সরাসরি রিইউজযোগ্য, ব্যাচ-লেভেল এক্সপায়ার্ড/near-expiry বিভাজন JS-এই থাকবে ছোট candidate সেটের উপর)।

---

### [এন্ট্রি ৪৫] — AIPage_ সাব-প্যাটার্ন ১/৪: stockValue/lowStockItems হুক-রিইউজ সম্পূর্ণ

**অবস্থা**: কোড-সম্পূর্ণ, sandbox-ভেরিফায়েড — `npm install` + `npm test` (১৯৫ কেস, সব পাস) + `npm run lint` (0 error, 558 pre-existing warning) + `npm run build` (ক্লিন, ৮৭২ মডিউল) — এই সেশনে npm নেটওয়ার্ক আনব্লকড ছিল, তিনটাই সরাসরি চালানো হয়েছে।

**যা করা হয়েছে**:
- `useProductStockTotals(prodAll, businessType)` (এন্ট্রি ৩৯-এ `useKpiStats`-এর জন্য বানানো হুক) এখন `AIPage_`-এও কল হয়, `.stockValue` ব্যবহার করে — আগের লোকাল `prodAll.reduce(...)` মুছে ফেলা হয়েছে।
- নতুন `useLowStockItems(products, businessType)` হুক (App.jsx, `useProductStockTotals`-এর ঠিক পরে) — কেন নতুন হুক লাগলো: `useProductStockTotals` শুধু `lowStockCount` (সংখ্যা) দেয়, কিন্তু `AIPage_`-এ `lowStockItems` ৮+ জায়গায় ব্যবহৃত হয় পূর্ণ আইটেম-অবজেক্ট হিসেবে (`.slice(0,3).map(p=>p.name)`, `.slice(0,5).map(p=>`• ${p.name} — ${p.stock}টি বাকি`)` ইত্যাদি) — শুধু কাউন্ট দিয়ে হয় না। SQL চালু থাকলে বিদ্যমান `dsGetInventoryList(businessType, "critical")` (এন্ট্রি ৩৬, InventorySection-এর জন্য বানানো, একই ফাংশন পুনর্ব্যবহার — নতুন SQL লেখা লাগেনি) কল করে পূর্ণ product-অবজেক্ট-অ্যারে রিটার্ন করে; SQL অফ/এরর হলে JS ফলব্যাক (`prodAll.filter(p => (p.stock||0)>0 && (p.stock||0)<=(p.minStockAlert||5))`) — ঠিক আগের শর্তই, আচরণ অপরিবর্তিত।
- `AIPage_`-এ `const stockValue = prodAll.reduce(...)` ও `const lowStockItems = prodAll.filter(...)` — দুই লাইন রিপ্লেস হয়ে হুক-কল হয়েছে। ডাউনস্ট্রিম ৮+ ব্যবহার-সাইট (healthScore useMemo dep, insights প্যানেল, chat summary টেক্সট, ইত্যাদি) কোনোটাই বদলাতে হয়নি — variable নাম/শেপ অপরিবর্তিত (এখনো array, `.length`/`.map`/`.slice` সবই কাজ করে)।

**যাচাই**: `npm test`+lint+build তিনটাই ক্লিন (উপরে বিস্তারিত)। **real-device টেস্ট এখনো বাকি** — SQL মোডে AI পেজের ড্যাশবোর্ড ট্যাবে স্টক-মূল্য কার্ড ও "কম স্টক" সংখ্যা/তালিকা আগের JS-মোডের সাথে মিলছে কিনা যাচাই করা দরকার।

**পরের ধাপ**: `outOfStock`/`prodAll.length` কাউন্ট (নতুন SQL COUNT প্রয়োজন — `getInventoryCounts()`-এ ইতিমধ্যেই `allStock`/`stockOut` কলাম আছে এন্ট্রি ৩৬ থেকে, সম্ভবত সরাসরি রিইউজযোগ্য, পরের সেশনে যাচাই করতে হবে)।

---

### [এন্ট্রি ৪৪] — ⚠️ রেট্রোঅ্যাক্টিভভাবে পুনর্গঠিত (মূল বিস্তারিত সেকশন এই ফাইল থেকে হারিয়ে গিয়েছিল, এন্ট্রি ৪৯-এ ধরা পড়ে এখানে পুনর্গঠন করা হলো)

**⚠️ সততার সাথে প্রথমেই**: এই এন্ট্রির নিজস্ব বিস্তারিত সেকশনটাই কোনো এক পর্যায়ে হারিয়ে গিয়েছিল (শুধু মাস্টার স্ট্যাটাসের এক-লাইন সামারি টিকে ছিল: "এন্ট্রি ৪৩-এ চিহ্নিত ৪টা FULL-SCAN ব্লকারের মধ্যে ৩টা সম্পূর্ণ SQL cutover") — এন্ট্রি ৩৮-এ চিহ্নিত "হারানো ফাইল" প্যাটার্নেরই আরেকটা রূপ, এবার টেস্ট-ফাইল না, লগ-সেকশন নিজেই। এন্ট্রি ৪৯-এ কোড (`git`-এর মতো ইতিহাস নেই, তাই শুধু বর্তমান কোড পড়ে) থেকে যা আসলে হয়েছিল তা পুনর্গঠন করা হলো — নিচের বিবরণ কোড-অডিট থেকে নিশ্চিত, কিন্তু মূল সেশনের কথোপকথনের প্রসঙ্গ/সিদ্ধান্ত-প্রক্রিয়া (কেন, কী আলোচনা হয়েছিল) হারিয়ে গেছে।

**যা কোডে পাওয়া গেছে (এন্ট্রি ৪৩-এর ক্যাটাগরি ③ FULL-SCAN তালিকার ৪টার মধ্যে ৩টা)**:
- `DataStore.js`-এ `getDistinctCategories()`, `getDistinctSuppliers()`, `getDistinctDosageForms()`, `findProductByNameNorm()` — প্রতিটাই DISTINCT/exact-lookup SQL কোয়েরি, `products`/`purchaseOrders`-এর বিদ্যমান কলাম ব্যবহার করে (`supplier_due_raw` এন্ট্রি ৪১ থেকে, `name_norm` এন্ট্রি ৯ থেকেই ছিল) — নতুন কলাম শুধু `dosage_form` (schema.sql-এ `products.dosage_form TEXT`, ALTER TABLE গার্ডসহ)।
- `App.jsx`-এ ৪টা শেয়ার্ড হুক — `useKnownCategories()` (SmartInvoiceBuilder ক্যাটাগরি-চিপ), `useKnownSuppliers()` (SupplierPicker অটো-সাজেশন, `getKnownSuppliers()`-এর প্রতিস্থাপন), `useKnownDosageForms()` (dosage-চিপ অটো-সাজেশন), `useLiveDupProduct()` (ডুপ্লিকেট-নাম চেক, ১৫০ms ডিবাউন্সড — বাকি ৩টার মতো লিস্ট না, একক-রেকর্ড lookup বলে ভিন্ন প্যাটার্ন)। সবগুলো `isSqliteEnabled()`-গার্ডেড sql-first/JS-fallback কনভেনশন মেনে।
- বাস্তব কল-সাইটে wired: `useKnownCategories` (SmartInvoiceBuilder), `useKnownDosageForms` (দুই জায়গায়), `useKnownSuppliers` (SupplierPicker কল-সাইট), `useLiveDupProduct` (প্রোডাক্ট ফর্ম)।
- **৪টার মধ্যে ৪র্থটা (AIPage_-এর forecast/expired-scan) ইচ্ছাকৃতভাবে এই এন্ট্রিতে বাদ ছিল** — এটাই পরে এন্ট্রি ৪৭ (expired-scan) ও এন্ট্রি ৪৮ (forecastData)-এ আলাদাভাবে সম্পূর্ণ হয়েছে।

**⚠️ যা মিসিং ছিল**: এই ৪টা ফাংশনের জন্য কোনো ইউনিট টেস্ট লেখা হয়নি (কোনো `tests/datastore-*-tests.mjs` ফাইলে রেফারেন্স নেই, `package.json`-এর `test` স্ক্রিপ্টেও কিছু যোগ হয়নি)। এন্ট্রি ৪৯-এ এই গ্যাপ ধরা পড়ে ঠিক করা হয়েছে — এবং টেস্ট লেখার সময়ই `getDistinctCategories()`-এ একটা রিয়েল প্রোডাকশন বাগ পাওয়া গেছে (বিস্তারিত এন্ট্রি ৪৯)।

---

### [এন্ট্রি ৪৩] — ধাপ ৭.১ (ব্যবহার-সাইট ক্যাটাগরাইজেশন) + ৭.২ (async cache hook) সম্পূর্ণ — ৭.৩ (বুট পরিবর্তন) ইচ্ছাকৃতভাবে ব্লকড

**তারিখ**: ১৬ আগস্ট ২০২৬। **ট্রিগার**: "এই ৩ টার শেষ করে আউটপুট দেন।"

**⚠️ সততার সাথে প্রথমেই**: ৭.১ ও ৭.২ সম্পূর্ণ হয়েছে (নিচে যাচাই-সহ), কিন্তু ৭.৩ (বুট সিকোয়েন্সে `products`-কে আসলে lazy করা — যেটাই "আসল মেমরি-সাশ্রয়") **এই সেশনে করা হয়নি**। কারণ ৭.১-এর অডিটে একটা নতুন প্রকৃত ব্লকার ধরা পড়েছে যেটা এন্ট্রি ৪২-এও দেখা যায়নি — নিচে বিস্তারিত।

**৭.১ — ক্যাটাগরাইজেশন ফলাফল**: App.jsx-এ `products`/`productsById`/`prodMap`/`prodAll`-এর ৯৪টা ব্যবহার-লাইন কম্পোনেন্ট-প্রসঙ্গ দিয়ে ৩ ক্যাটাগরিতে ভাগ করা হয়েছে (পূর্ণ তালিকা `PRODUCTS_ONDEMAND_MIGRATION_PLAN.md`-এ):
- **① AGGREGATE** — ইতিমধ্যে SQL-cutover (এন্ট্রি ৩৬-৪১), `products` শুধু JS-fallback হিসেবে দরকার
- **② VISIBLE-ID** — নির্দিষ্ট id-র জন্য single/batch লুকআপ (POS card, Products list card, ইনভয়েস/রিটার্ন লাইন-আইটেম রেন্ডার) — এগুলোই আসল lazy-boot প্রার্থী, `getByIds()`/`useProductsByIds()` দিয়ে প্রতিস্থাপনযোগ্য
- **③ FULL-SCAN** (🔴 নতুন ফাইন্ডিং) — সত্যিকারের পুরো ক্যাটালগ দরকার এমন ৪টা জায়গা: `getKnownSuppliers()`/`getKnownCustomDosageForms()` (লাইন ৮৯৭/৯০৭, distinct company/dosageForm বের করা), SmartInvoiceBuilder-এর category-list বিল্ডার (লাইন ১৮৩৫৫), Products-এ ডুপ্লিকেট-নাম চেক (লাইন ২৮১৬২), আর AIPage_-এর forecast/expired-scan (এন্ট্রি ৪১-এ আগে থেকেই ফ্ল্যাগড)।

**🔴 কেন ৭.৩ এই সেশনে করা হয়নি**: ক্যাটাগরি ③-এর ৪টা জায়গা এখনো JS-এ পুরো `products` অ্যারে স্ক্যান করে — এগুলো SQL-এ না আনা পর্যন্ত বুট থেকে `products` সরালে (এমনকি bounded/windowed করলেও) এই ৪টা ফাংশন ভুল ফলাফল দেবে বা ক্র্যাশ করবে (dup-name চেক ব্যর্থ হলে ডুপ্লিকেট প্রোডাক্ট তৈরি হয়ে যেতে পারে — ডেটা-ইন্টেগ্রিটি সমস্যা, শুধু UI গ্লিচ না)। এটা PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর নিজস্ব চিরস্থায়ী নিয়ম #৪-এরই আরেকটা রূপ ("products কখনোই সম্পূর্ণ মেমরি থেকে সরানো যাবে না... বিলিং কাউন্টারে যেকোনো পণ্য তাৎক্ষণিক সার্চেবল থাকতে হবে")। এন্ট্রি ৪২-এর অডিট এই ৪টা নির্দিষ্ট জায়গা ধরতে পারেনি (component-লেভেল অডিট ছিল, লাইন-লেভেল না) — এই সেশনের গভীর অডিটেই প্রথম ধরা পড়ল। **তাই ৭.৩ বাস্তবায়ন না করে এই ব্লকার ডকুমেন্ট করাই সঠিক সিদ্ধান্ত** — জোর করে বুট বদলালে ৫০০ লাইভ দোকানে ডুপ্লিকেট-প্রোডাক্ট/ক্র্যাশের ঝুঁকি থাকত।

**৭.২ — `useProductsByIds()` hook (কোড-সম্পূর্ণ, wire করা হয়নি)**:
- App.jsx-এ নতুন হুক (KpiCardsGrid-এর কাছে, `useProductStockTotals`-এর ঠিক আগে) — `getByIds()` ব্যাচ-ফেচ করে শুধু তখনই যখন id `productsByIdMap`-এ (in-memory) নেই এবং ক্যাশে/in-flight-এ নেই। ইনক্রিমেন্টাল ক্যাশ (`Map`, useState), race-safe (cancelled flag + idsKey dependency)।
- `isSqliteEnabled()`-গার্ডেড fallback প্যাটার্ন অনুসরণ করে (এন্ট্রি ৯-৪১-এর সব cutover-এর একই কনভেনশন)।
- **এই মুহূর্তে বাস্তবে কখনো SQL-পাথ চলে না** — কারণ `products` এখনো সবসময় পূর্ণ (৭.৩ হয়নি), তাই `productsByIdMap.has(id)` সবসময় true হয়। হুকটা শুধু ভবিষ্যতের জন্য প্রস্তুত/টেস্টেবল কোড, কোনো নতুন আচরণ যোগ করেনি।
- নতুন `import { getByIds as dsGetByIds } from "./db/DataStore.js"` যোগ হয়েছে।
- ⚠️ **এই হুকের জন্য কোনো ইউনিট টেস্ট লেখা যায়নি** — এটা React hook (useState/useEffect/useRef নির্ভর), আর প্রজেক্টে কোনো React টেস্টিং লাইব্রেরি (jsdom/@testing-library) নেই, শুধু Node-ভিত্তিক লজিক টেস্ট (`node:sqlite` শিম-নির্ভর)। DataStore-এর `getByIds()` অংশ (যেটা এই হুক কল করে) এন্ট্রি ৪২-এই ৮-কেস টেস্টেড।

**যাচাই**: `npm run build` (vite, ক্লিন, ১৬.৪ সেকেন্ড) — নতুন import + হুক সিনট্যাক্স-ভ্যালিড। `npm run lint` (0 error — নতুন হুকের জন্য শুধু ১টা প্রত্যাশিত `no-unused-vars` warning, কারণ এখনো কোথাও কল হচ্ছে না)। `npm test` (১৮১ কেস, সব ক্লিন, কিছুই ভাঙেনি)।

**ঝুঁকি**: শূন্য — নতুন হুক সংজ্ঞায়িত হয়েছে কিন্তু কোথাও কল হচ্ছে না, App.jsx-এর কোনো বিদ্যমান লজিক/রেন্ডার-পাথ স্পর্শ করা হয়নি। প্রোডাকশনের কোনো দোকানে কোনো আচরণগত প্রভাব নেই।

**পরের সেশনের জন্য হালনাগাদ ক্রম (ব্লকার-ভিত্তিক)**:
1. ক্যাটাগরি ③-এর ৪টা জায়গা SQL-এ আনা — সবচেয়ে সহজ প্রথম: dup-name চেক (schema-তে `name_norm` কলাম ইতিমধ্যে আছে, শুধু `SELECT id FROM products WHERE name_norm=?` কোয়েরি বসানো), তারপর category-list (`SELECT DISTINCT category`), তারপর supplier/dosageForm distinct-list (dosageForm-এর জন্য নতুন কলাম+ALTER TABLE গার্ড লাগবে), সবার শেষে AIPage_ (বড়, ইতিমধ্যে এন্ট্রি ৪১-এ আলাদা স্কোপ হিসেবে ফ্ল্যাগড)
2. এন্ট্রি ৪০-এর POS picker real-device স্মোক-টেস্ট (এখনো স্বাধীনভাবে বাকি, অগ্রাধিকারে সমান-উচ্চ)
3. তারপরই ৭.৩ — বুট সিকোয়েন্সে `products`-এর জন্য bounded/lazy সেট (invoices windowing-এর প্যাটার্নে), `useProductsByIds()` wire করে POS/Products list card রেন্ডারে

**যা এখনো বাকি**:
- [ ] ক্যাটাগরি ③-এর ৪টা SQL cutover (উপরে বিস্তারিত)
- [ ] `useProductsByIds()` আসলে POS পিকার/Products main list card রেন্ডারে wire করা (৭.৩-এর অংশ, এখনো ব্লকড)
- [ ] বুট সিকোয়েন্স পরিবর্তন (৭.৩ চূড়ান্ত) — এখনো শুরুই হয়নি
- [ ] এন্ট্রি ৪০-এর POS picker real-device টেস্ট

---

### [এন্ট্রি ৪২] — ধাপ ৭ (products boot-load lazy) শুরু: অডিট + ভিত্তি (`getByIds()`) — cutover এখনো হয়নি

**তারিখ**: ১৬ আগস্ট ২০২৬। **ট্রিগার**: "ধাপ ৭ — এটা করুন।"

**⚠️ সততার সাথে প্রথমেই বলা দরকার**: এই এন্ট্রিতে ধাপ ৭ *সম্পূর্ণ হয়নি* — `products` এখনো বুটে পুরো অ্যারে হিসেবেই লোড হয়, কোনো আচরণ বদলায়নি। এই সেশনে যা হয়েছে তা হলো (ক) কেন এখনো সরাসরি lazy-boot করা যাচ্ছে না তার প্রকৃত রুট-কজ অডিট, আর (খ) সেই কাজের জন্য প্রয়োজনীয় প্রথম bez-ঝুঁকি ভিত্তি (`getByIds()`)। PRODUCTS_ONDEMAND_MIGRATION_PLAN.md নিজেই ধাপ ৭-কে "সবচেয়ে বড়/ঝুঁকিপূর্ণ" বলেছে — এই সেশনের অডিট সেই মূল্যায়ন নিশ্চিত করে।

**অডিট ফাইন্ডিং — আসল ব্লকার কী**:
`grep`-এ App.jsx-এ `products`/`productsById`/`productsByIdMap`-এর ৬৭টা সরাসরি ব্যবহার পাওয়া গেছে (মূল প্ল্যান ডকুমেন্টের "২০ কম্পোনেন্ট" ইনভেন্টরি component-গণনা ছিল, এটা line-গণনা — সংখ্যা তাই সরাসরি তুলনাযোগ্য না, কিন্তু স্কেল বোঝাতে যথেষ্ট)। এর মধ্যে root cause একটাই কেন্দ্রীয় প্যাটার্ন:

- `useAppStore`-এ (Zustand, module-level) একটা `productsById` Map আছে যেটা `products.subscribe()`-এ **সিঙ্ক্রোনাসভাবে** পুরো `products` অ্যারে থেকে রিবিল্ড হয় (App.jsx লাইন ৩৭৯-৩৮২: `new Map(products.map(p => [String(p.id), p]))`)। এন্ট্রি লগের মাস্টার স্ট্যাটাসে এটাকেই "getState() write-through Map (৭ কল-সাইট) ✅ ভেরিফায়েড" বলা হয়েছে — কিন্তু এই "৭ কল-সাইট" আসলে ক্যাটাগরি A (id lookup)-কে *consolidate* করেছে, `products` পুরো অ্যারে মেমরিতে থাকার নির্ভরতা *সরায়নি*। Map-টা যতই দ্রুত/সিঙ্ক হোক, এটা এখনো সোর্স হিসেবে সম্পূর্ণ live `products` অ্যারে চায়।
- **এন্ট্রি ৪০-এর নিজস্ব ডিজাইন নোট নিশ্চিত করে এই একই সীমাবদ্ধতা**: POS পিকার (SmartInvoiceBuilder) SQL (`browse_rank`) দিয়ে শুধু id-অর্ডার ঠিক করে, কিন্তু "প্রতিটা কার্ড তারপরও live `products` state (`productsByIdMap`) থেকে রেন্ডার হয়" — অর্থাৎ ordering SQL-based হলেও card-রেন্ডারিং এখনো সিঙ্ক/ইন-মেমরি লুকআপের উপর নির্ভরশীল। Products main list (এন্ট্রি ৩০)-এও একই প্যাটার্ন।

**সংক্ষেপে**: ক্যাটাগরি A/B/C/D-এর *aggregation ও ordering* যুক্তি এন্ট্রি ৩৬-৪১-এ SQL-এ চলে গেছে — কিন্তু *কার্ড/রো রেন্ডার করার জন্য পূর্ণ product অবজেক্ট আনা* এখনো সবসময় সিঙ্ক্রোনাস in-memory Map থেকেই হয়, কারণ React রেন্ডার প্যাথে async fetch বসাতে হলে প্রতিটা এই কল-সাইটেই (POS card, Products list card, CustomerDetail, ExpenseTracker, AuditTrailModule, ইত্যাদি) loading-state/cache ডিজাইন লাগবে — এটাই আসল ধাপ ৭-এর কাজ, শুধু boot-effect-এর একটা লাইন বদলানো না।

**কী করা হলো (শুধু ভিত্তি, কোনো App.jsx কল-সাইট এখনো ছোঁয়া হয়নি)**:
- `DataStore.js`-এ নতুন `getByIds(businessType, store, ids)` — batched `WHERE id IN (...)` লুকআপ, ৫০০-id চাংকে ভাঙা (SQLite-এর `IN (...)` প্যারামিটার-সীমা এড়াতে), ইনপুট-অর্ডার প্রিজার্ভড রিটার্ন, ডুপ্লিকেট/না-পাওয়া id নিরাপদে হ্যান্ডেল করে। এটাই ভবিষ্যতের async cache-ভিত্তিক রেন্ডারিং-এর (পরের ধাপে) একমাত্র নতুন প্রিমিটিভ দরকার — `getById()` একবারে ১টা করে করলে পেজ-ভর্তি (৫০-১০০টা) কার্ডে n+1 কোয়েরি সমস্যা হতো।
- নতুন `tests/datastore-getbyids-tests.mjs` (৮টা কেস) — মৌলিক লুকআপ, অর্ডার-প্রিজার্ভেশন, না-পাওয়া/ডুপ্লিকেট id, খালি ইনপুট, ৫০০-এর বেশি (multi-chunk) ব্যাচ, customers store-এও কাজ করে কিনা। `package.json`-এর `test` স্ক্রিপ্টে যোগ করা হয়েছে।

**যাচাই**: `npm test` (এখন ১৮১টা কেস — আগের ১৭৩ + নতুন ৮টা, সব ক্লিন), `npm run lint` (0 error, নতুন কোনো warning যোগ হয়নি — শুধু ফাইলের বিদ্যমান কয়েকটা unused-var warning), `npm run build` (vite build ক্লিন, ১৫.১২ সেকেন্ড)। এই সেশনে sandbox-এ `npm install` সফল হয়েছে (আগের সেশনগুলোর `@capacitor/core` peer-dependency conflict এবার হয়নি) — তাই এবার শুধু syntax-check না, আসল টেস্ট-রানার/lint/build তিনটাই বাস্তবে চালিয়ে কনফার্ম করা গেছে।

**ঝুঁকি**: শূন্য — `getByIds()` একটা নতুন, বিশুদ্ধ (side-effect-free) ফাংশন, App.jsx-এর কোনো লাইন ছোঁয়া হয়নি, কোথাও import/কল হচ্ছে না এখনো। প্রোডাকশনের কোনো দোকানে কোনো আচরণগত প্রভাব নেই।

**পরবর্তী সেশনের জন্য প্রস্তাবিত সাব-ধাপ (এই এন্ট্রির অডিটের ভিত্তিতে, ছোট/স্বাধীন ধাপে ভাগ করা — সরাসরি একবারে বড় cutover ঝুঁকিপূর্ণ)**:
- **৭.১ (পরের প্রথম কাজ)**: `productsById` Map-based রেন্ডারিং-এর ৬৭টা ব্যবহার-সাইট আলাদাভাবে ক্যাটাগরাইজ করা — কোনগুলো সত্যিই *সব* প্রোডাক্ট চায় (যেমন এক্সপোর্ট/ব্যাকআপ) বনাম কোনগুলো শুধু *বর্তমানে-দৃশ্যমান* id-গুলোর ডেটা চায় (POS পিকার পেজ, Products লিস্ট পেজ, CustomerDetail-এর একটা কাস্টমারের ইনভয়েসের প্রোডাক্ট)। শুধু দ্বিতীয় গ্রুপই lazy/async-এ যাওয়ার যোগ্য।
- **৭.২**: একটা ছোট LRU/cache হুক (`useProductsByIds(ids)`) ডিজাইন — `getByIds()` ব্যবহার করে, ইতিমধ্যে-লোড আইডি রিফেচ না করে, `isSqliteEnabled()` false হলে সরাসরি ইন-মেমরি `productsById` ফলব্যাক (এই মাইগ্রেশনের সব জায়গায় যেমন হয়েছে সেই একই গার্ড-প্যাটার্ন)। প্রথমে POS পিকার-এ (সবচেয়ে ছোট ব্লাস্ট-রেডিয়াস না, কিন্তু এন্ট্রি ৪০ থেকেই SQL-অর্ডারড, তাই স্বাভাবিক পরের ধাপ) বা Products main list-এ (কম বিলিং-ঝুঁকি) — যেটা ছোট স্কোপ সেটা আগে।
- **৭.৩**: বুট সিকোয়েন্স বদলানো — `products` আর CRITICAL_KEYS (wave 1)-এ পুরো অ্যারে না এনে, invoices-এর windowing প্যাটার্নের (এন্ট্রি ২৪, "৬-মাস window") সমতুল্য কোনো ছোট/বাউন্ডেড সেট (বা শূন্য) এনে বাকিটা ৭.২-এর async hook দিয়ে চাহিদা-অনুযায়ী আনা। এটাই সত্যিকারের মেমরি-সাশ্রয় আনবে — কিন্তু ৭.১/৭.২ real-device-ভেরিফায়েড না হওয়া পর্যন্ত এই ধাপে হাত দেওয়া ঠিক হবে না (POS বিলিং কাউন্টারে পণ্য না-পাওয়া/ভুল দেখানো সবচেয়ে বড় ঝুঁকি, PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর নিয়ম #৪)।

**যা এখনো বাকি**:
- [ ] ৭.১ — ৬৭টা ব্যবহার-সাইটের category বিভাজন (এই সেশনে শুধু productsById-এর ৯টা সরাসরি রেফারেন্স লিস্ট করা হয়েছে, বাকিগুলো এখনো লাইন-বাই-লাইন দেখা হয়নি)
- [ ] ৭.২ — async cache hook ডিজাইন+কোড+টেস্ট
- [ ] ৭.৩ — বুট সিকোয়েন্স পরিবর্তন (আসল lazy-load)
- [ ] এন্ট্রি ৪০-এর POS picker real-device স্মোক-টেস্ট (এখনো আলাদাভাবে বাকি, ধাপ ৭-এর পূর্বশর্ত না হলেও অগ্রাধিকারে এখনো উপরে)

---

### [এন্ট্রি ৪১] — PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ৬ (SupplierPaymentModule/computeSupplierDueMap) SQL cutover — sandbox-ভেরিফায়েড + SQL-vs-JS প্যারিটি-টেস্টেড

**তারিখ**: ১৫ আগস্ট ২০২৬। **ট্রিগার**: "পরের ধাপ: ধাপ ৬ (SupplierPaymentModule) শুরু করুন" → `computeSupplierDueMap()` পড়ে fuzzy cross-collection merge-এর ঝুঁকি দেখে ব্যবহারকারীকে জিজ্ঞেস করা হলো → ব্যবহারকারীর ফাইনাল নির্দেশনা: **"আমি অ্যাপের সব SQL করব, এটাই ফাইনাল।"**

**প্রেক্ষাপট**: `computeSupplierDueMap(products, purchaseOrders, supplierPayments)` — শুধু single-table filtered aggregate না, বরং ৩টা কালেকশন জুড়ে ফাজি সাপ্লায়ার-নাম merge: প্রতিটা raw নাম `normalizeSupplierKey()` (lowercase+suffix-strip regex+typo-alias dictionary) দিয়ে normalize, একই normalized key-এর সবচেয়ে লম্বা raw নামকে canonical ডিসপ্লে-নাম বাছাই, তারপর productCount/totalStock/totalPurchased/paid/due অ্যাগ্রিগেট। প্রাথমিক প্রস্তাব ছিল শুধু `supplierPayments` dual-write করে aggregate JS-ই রাখা (কম ঝুঁকি, কিন্তু আংশিক SQL) — ব্যবহারকারী এটা প্রত্যাখ্যান করে পূর্ণ SQL cutover চাইলেন।

**ডিজাইন নীতি (এন্ট্রি ৪০-এর browse_rank-এর ধারাবাহিকতায়)**: normalize-লজিক (regex+alias lookup) SQLite-এ replicate করা হয়নি — বরং write-time-এ (JS `extract()`) `normalizeSupplierKey()` **আসল ফাংশনটাই** কল করে ফলাফল ফ্ল্যাট কলামে বসানো হয়েছে। SQL শুধু precomputed key দিয়ে GROUP BY/JOIN/SUM করে — set-based অ্যাগ্রিগেশন, কোনো string-processing SQL-এ চলে না। এতে "দুই জায়গায় একই fuzzy-matching লজিক আলাদাভাবে লেখা, কোনো একদিন out-of-sync হয়ে যাওয়া" ঝুঁকি সম্পূর্ণ দূর হয় (SQL পাথ ও JS ফলব্যাক পাথ — দুটোই একই `normalizeSupplierKey()` কল করে, শুধু কোন সময়ে (write-time vs read-time) সেটাই আলাদা)।

**কী করা হলো**:
1. `schema.sql`:
   - `products`-এ `supplier_due_key`/`supplier_due_raw` কলাম (company||supplier থেকে, entry ৩৬-এর `supplier_key`-এর থেকে সম্পূর্ণ আলাদা উদ্দেশ্য/সোর্স — সেটা category-ফলব্যাক সহ Inventory-গ্রুপিং-এর জন্য, এটা normalize-করা fuzzy-merge-এর জন্য)
   - `purchaseOrders`-এ একই দুইটা কলাম + `purchase_amount` (items-এর reduce, পুরো `_type` নির্বিশেষে — JS ফাংশনের ঠিক একই স্কোপ, entry ৩৮-এর `entry_type='pe'`-নির্দিষ্ট KPI ফিল্টার থেকে আলাদা)
   - নতুন `supplierPayments` টেবিল (`signed_amount` কলাম প্রিকম্পিউটেড — `type==='due' ? -amount : amount`, SQL-এ `SUM(signed_amount)` সরাসরি "paid" দেয়)
2. `DataStore.js`:
   - `normalizeSupplierKey` ইমপোর্ট (logic.js থেকে)
   - `productSupplierDueRaw()`/`poSupplierDueRaw()`/`paymentSupplierDueRaw()`/`supplierDueKeyOf()`/`poPurchaseAmount()` হেল্পার
   - HOT_FIELDS-এ products/purchaseOrders extract() আপডেট + নতুন supplierPayments এন্ট্রি
   - ALTER TABLE গার্ড (৫টা নতুন কলাম)
   - নতুন `getSupplierDueRows(businessType)` — একটা CTE-চেইন কোয়েরি: `raw_names` (৩ টেবিল UNION) → `canonical` (প্রতি key-তে দীর্ঘতম raw ভ্যারিয়েন্ট, `LENGTH()` দিয়ে) → `raw_variants` (group_concat, backward-compat lookup-এর জন্য) → `prod_agg`/`po_agg`/`pay_agg` (প্রতি টেবিলের GROUP BY SUM) → ফাইনাল LEFT JOIN।
3. App.jsx:
   - `supplierPayments` dual-write wiring (`_dsSupplierPaymentsRef` + effect) + `STORE_TO_ENTITY_TYPE`
   - নতুন শেয়ার্ড হুক `useSupplierDueRows(products, purchaseOrders, supplierPayments, businessType)` — `Dashboard` ও `SupplierPaymentModule` দুই জায়গাতেই (এন্ট্রি ৩৭/৩৮-এর ডুপ্লিকেট-লজিক-এড়ানো নীতি অনুসরণ করে)। `{ map, rows }` রিটার্ন করে — `map` ব্যাকওয়ার্ড-কম্প্যাট raw-নাম লুকআপের জন্য, `rows` sorted-list রেন্ডারের জন্য।
   - **🔴 বাগ ধরা পড়ল ও ঠিক হলো**: `SupplierPaymentModule`-এর `paymentSummary` (পেমেন্ট-হিস্ট্রি সামারি) raw (non-canonical) `supplierName` দিয়ে `supplierDueMap[name]` লুকআপ করে — SQL পাথে শুধু canonical নাম দিয়ে map বানালে এই লুকআপ ভুলভাবে `undefined`→`0` দিত। ফিক্স: SQL-এ `raw_variants` CTE (group_concat) যোগ করে প্রতিটা raw ভ্যারিয়েন্টও merged রো পয়েন্ট করানো হয়েছে — JS-এর `finalMap[raw] = ...` ব্যাকওয়ার্ড-কম্প্যাট আচরণের সমতুল্য।
   - `SupplierPaymentModule`-এ `businessType` প্রপ যোগ করতে হলো (আগে prop হিসেবে পাস হতো না, নতুন হুকের জন্য দরকার হলো — parent call site-এ ইতিমধ্যে scope-এ ছিল)।

**যাচাই**:
- ম্যানুয়াল প্যারিটি-স্ক্রিপ্ট দিয়ে প্রথমে SQL vs JS পাশাপাশি চালিয়ে দেখা হলো (multi-name-variant কেস) — হুবহু মিলেছে
- নতুন `datastore-supplier-due-tests.mjs` (৮টা কেস) — প্রতিটাতেই `getSupplierDueRows()` (SQL) বনাম আসল `computeSupplierDueMap()`+`uniqueSupplierRows()` (JS) সরাসরি পাশাপাশি তুলনা: নাম-ভ্যারিয়েন্ট merge+canonical selection, একাধিক আলাদা সাপ্লায়ার, due/paid sign convention, items-reduce purchase amount, খালি-নাম বাদ দেওয়া, rawVariants backward-compat, খালি ডেটাসেট, multi-product aggregation
- `npm test` (১৭৩ কেস, সব ক্লিন) + `test:golden-master` (১৫) + `test:fuzz` (৯ প্রপার্টি) + lint (0 error — বিল্ডের সময় একটা `businessType is not defined` এরর ধরা পড়েছিল ও ঠিক হয়েছে) + `vite build` — সব পাস

**⚠️ স্বীকৃত non-financial edge-case**: canonical *ডিসপ্লে-নাম* বাছাইয়ে দুটো ভিন্ন raw-নাম-ভ্যারিয়েন্ট ঠিক একই character-length হলে JS (insertion-order-based) ও SQL (`LENGTH()` টাই-ব্রেকে SQLite-এর নিজস্ব সিদ্ধান্ত) ভিন্ন ভ্যারিয়েন্ট বাছাই করতে পারে। টাকার হিসাব (productCount/totalStock/totalPurchased/paid/due) এতে প্রভাবিত হয় না — শুধু কোন বানানে নামটা দেখানো হবে সেটার একটা প্রান্তিক এজ-কেস।

**বাকি**: real-device ভেরিফিকেশন এখনো বাকি — sandbox+parity-টেস্ট-ভেরিফায়েড শুধু। ধাপ ৬ কোড-সম্পূর্ণ। পরের ধাপ: এন্ট্রি ৪০-এর real-device স্মোক-টেস্ট → ধাপ ৭ (products boot-load lazy) → Customers SQL cutover → "সব SQL" নির্দেশনা অনুযায়ী `AIPage_`-এর অবশিষ্ট JS অংশ (stockValue/lowStockItems/সাপ্তাহিক returns হিসাব)।

---

### [এন্ট্রি ৪০] — PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ৫ (POS product picker/SmartInvoiceBuilder) SQL cutover — কোড-সম্পূর্ণ, sandbox-ভেরিফায়েড, real-device বাকি

**তারিখ**: ১৫ আগস্ট ২০২৬। **ট্রিগার**: "পরের ধাপ: ধাপ ৫ (POS picker) শুরু করুন"।

**প্রেক্ষাপট (এন্ট্রি ৩২-এর অডিট থেকে)**: SmartInvoiceBuilder-এর ডিফল্ট-ব্রাউজ মোডে (সার্চ নেই) পণ্যগুলো দুই-ধাপের JS stable sort দিয়ে সাজানো হয় — প্রথমে demand_type (common আগে), তারপর availability (unavailable সবসময় শেষে)। এটা effectively একটা ৩-স্তরের priority অর্ডার তৈরি করে, কিন্তু `queryPage()` শুধু single-column keyset সাপোর্ট করে। এন্ট্রি ৩২-এ দুটো বিকল্প ছিল: (ক) `queryPage()` কোর ফাংশন বদলানো (৪+ শেয়ার্ড কল-সাইট, বেশি ঝুঁকি), অথবা (খ) precomputed combined sort-key কলাম। এই সেশনে (খ) বাছা হলো।

**কী করা হলো**:
1. **`browse_rank` ডিজাইন** — নতুন TEXT কলাম `"<tier_digit><name>"` ফরম্যাটে। tier = App.jsx-এর `isProductUnavailable()`+`demandType` লজিকের সমতুল্য single digit (0=available+common, 1=available+uncommon, 2=unavailable+common, 3=unavailable+uncommon)। শুধু `ORDER BY browse_rank ASC` দিয়েই lexicographic sort টিয়ার-তারপর-নাম অর্ডার দেয় — কোনো multi-column keyset বা `queryPage()` পরিবর্তন ছাড়াই।
2. `schema.sql`-এ `product_type`/`category`/`browse_rank` কলাম + ৪টা ইনডেক্স (deleted+browse_rank ও deleted+product_type+category+browse_rank কম্বিনেশন, `সব`/নির্দিষ্ট-ক্যাটাগরি/সার্ভিস — ৩টা WHERE-প্যাটার্নই কভার করতে)।
3. `DataStore.js`:
   - `logic.js` থেকে `getSellableStock` ইমপোর্ট
   - `computeBrowseTier(p)`/`computeBrowseRank(p)` (এক্সপোর্টেড, golden-master.mjs-এ ইউনিট-টেস্টের জন্য) — App.jsx-এর `isProductUnavailable()` ফাংশনের সাথে বাইট-বাই-বাইট মিলিয়ে
   - `HOT_FIELDS.products.extract()`-এ ৩টা নতুন কলাম যোগ
   - ALTER TABLE গার্ড (পুরনো DB ফাইলে নতুন কলাম যোগ করতে, এন্ট্রি ৩০-এর একই প্যাটার্নে)
4. **App.jsx (SmartInvoiceBuilder)** — `filteredProducts` memo-র পরে নতুন ব্রাউজ-পেজিনেশন ব্লক:
   - `browseIds`/`browseDone`/`browseLoading`/`browseFailed` state + `loadBrowsePage()`/`browseWhereFor()` — এন্ট্রি ৩০-এর Products list ব্রাউজের একই নামকরণ/প্যাটার্ন অনুসরণ করে
   - **🔴 গুরুত্বপূর্ণ নিরাপত্তা-সিদ্ধান্ত (entry 30 থেকে ইচ্ছাকৃতভাবে ভিন্ন)**: এন্ট্রি ৩০-এ SQL row-এর `data` (JSON snapshot) সরাসরি রেন্ডার হয়, কিন্তু POS picker সরাসরি বিলিং কাউন্টার (এন্ট্রি ৩২-এর staleness উদ্বেগ)। তাই এখানে SQL শুধু page-এর product-id অর্ডার দেয়; প্রতিটা id `productsByIdMap` (live `products` state থেকে বানানো Map) দিয়ে লুকআপ হয়ে আসল product অবজেক্ট রেন্ডার হয়। ফলে dual-write-এ সামান্যতম lag থাকলেও stock/price/availability ডেটা কখনো stale দেখানো হয় না — SQL শুধু *ক্রম* ঠিক করে, *ডেটা* না। সর্বোচ্চ ঝুঁকি: কোনো আইটেম কয়েক মিলিসেকেন্ডের জন্য "ভুল বাকেটে" দেখানো, যা পরের dual-write cycle-এ (stock কলাম যে cadence-এ আপডেট হয়, একই cadence) স্বয়ংক্রিয়ভাবে ঠিক হয়ে যায়।
   - `gridProducts = (useSqliteBrowse && browseProducts) ? browseProducts : filteredProducts` — null-ফলব্যাক প্যাটার্নে প্রথম লোডের আগে বা SQL ব্যর্থ হলে স্বয়ংক্রিয়ভাবে JS ফলব্যাক
   - সার্চ-অ্যাক্টিভ মোড সম্পূর্ণ অস্পৃষ্ট — `isSearchActive` true হলে `useSqliteBrowse` false, `filteredProducts`-এর hybrid FTS+scoring পাথ যেমন ছিল তেমনই চলে
   - `VirtuosoGrid`-এর `data`/`endReached` প্রপ + খালি-স্টেট চেক `gridProducts` ব্যবহার করতে আপডেট হয়েছে

**নতুন টেস্ট**:
- `golden-master.mjs`-এ ৮টা নতুন কেস (`computeBrowseTier`/`computeBrowseRank` — ৪টা টিয়ার কম্বিনেশন, সার্ভিস-সবসময়-available, demandType ডিফল্ট, ব্যাচ-ভিত্তিক মেয়াদোত্তীর্ণ)
- নতুন `datastore-pos-browse-tests.mjs` (৬টা কেস) — আসল `upsertMany()`→`queryPage()` end-to-end ফ্লো: ৪-টিয়ার অর্ডার+name ASC তাইব্রেক, deleted বাদ, ক্যাটাগরি ফিল্টার, সার্ভিস ফিল্টার, multi-page keyset pagination, re-upsert-এ browse_rank রিফ্রেশ

**যাচাই**: `npm test` (১৬৫ কেস, সব ক্লিন) + `test:golden-master` (১৫) + `test:fuzz` (৯ প্রপার্টি) + lint (0 error — নতুন ALTER TABLE গার্ডের `catch(_)` warning এন্ট্রি ৩০-এর একই accepted প্যাটার্নে) + `vite build` — সব পাস।

**⚠️ বাকি (পরের সেশনে সবার আগে)**:
- **real-device স্মোক-টেস্ট** — এটা POS picker, সরাসরি বিলিং কাউন্টার, তাই sandbox-ভেরিফিকেশন যথেষ্ট না। দেখতে হবে: (ক) ক্যাটাগরি ফিল্টার বদলালে সঠিক পণ্য আসছে কিনা, (খ) স্ক্রল করলে পরের পেজ ঠিকমতো লোড হচ্ছে কিনা (endReached), (গ) স্টক-আউট পণ্য সত্যিই তালিকার শেষে/disabled দেখাচ্ছে কিনা, (ঘ) দ্রুত পরপর কয়েকটা বিক্রির পরও picker-এর অর্ডার/availability ভুল না দেখানো
- dev panel দিয়ে JS-vs-SQL রিকনসিলিয়েশন (আগের এন্ট্রিগুলোর মতোই)
- পরের ধাপ: ধাপ ৬ (SupplierPaymentModule + ছোট কল-সাইট) → ধাপ ৭ (products boot-load lazy) → Customers SQL cutover

---

### [এন্ট্রি ৩৯] — `stockValue`/`lowStockItems`/`monthExpiredValue`/`monthExpiredCount` SQL cutover — useKpiStats-এর ধাপ ৩ পুরোপুরি সম্পূর্ণ, sandbox-ভেরিফায়েড

**তারিখ**: ১৫ আগস্ট ২০২৬। **ট্রিগার**: "stockVaLue/LowStockItems/monthExpiredValue/monthExpiredcount (products-নির্ভর অংশ) ইত্যাদি SQL-এ আনা হয়েছে কি?" → "হ্যাঁ, এখনই করুন"।

**প্রেক্ষাপট**: এন্ট্রি ৩৮-এর স্ক্রিনশটে useKpiStats-এর ৫টা ডেটা-সোর্সের নিচে একটা নোট ছিল — এই ৫টা (expenses+cashLogs+purchaseOrders+txns+returns) শেষ হলেও `stockValue`/`lowStockItems`/`monthExpiredValue`/`monthExpiredCount` (products-নির্ভর অংশ) SQL-এ আনা বাকি থাকবে। এন্ট্রি ৩৮-এ সেটা মিস হয়ে গিয়েছিল, ব্যবহারকারী জিজ্ঞেস করায় ধরা পড়ল।

**কী করা হলো**:
1. `schema.sql`-এ নতুন `stockMovements` টেবিল (id, source, month_key, value, updated_at, data) — শুধু `source='expired_removal'` এন্ট্রিই এই KPI-তে প্রাসঙ্গিক।
2. `DataStore.js`:
   - `HOT_FIELDS`-এ `stockMovements` এন্ট্রি (month_key = mv.monthKey, না থাকলে mv.dateKey-এর প্রথম ৭ ক্যারেক্টার)
   - `getInventoryCounts()`-এ (এন্ট্রি ৩৬-এর InventorySection-এর সাথে শেয়ার্ড ফাংশন) `stock_value` কলাম যোগ — `COALESCE(NULLIF(cost_price,0), NULLIF(price,0), 0) * COALESCE(stock,0)`, App.jsx-এর `(p.costPrice || p.price || 0) * (p.stock || 0)` লজিকের হুবহু SQL সমতুল্য (falsy 0/null উভয়ই ফলব্যাক ট্রিগার করে)। `critical` কাউন্টই lowStockItems-এর সংখ্যার সমতুল্য — নতুন কোনো ফাংশন লাগেনি।
   - নতুন `getExpiredRemovalTotals(bt, monthKey)`
3. App.jsx:
   - `stockMovements` dual-write wiring (`_dsStockMovementsRef` + effect) + `STORE_TO_ENTITY_TYPE`
   - দুটো নতুন শেয়ার্ড হুক — `useProductStockTotals(products, businessType)` ও `useExpiredRemovalTotals(stockMovements, businessType, monthKey)` — বাকি সবগুলোর মতোই SQL/JS ফলব্যাক প্যাটার্নে
   - `useKpiStats`-এর JS reduce/filter এই হুক দিয়ে প্রতিস্থাপিত। রিটার্ন ফিল্ড `lowStockItems` (product array) → `lowStockCount` (number) রিনেম হলো, কারণ `KpiCardsGrid` শুধু `.length` ব্যবহার করত — পুরো array পাস করার দরকার ছিল না।
4. **ইচ্ছাকৃত সিদ্ধান্ত (স্কোপ)**: `AIPage_`-এর নিজস্ব `stockValue`/`lowStockItems` (৩টা জায়গায় ব্যবহৃত — health score, smart actions, চ্যাট উত্তর) এখনো JS-ই রাখা হয়েছে, SQL cutover করা হয়নি। কারণ:
   - ওখানে পুরো product অবজেক্ট-অ্যারে লাগে (`.slice(0,3).map(p=>p.name)` ইত্যাদির জন্য), শুধু aggregate number না — SQL দিয়ে এটা আনতে হলে `getInventoryList('critical')`-এর মতো আলাদা list-fetching হুক লাগত, যেটা এই সেশনের স্কোপের বাইরে।
   - `products` prop এখনো পুরোপুরি in-memory (ধাপ ৭-এর lazy-load এখনো হয়নি) — তাই এই মুহূর্তে SQL কাটওভারের তাৎক্ষণিক memory/perf লাভ নেই, শুধু কোড-সঙ্গতির প্রশ্ন। যেহেতু ফর্মুলা দুই জায়গাতেই বাইট-বাই-বাইট একই থাকছে (কোনো বাগ-ফিক্স হচ্ছে না, শুধু cutover), useKpiStats আর AIPage_-এর সংখ্যায় কোনো ফারাক পড়বে না — তাই এন্ট্রি ৩৭/৩৮-এর duplicate-logic ঝুঁকি এখানে প্রযোজ্য না।

**নতুন টেস্ট**: `datastore-kpi-extra-tests.mjs`-এ ৩টা নতুন কেস যোগ — `getInventoryCounts()`-এর `stock_value` (costPrice falsy→price ফলব্যাক + deleted বাদ) ও `getExpiredRemovalTotals()` (source+month_key ফিল্টার + dateKey ফলব্যাক)।

**যাচাই**: `npm test` (১৪৯ কেস, সব ক্লিন) + `test:golden-master` (৭) + `test:fuzz` (৯ প্রপার্টি) + lint (0 error) + `vite build` — সব পাস।

**বাকি**: real-device ভেরিফিকেশন এখনো বাকি — sandbox-ভেরিফায়েড শুধু। **useKpiStats-এর ধাপ ৩ এখন সত্যিকার অর্থেই ১০০% সম্পূর্ণ** (৫টা ডেটা-সোর্স + products-নির্ভর অংশ)। পরের ধাপ: ধাপ ৫ (POS picker) → ধাপ ৬ (SupplierPaymentModule) → ধাপ ৭ (products lazy-load) → Customers SQL cutover।

---

### [এন্ট্রি ৩৮] — useKpiStats-এর বাকি ৪টা ডেটা-সোর্স (`cashLogs`/`purchaseOrders`/`txns`/`returns`) SQL cutover — ধাপ ৩ সম্পূর্ণ, sandbox-ভেরিফায়েড

**তারিখ**: ১৫ আগস্ট ২০২৬। **ট্রিগার**: "স্ক্রিনশট দেখুন। ধাপ ৩ কমপ্লিট করুন।"

**কী করা হলো**:
1. `schema.sql`-এ ৪টা নতুন টেবিল — `cashLogs`(id, type, amount, date_key, updated_at, data), `purchaseOrders`(id, entry_type, total_cost, date_key, updated_at, data — "type" SQL কীওয়ার্ড এড়াতে entry_type), `txns`(id, type, source, amount, invoice_id, date_key, updated_at, data), `returns`(id, invoice_id, refund_amount, cost_price, qty, refund_mode, date_key, updated_at, data) — সংশ্লিষ্ট ইনডেক্সসহ।
2. `DataStore.js`-এ `HOT_FIELDS`-এ ৪টা নতুন এন্ট্রি + ৪টা ডোমেইন-স্পেসিফিক অ্যাগ্রিগেট ফাংশন (expenses-এর জেনেরিক `getDateRangeAggregate()` পুনর্ব্যবহার করা হয়নি — প্রতিটাতেই extra type/source শর্ত বা voided-বাদ NOT EXISTS সাব-কোয়েরি লাগে):
   - `getCashLogTotal(bt, {dateKey, type})` — একটা date+type-এর SUM
   - `getPurchaseOrderTotals(bt, {todayKey, monthStartKey})` — 'pe' এন্ট্রির today cost/count + month cost
   - `getTxnTotals(bt, todayKey)` — todayBakiIncurred (invoice voided হলে বাদ) + todayJoma (নির্দিষ্ট source বাদ)
   - `getReturnsTotals(bt, {todayKey, monthStartKey})` — today/month refund + profit-impact + today cash-refund, voided ইনভয়েসের রিটার্ন বাদ
3. `purchaseOrders`-এর `date_key` কলাম App.jsx-এর `dateKey === todayKey || createdAt.startsWith(todayKey)` ফলব্যাক লজিকের সমতুল্য করতে `p.dateKey ?? p.createdAt.slice(0,10)` হিসেবে এক্সট্র্যাক্ট হয় (schema.sql/DataStore.js কমেন্ট দ্রষ্টব্য)।
4. App.jsx-এ ৪টা নতুন dual-write ref (`_dsCashLogsRef` ইত্যাদি) + সংশ্লিষ্ট save-effect-এ `dualWriteSqlite()` কল।
5. ৪টা নতুন শেয়ার্ড হুক (`useCashLogTotals`/`usePurchaseOrderTotals`/`useTxnTotals`/`useReturnsTotals`) — এন্ট্রি ৩৭-এর `useExpenseTotals`-এর ঠিক একই প্যাটার্নে (isSqliteEnabled() বন্ধ থাকলে সবসময় আগের JS ফিল্টার/রিডিউস, আচরণ অপরিবর্তিত)। **গুরুত্বপূর্ণ**: এই হুকগুলো `useKpiStats` ও `AIPage_` — দুই জায়গাতেই বসানো হয়েছে, যাতে এন্ট্রি ৩৭-এর আগে যেভাবে দুই কম্পোনেন্টে আলাদা JS কপি থাকায় ৩০ জুলাই ২০২৬-এর cash-sale মিসম্যাচ বাগ হয়েছিল, সেই প্যাটার্ন এখানে আর না ঘটে।
6. `AIPage_`-এর সাপ্তাহিক (`weekReturns`/`weekReturnsRefund`) হিসাব `returnsTotals` হুকের স্কোপের বাইরে (হুক শুধু today/month কভার করে) — তাই ইচ্ছাকৃতভাবে লোকাল JS-ই রাখা হয়েছে, নতুন করে হুক জটিল না করে।

**⚠️ এই সেশনে আবিষ্কৃত গ্যাপ (হারানো টেস্ট ফাইল)**: `package.json`-এর `test` স্ক্রিপ্ট `tests/datastore-expenses-tests.mjs` (এন্ট্রি ৩৭) ও `tests/datastore-inventory-tests.mjs` (এন্ট্রি ৩৬) রেফারেন্স করে, কিন্তু আপলোড করা zip-এ ফাইল দুটোই ছিল না — এন্ট্রি ৩৩-৩৫-এর "কখনো এই zip-এ আসেনি" প্যাটার্নের আরেকটা ঘটনা, সম্ভবত এন্ট্রি ৩৬/৩৭-এর ডেলিভারি zip-এ বাদ পড়ে গিয়েছিল। **ফিক্স**: DataStore.js-এর ডকব্লক/আচরণ অনুযায়ী দুটোই পুনর্গঠন করা হয়েছে —
- `datastore-inventory-tests.mjs`: ১২টা কেস (`getInventoryCounts`/`getInventoryList`/`getExpiryCandidates`/`getSupplierSummary`/`getProductsBySupplierKey`) — সবগুলো পাস
- `datastore-expenses-tests.mjs`: ৭টা কেস (`getDateRangeAggregate()`-এর dateKeyExact/dateKeyGte/dateKeyPrefix/amountColumn/edge-case) — সবগুলো পাস

পুনর্গঠিত সংস্করণ মূল হারানো ফাইলগুলোর সাথে হুবহু নাও মিলতে পারে, কিন্তু একই ফাংশনগুলোর মূল আচরণ/edge-case কভার করে। **সতর্কতা**: যদি ভবিষ্যতে কোনো সেশনে আসল মূল ফাইল পাওয়া যায় (অন্য কোনো ব্যাকআপ/আগের zip-এ), সেটা দিয়ে এই পুনর্গঠিত সংস্করণ প্রতিস্থাপন করাই ভালো — pinned case সংখ্যা/নির্দিষ্ট assertion ভিন্ন থাকতে পারে।

**নতুন টেস্ট**: `datastore-kpi-extra-tests.mjs` (৭টা কেস — এই সেশনের ৪টা নতুন অ্যাগ্রিগেট ফাংশন, প্রতিটার ২-৩টা edge-case সহ)।

**যাচাই**: `npm test` (১৪১ কেস, সব ক্লিন — logic ৭২ + schema ১৪ + integration ১০ + sync ২৪ + querypage ১০ + inventory ১২ + expenses ৭ + kpi-extra ৭) + `test:golden-master` (৭) + `test:fuzz` (৯ প্রপার্টি) + lint (0 error) + `vite build` — সব পাস।

**বাকি**: real-device ভেরিফিকেশন (dev panel দিয়ে) এখনো বাকি — শুধু sandbox/node:sqlite শিমে ভেরিফায়েড। ধাপ ৩ (useKpiStats-এর ৫টা ডেটা-সোর্স) এখন সম্পূর্ণ — পরের ধাপ: ধাপ ৫ (POS product picker, SmartInvoiceBuilder) → ধাপ ৬ (SupplierPaymentModule) → ধাপ ৭ (products boot-load lazy) → Customers SQL cutover।

---

### [এন্ট্রি ৩৭] — useKpiStats-এর ৫টা SQL-না-হওয়া ডেটা-সোর্সের প্রথমটা: `expenses` টেবিল + dual-write + todayExpense/monthExpense SQL cutover, sandbox-ভেরিফায়েড

**প্রেক্ষাপট**: ধাপ ৩ (`useKpiStats` গভীর অডিট) করতে গিয়ে দেখা গেল এই হুক ৭টা
ডেটা-সোর্স ব্যবহার করে (invoices/products/customers/txns/cashLogs/
purchaseOrders/expenses/returns) — কিন্তু ৫টার (txns/cashLogs/purchaseOrders/
expenses/returns) **কোনো SQL টেবিলই নেই**। তাই "useKpiStats SQL করা" আসলে
আগে এই ৫টার জন্য schema+dual-write+backfill (Phase 0+1+2 আবার, নতুন ডোমেইনে)
— একটা বহু-সেশনের কাজ। ব্যবহারকারীর সিদ্ধান্তে এই সেশনেই প্রথম টেবিল (`expenses`,
সবচেয়ে সরল শেপ বলে প্রথমে বাছা) দিয়ে শুরু করা হলো।

**যা করা হয়েছে**:
1. `schema.sql` — নতুন `expenses` টেবিল (`id`, `category`, `amount`, `date_key`,
   `updated_at`, `data`) + `date_key` ইনডেক্স। কোনো `deleted` কলাম দরকার হয়নি —
   `deleteExpense()` হার্ড-ডিলিট করে (কোনো soft-delete ফ্ল্যাগ নেই), তাই
   `dualWriteSqlite()`-এর `removedIds → remove()` পাথ (আসল SQL DELETE) সরাসরি
   প্রযোজ্য। এটা নতুন টেবিল বলে কোনো `ALTER TABLE` গার্ড লাগেনি (`CREATE TABLE
   IF NOT EXISTS` প্রতি `getDb()`-এ এমনিতেই চলে, বিদ্যমান DB ফাইলেও নতুন টেবিল
   যোগ হয়ে যায়)।
2. `DataStore.js` — `HOT_FIELDS.expenses` extract। নতুন জেনেরিক
   `getDateRangeAggregate(businessType, store, opts)` — `dateKeyExact`/
   `dateKeyGte`/`dateKeyPrefix` তিনটা অপশন সাপোর্ট করে, `store` প্যারামিটার
   নিয়ে ডিজাইন করা হয়েছে যাতে ভবিষ্যতে cashLogs/purchaseOrders টেবিল যোগ
   হলে পুনর্ব্যবহার করা যায়। **🔑 সূক্ষ্ম নোট**: App.jsx-এর `monthExpense` ফিল্টার
   আসলে `>= monthStartKey` (prefix-ম্যাচ **না**!) — তাই `dateKeyGte` আলাদা
   অপশন হিসেবে যোগ করা হয়েছে (`dateKeyPrefix` ব্যবহার করলে নেভিগেট করা অতীত
   মাসে ভুল ফলাফল দিত, কারণ prefix শুধু ওই এক মাসেই সীমাবদ্ধ করে ফেলে, যেখানে
   আসল আচরণ ওই মাস থেকে আজ পর্যন্ত সবকিছু ধরে)।
3. `App.jsx` — `STORE_TO_ENTITY_TYPE`-এ `expenses:"expense"` যোগ, dual-write
   ওয়্যারিং (`_dsExpensesRef` + `dualWriteSqlite()` কল, `expenses`-এর বিদ্যমান
   local-save `useEffect`-এর পাশে)। নতুন শেয়ার্ড হুক `useExpenseTotals(expenses,
   businessType, todayKey, monthStartKey)` — **`useKpiStats` ও `AIPage_` দুই
   জায়গাতেই** ব্যবহৃত (আগে দুই জায়গায় হুবহু ডুপ্লিকেট JS ছিল — ঠিক এই ধরনের
   ডুপ্লিকেশনের কারণেই ৩০ জুলাই ২০২৬-এ cash-sale মিসম্যাচ বাগ হয়েছিল, একটা ফিক্স
   একজায়গায় হয়েছিল অন্যজায়গায় কপি হয়নি)। `isSqliteEnabled()` বন্ধ থাকলে
   (ডিফল্ট) সবসময় আগের JS ফিল্টার/রিডিউস — আচরণ অপরিবর্তিত। `useKpiStats`-এর
   পুরো বডি `React.useMemo()`-এ মোড়ানো বলে (hooks নিয়ম অনুযায়ী মেমোর ভেতরে হুক
   কল করা যায় না) `todayKey`/`monthStartKey` মেমোর *বাইরে* হালকাভাবে আলাদা করে
   কম্পিউট করে `useExpenseTotals()`-কে দেওয়া হয়েছে, ফলাফল মেমোর dependency-তে
   যোগ। `DailySummaryModule` (২ call site) ও `AIPage`-এ `businessType` prop
   নতুন করে থ্রেড করা হয়েছে (আগে এই দুই কম্পোনেন্টে ছিলই না)।
4. `tests/datastore-expenses-tests.mjs` — নতুন ফাইল, ৭টা কেস (dateKeyExact/
   dateKeyGte/dateKeyPrefix, ফিল্টার-বিহীন, খালি-রেঞ্জ, NULL amount, হার্ড-
   ডিলিটের পর অ্যাগ্রিগেট) — `node:sqlite` শিম দিয়ে। `package.json`-এ যোগ।

**যাচাই**: `npm test` — সব ১৩৯টা কেস (৭২+১৪+১০+২৪+১০+১২+**৭ নতুন**) পাস। lint —
নতুন কোনো error/warning (একটা নতুন `react-hooks/exhaustive-deps` warning
ধরা পড়েছিল `expenses` unnecessary dep নিয়ে, ঠিক করা হয়েছে)। `vite build` —
ক্লিন।

**যা এখনো বাকি**: real-device টেস্ট। বাকি ৪টা টেবিল (`txns`, `cashLogs`,
`purchaseOrders`, `returns`) — এখনো শুরু হয়নি, প্রতিটাই এই একই প্যাটার্নে
(schema+dual-write+HOT_FIELDS+aggregate helper) আলাদা সেশনে করতে হবে।

**পরের ধাপ**: পরবর্তী টেবিল (`cashLogs` বা `purchaseOrders` — যেটাই পরে বাছা হয়)।

---

### [এন্ট্রি ৩৬] — PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ২ (InventorySection/Dashboard KPI+ডিটেইল লিস্ট+সাপ্লায়ার-গ্রুপিং) SQL cutover সম্পূর্ণ, sandbox-ভেরিফায়েড — real-device টেস্ট বাকি

**⚠️ এন্ট্রি ৩৩-৩৫ সম্পর্কে**: এই তিনটা নম্বর ইচ্ছাকৃতভাবে খালি রাখা হলো। এগুলো একটা
আলাদা শেয়ারড/স্ক্রিনশট-ভিত্তিক চ্যাটে হয়েছিল (ধাপ ৫ বন্ধ করা → আবার খোলা →
bounded-staleness `sweepExpiredAvailability()` ডিজাইন শুরু) — কিন্তু সেই সেশনের
কোড কখনো এই প্রজেক্ট zip-এ আসেনি (আপলোড হওয়া zip এন্ট্রি ৩২-এর অবস্থাতেই ছিল)।
এই সেশনে সিদ্ধান্ত হয়েছে সেই অ্যাপ্রোচ পুরোপুরি বাদ দিয়ে বরং ধাপ ২/৩/৫/৬/৭
(পুরো products/customers SQL-based করা) এগিয়ে নেওয়া হবে, ছোট/নিরাপদ থেকে ক্রমান্বয়ে।

**যা করা হয়েছে (ধাপ ২)**:
1. `schema.sql` — products টেবিলে ৩টা নতুন কলাম: `min_stock_alert` (REAL, NULL হলে
   কোয়েরিতে `COALESCE(min_stock_alert, 5)`), `nearest_expiry_date` (TEXT — qty>0
   এমন সব ব্যাচের মধ্যে সবচেয়ে কাছের expiryDate, এক্সপায়ার্ড হোক বা না — একটা raw
   ক্যালেন্ডার-তারিখ fact, কখনো stale হয় না, দেখুন নিচের নোট), `supplier_key`
   (company||category||"অজ্ঞাত")। + ৪টা নতুন ইনডেক্স। এন্ট্রি ৩০-এর প্যাটার্নেই
   `getDb()`-এ ৩টা নতুন `ALTER TABLE ... ADD COLUMN` গার্ড।
2. `DataStore.js` — `HOT_FIELDS.products.extract()` এই ৩টা নতুন কলাম বের করে
   (নতুন `computeNearestExpiryDate()` হেল্পার)। নতুন এক্সপোর্ট: `getInventoryCounts()`,
   `getInventoryList(kind)` ('all'/'critical'/'out'), `getExpiryCandidates()`,
   `getSupplierSummary()` (GROUP BY), `getProductsBySupplierKey()`।
3. **🔑 staleness-ডিজাইন নোট (কেন এন্ট্রি ৩৩-৩৫-এর POS সমস্যা এখানে প্রযোজ্য না)**:
   `nearest_expiry_date` কোনো "এক্সপায়ার্ড কি না" স্ট্যাটাস স্টোর করে না, শুধু raw
   তারিখ — SQL শুধু এটা দিয়ে candidate সেট **narrow** করে (ইনডেক্স সিক), আসল
   expired/near-expiry বিভাজন App.jsx-এর বিদ্যমান JS লজিকেই থাকে (read-time
   `new Date()` তুলনা, ঠিক আগের মতোই) — শুধু ইনপুট এখন পুরো `products`-এর বদলে
   SQL-নারো করা ছোট candidate অ্যারে। তাই এখানে কোনো sweep/cron/expire-mechanism
   লাগেনি, POS picker (ধাপ ৫)-এর সমস্যা থেকে সম্পূর্ণ ভিন্ন প্রকৃতির।
4. `App.jsx` — নতুন শেয়ার্ড হুক `useInventoryData(products, businessType)`
   (module-scope, InventorySection ও Dashboard দুটোতেই ব্যবহৃত — আগে এই দুই
   জায়গায় ৭টা `useMemo` হুবহু ডুপ্লিকেট ছিল, এখন একটাই সোর্স)। `isSqliteEnabled()`
   বন্ধ থাকলে (ডিফল্ট, সব ৫০০ দোকানে) সবসময় আগের JS পাথ — **কোনো live shop-এ
   আচরণ পাল্টায়নি**। চালু থাকলে (dev-প্যানেল দিয়ে ম্যানুয়ালি এনাবল করা ডিভাইসে) SQL
   থেকে আনে, ব্যর্থ/লোডিং হলে সাইলেন্টলি JS ফলব্যাক। supplier-detail পেজের জন্য
   আলাদা lazy fetch হুক (শুধু ওই পেজে থাকলেই কল হয়)।
5. `tests/datastore-inventory-tests.mjs` — নতুন ফাইল, ১২টা কেস (counts, list
   filtering, expiry candidate narrowing legacy+batches উভয় path, supplier
   summary/GROUP BY, supplier-key lookup) — `node:sqlite` শিম দিয়ে আসল
   `DataStore.js` টেস্ট করে (queryPage টেস্টের প্যাটার্নে)। `package.json`-এর
   `test` স্ক্রিপ্টে যোগ করা হয়েছে।

**যাচাই**: `npm test` — সব ১৩২টা কেস (৭২+১৪+১০+২৪+১০+**১২ নতুন**) পাস। `npm run lint`
— নতুন কোনো error না (শুধু pre-existing warning প্যাটার্নের সাথে সামঞ্জস্যপূর্ণ ২-১টা
`catch(_)` warning, ঠিক demand_type-এর মতোই)। `vite build` — ক্লিন বিল্ড, নতুন কোনো
error/warning না।

**যা এখনো বাকি**: real-device টেস্ট (dev-প্যানেলে `isSqliteEnabled()` চালু করে
InventorySection কার্ড + all/critical/out/expired/near-expiry/supplier/
supplier-detail পেজ — সব মিলিয়ে JS-পাথের সাথে ফলাফল মিলছে কিনা)। এই সেশনে
নেটওয়ার্ক/npm সক্ষম sandbox থাকলেও real Android ডিভাইস নেই।

**পরের ধাপ**: ধাপ ৩ (KPI/aggregate — Dashboard-এর অন্যান্য কার্ড, এখনো audit করা হয়নি)।

---

### [এন্ট্রি ৩২] — PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ৫ (POS product picker) — ডিজাইন-অডিট সম্পূর্ণ, কোড ইচ্ছাকৃতভাবে শুরু করা হয়নি

**প্রসঙ্গ**: এন্ট্রি ৩১-এর পর ব্যবহারকারী ধাপ ৫ (POS picker, `SmartInvoiceBuilder`) নিয়ে এগোতে বলেছিলেন। কোড অডিট করে দেখা গেল এটা প্ল্যানের ধারণার চেয়ে জটিল — এন্ট্রি ৩০ (Products main list)-এর প্যাটার্ন এখানে সরাসরি কপি করা যাবে না।

**যা পাওয়া গেছে (`SmartInvoiceBuilder`, লাইন ~১৭৯০১-২০২৬৮)**:
- ডিফল্ট-ব্রাউজ (সার্চ নেই) অবস্থায় **দুই-স্তরের sort**: (১) common/uncommon বাকেট (`demandType`), (২) তারপর **পুরো ফলাফলের উপর আবার** — স্টক-আউট/মেয়াদ-উত্তীর্ণ পণ্য (`isProductUnavailable()`, লাইভ `stock`+ব্যাচ এক্সপায়ারি-নির্ভর) সবসময় লিস্টের একদম শেষে, বাকি অর্ডার অক্ষুণ্ণ রেখে।
- ক্যাটাগরি ফিল্টার (`সব`/`সার্ভিস`/নির্দিষ্ট ক্যাটাগরি) একটা JS filter, `category` ফিল্ড schema-তে কোনো promoted কলাম না — এখনো `data` JSON ব্লবের ভেতরে।
- সার্চ-অ্যাক্টিভ অবস্থায় hybrid FTS+`productMatchScore()` প্যাটার্ন ইতিমধ্যেই আছে (এন্ট্রি ২০-এ প্রমাণিত), এখানে নতুন কিছু লাগবে না।

**🔴 কেন এন্ট্রি ৩০-এর প্যাটার্ন এখানে সরাসরি কপি করা নিরাপদ না**:
- `DataStore.queryPage()` শুধু single-column keyset সাপোর্ট করে (এন্ট্রি ২৫-এর সীমাবদ্ধতা)। কিন্তু এখানে দরকার effectively ৩-স্তরের অর্ডার (unavailable-status → demand_type → name)।
- **সবচেয়ে গুরুত্বপূর্ণ সমস্যা**: "unavailable আইটেম সবসময় লিস্টের একদম শেষে" এই নিয়ম **page-by-page SQLite fetch-এ ভেঙে যায়** — ১ম পেজে একটা স্টক-আউট আইটেম এলে সেটাকে পুরো লিস্টের শেষে (হাজারতম পজিশনে) নিয়ে যাওয়া একটা single-page query দিয়ে সম্ভব না; পুরো ডেটাসেট-স্কোপড জ্ঞান লাগে। এটা "products list" (এন্ট্রি ৩০)-এর সরল two-bucket ডিজাইনের চেয়ে fundamentally আলাদা সমস্যা।
- সমাধানের জন্য দুটো বিকল্প, দুটোই বড়/ঝুঁকিপূর্ণ কাজ: (ক) `queryPage()` কোর ফাংশনকে multi-column keyset সাপোর্ট দিয়ে বদলানো — কিন্তু এটা shared, ৪+ কল-সাইটে ইতিমধ্যে প্রমাণিত ফাংশন, টেস্ট-বিহীন sandbox-এ এখানে হাত দেওয়া সবচেয়ে ঝুঁকিপূর্ণ; (খ) একটা নতুন combined sort-key কলাম ডিজাইন করা (যেমন `availability_rank` — precomputed, dual-write-এ populate) যাতে single-column ORDER BY দিয়ে কাজ চলে, কিন্তু এটা নতুন write-path লজিক ও নতুন সিঙ্ক-বাগের সুযোগ তৈরি করে (স্টক প্রতি বিক্রিতে বদলায়, তাই এই কলাম প্রতি stock-update-এ রিফ্রেশ করা লাগবে)।
- **স্টক ডেটার staleness ঝুঁকিও অন্যদের চেয়ে বেশি এখানে**: এটা সরাসরি বিলিং কাউন্টার — dual-write shadow SQLite যদি সামান্যতম lag করে, দোকানদার আসলে স্টক-আউট পণ্য বিক্রি করার চেষ্টা করতে পারে। Products main list (এন্ট্রি ৩০)-এ এই ঝুঁকি নেই কারণ ওটা শুধু ব্রাউজ/এডিট স্ক্রিন, বিক্রি-সিদ্ধান্ত নেয় না।

**সিদ্ধান্ত**: এই সেশনে কোনো কোড লেখা হয়নি। নেটওয়ার্ক/টেস্ট-বিহীন sandbox-এ, লাইভ বিলিং কাউন্টারের জন্য নতুন multi-key sort ডিজাইন বা core `queryPage()` পরিবর্তন ব্লাইন্ডলি লেখা দায়িত্বহীন হতো (চিরস্থায়ী নিয়ম #৪ লঙ্ঘন করত — প্রতিটা ধাপের পর টেস্ট)।

**পরের সেশনের জন্য প্রস্তাবিত পথ (অগ্রাধিকার-ক্রমে)**:
1. প্রথমে সিদ্ধান্ত নিতে হবে: `queryPage()` বদলানো (সব কল-সাইটে প্রভাব) vs. নতুন `availability_rank` কলাম (শুধু এই স্ক্রিনে প্রভাব, কিন্তু নতুন write-path)
2. যেটাই বাছুন, `npm test` সহ একটা নেটওয়ার্ক-সক্ষম সেশনে (`datastore-querypage-tests.mjs` তাৎক্ষণিক ফিডব্যাক দেবে) করা উচিত, sandbox-এ ব্লাইন্ডলি না
3. real-device স্মোক-টেস্ট বিশেষভাবে জরুরি: স্টক-আউট পণ্য আসলেই picker-এ শেষে/disabled দেখাচ্ছে কিনা, কারণ এখানে ভুল হলে সরাসরি ভুল বিক্রি হতে পারে

---

### [এন্ট্রি ৩১] — PRODUCTS_ONDEMAND_MIGRATION_PLAN.md ধাপ ১ সম্পূর্ণ (স্কোপ-সংশোধিত), ধাপ ২/৩ সম্পর্কে গুরুত্বপূর্ণ কৌশলগত সিদ্ধান্ত

**প্রসঙ্গ**: হারানো `PRODUCTS_ONDEMAND_MIGRATION_PLAN.md` ফাইল পুনরুদ্ধার হওয়ার পর ব্যবহারকারী ধাপ ১+২+৩ এক সেশনে করতে বলেছিলেন। কোড অডিট করে দেখা গেল ধাপ ১-এর ইনভেন্টরি (কোন কম্পোনেন্টে local `prodMap` আছে) স্টেল ছিল, আর ধাপ ২/৩ আসলে এখনই করলে কোনো real benefit নেই — নিচে বিস্তারিত।

**✅ ধাপ ১ (Map consolidation, ক্যাটাগরি A) — সম্পূর্ণ, কিন্তু স্কোপ সংশোধিত**:
- **প্ল্যানে লেখা ৪টা কম্পোনেন্ট (`CustomerDetail`, `ExpenseTracker`, `AuditTrailModule`, `InvoiceVoidModal`)-এর কোনোটাতেই আসলে local `prodMap` পাওয়া যায়নি** — লাইন-বাই-লাইন অডিটে দেখা গেছে এগুলো শুধু `products` prop গ্রহণ করে সরাসরি child-এ পাস করে দেয়, নিজে lookup করে না। প্ল্যানের লাইন-রেফারেন্স স্টেল ছিল (আগের কোনো ভার্সনের কোড থেকে এসেছিল সম্ভবত)।
- আসল local `prodMap` পাওয়া গেছে দুই জায়গায়: `buildDailySummaryData()` (plain function) আর `DailySalesStockCard` (React component)।
- **`buildDailySummaryData()`-এ swap করা হয়েছে** — global `productsById` (getState() non-reactive প্যাটার্ন, বিদ্যমান ৭টা কল-সাইটের সাথে সামঞ্জস্যপূর্ণ) ব্যবহার, safety-net fallback সহ (productsById খালি থাকলে পুরনো লোকাল Map-এ ফলব্যাক)। সব ৫টা কল-সাইট (৯০৯২, ১১৯৭৭, ১২৪০০, ২১৯৬১, ২২৫০৭, ৩১৮০৫ লাইন এলাকায়) অপরিবর্তিত live `products` state পাস করে, তাই ডেটা-সোর্স হুবহু অভিন্ন — কোনো আচরণ-পরিবর্তন নেই।
- **`DailySalesStockCard`-এ ইচ্ছাকৃতভাবে স্পর্শ করা হয়নি** — এটা React component, আর কোডবেসে global `productsById`-কে **reactive hook হিসেবে** ব্যবহারের কোনো প্রমাণিত প্যাটার্ন নেই (সব বিদ্যমান ব্যবহার `getState()`-ভিত্তিক, callback/event-handler-এ, render-এ না)। রেন্ডার-টাইমে swap করলে timing/staleness ঝুঁকি হতে পারে যা এই সেশনে verify করার উপায় নেই (নেটওয়ার্ক/টেস্ট-বিহীন sandbox)। সামান্য লাভের জন্য অপ্রমাণিত ঝুঁকি নেওয়া হয়নি।

**🔴 গুরুত্বপূর্ণ কৌশলগত সিদ্ধান্ত — ধাপ ২ ও ৩ এই মুহূর্তে ইচ্ছাকৃতভাবে শুরু করা হয়নি**:
- ধাপ ২ (InventorySection নিম্ন-স্টক অ্যালার্ট) অডিট করে দেখা গেছে `allStock`/`criticalStock`/`stockOut` — এই তিনটাই আসলে **কোথাও লিস্ট হিসেবে রেন্ডার হয় না়, শুধু `.length` (count) হিসেবে ৩টা KPI কার্ডে দেখানো হয়**। এটা list-rendering সমস্যা না, count সমস্যা।
- মূল কারণ: `products` array এই মুহূর্তে (ধাপ ৭-এর আগ পর্যন্ত, প্ল্যানের নিজের চিরস্থায়ী নিয়ম #৪ অনুযায়ী) **সবসময়ই পুরোপুরি মেমরিতে থাকবে**। তাই `products.filter(...).length` (useMemo-তে একবার) এমনিতেই সস্তা (১ লাখ আইটেমেও কয়েক মিলিসেকেন্ড)। এটাকে SQL query-তে বদলাতে গেলে নতুন `min_stock_alert` কলাম + `ALTER TABLE` গার্ড (এন্ট্রি ৩০-এর মতো আরেকটা সম্ভাব্য migration-gap ঝুঁকি) + backfill + fallback লজিক লাগবে — **নতুন ঝুঁকি যোগ হবে, কিন্তু কোনো real মেমরি/স্পিড লাভ হবে না**, যতক্ষণ না ধাপ ৭ (boot-লোড লেজি করা) নিজে হয়।
- **এই একই যুক্তি ধাপ ৩ (`useKpiStats` + Dashboard-এর ২৩টা aggregate ব্যবহার)-এও প্রযোজ্য** — এগুলোও `products` পুরোপুরি মেমরিতে থাকা অবস্থায় একবার-গণনা করা aggregate, SQL-এ বদলালে আচরণ একই থাকবে কিন্তু ঝুঁকি (নতুন schema/query/fallback প্রতিটা KPI-এর জন্য) যোগ হবে বিনা লাভে।
- **সংশোধিত সুপারিশ (মূল প্ল্যানের অর্ডার আপডেট)**: ধাপ ২, ৩, ৬ (সবই aggregate/count টাইপ, `products` মেমরি-রেসিডেন্ট থাকা অবস্থায় SQL-এ কোনো লাভ নেই) — এগুলো **ধাপ ৭-এর ঠিক আগে/সাথে** করা উচিত, যখন `products` boot-লোড আসলেই লেজি হচ্ছে এবং তখন SQL query সত্যিকারের প্রয়োজন হয়ে দাঁড়াবে। এখনই করলে শুধু ঝুঁকি (schema migration bug-এর সুযোগ) যোগ হয়, বাস্তব সুবিধা শূন্য। **পরবর্তী বাস্তবিক-মূল্যবান ধাপ তাই ধাপ ৪ (products list, ইতিমধ্যে এন্ট্রি ৩০-এ সম্পূর্ণ) সম্পন্ন হওয়ায়, এখন সরাসরি ধাপ ৫ (POS picker, সবচেয়ে ঝুঁকিপূর্ণ কিন্তু একমাত্র বাকি যেটা list-rendering/UX ঘিরে, count/aggregate না)** — অথবা ধাপ ৭-এর পূর্বশর্ত হিসেবে ২/৩/৬ একসাথে গুচ্ছ করে করা, তখনই যখন boot-লোড লেজি করার কাজও শুরু হবে।

**⚠️ যাচাই করা যায়নি**: `buildDailySummaryData()`-এর swap নেটওয়ার্ক-বিহীন sandbox-এ কোড-রিভিউ-লেভেলে যাচাই হয়েছে, `npm test`/real-device স্মোক-টেস্ট (Dashboard-এর "আজকের লাভ/লস" সংখ্যা আগের মতোই আসছে কিনা) পরের ধাপ।

---

### [এন্ট্রি ৩০] — Products main list ডিফল্ট-ব্রাউজ pagination (#২, স্কোপড: শুধু render/sort SQLite-এ, `products` state মেমরিতেই থাকে)

**স্কোপ**: PRODUCTS_ONDEMAND_MIGRATION_PLAN.md-এর ধাপ ৪ অনুযায়ী — Products main list স্ক্রিনের **ডিফল্ট ব্রাউজ (সার্চ নেই)** অবস্থায় রেন্ডারিং+সর্ট এখন SQLite `queryPage()` থেকে পেজ-করে-করে আসে, পুরো `products` array-এর উপর JS `.sort()` চালানোর বদলে। **সার্চ-অ্যাক্টিভ অবস্থায় কিছুই বদলায়নি** — বিদ্যমান hybrid FTS+`productMatchScore()` পাথ (`filteredAll`) সম্পূর্ণ অপরিবর্তিত। `products` state নিজে এখনো পুরোপুরি মেমরিতেই থাকে (POS বিলিং ইত্যাদির জন্য এখনো দরকার) — এই ধাপে শুধু **এই একটা স্ক্রিনের রেন্ডার/সর্ট খরচ** কমেছে, boot-টাইম মেমরি লোড কমেনি (সেটা প্ল্যানের ধাপ ৭, অনেক দূরে)।

**কেন তিনটা সংলগ্ন কাজ ইচ্ছাকৃতভাবে এই ধাপের বাইরে রাখা হলো** (এই reasoning মূলত `PRODUCTS_ONDEMAND_MIGRATION_PLAN.md`-এ ছিল, কিন্তু সেই ফাইল GitHub-এ push হয়নি বলে হারিয়ে গিয়েছিল — এখানে recovered/re-documented, ২০২৬-০৮-১৪):
- **POS product picker (SmartInvoiceBuilder) না ছোঁয়ার কারণ**: এটা সরাসরি বিলিং কাউন্টারে চলে — দোকানদার প্রতিদিন এখান থেকেই invoice বানান। এখানে SQLite pagination বসাতে গেলে স্টক-এডিট, রিয়েল-টাইম availability check-এর সাথে ইন্টারঅ্যাক্ট করতে হতো। বাগ হলে সরাসরি বিক্রি আটকে যেতে পারত। তাই আলাদাভাবে, সাবধানে করার জন্য প্ল্যানের পরের ধাপে রাখা হয়েছে।
- **`products` state পুরোপুরি মেমরিতে রাখার কারণ**: এটা শুধু list screen-এর জিনিস না — পুরো অ্যাপ জুড়ে (POS, Dashboard, batch management, export...) ২০টার বেশি জায়গায় ব্যবহৃত হয় একটা top-level state হিসেবে। এটাকে windowed/paginated বানাতে গেলে প্রতিটা ব্যবহারের জায়গা টাচ করা লাগবে — এটা একটা multi-week প্রজেক্ট, নেটওয়ার্ক/টেস্ট ছাড়া এক সেশনে ব্লাইন্ডলি করাটা দায়িত্বহীন হতো। এজন্যই invoices-এর মতো সরল "৬ মাস পরে আর্কাইভ" প্যাটার্নও এখানে খাটে না — invoices-এর প্রাকৃতিক cutoff আছে, কিন্তু products-এর নেই (৫ বছর আগের প্রোডাক্টও আজ বিক্রি হতে পারে, মেমরিতে রেডি থাকতে হবে)।
- **বাকি ~২৩টা call-site (Dashboard-এর ২৩টা, KPI, ইনভেন্টরি অ্যালার্ট, supplier due ইত্যাদি) না ছোঁয়ার কারণ**: এগুলো aggregate/reduce লজিক — এগুলোকে SQL query-তে বদলাতে হলে প্রতিটা জায়গার লজিক আলাদাভাবে verify করা লাগবে। এই ধাপের স্কোপ ছিল শুধু list screen-এর render/sort optimize করা, ডেটা-সোর্স আর্কিটেকচার বদলানো না।
- **সংক্ষেপে**: এই তিনটাই আলাদা, বড় কাজ — এই ধাপে ঢুকিয়ে দিলে ঝুঁকি অনেক বেড়ে যেত, আর এই ধাপে যেটুকু হয়েছে সেটাই তখনো test-ভেরিফায়েড ছিল না। তাই `PRODUCTS_ONDEMAND_MIGRATION_PLAN.md`-এ আলাদা ধাপ হিসেবে রাখা হয়েছে (৭ ধাপ: Map consolidation → নিম্ন-স্টক অ্যালার্ট → KPI অডিট → list pagination → POS picker → supplier due → boot-লোড লজিক), প্রতিটা আগেরটা real-device ভেরিফাই হওয়ার পর পরেরটা শুরু করার নিয়মে।

**স্কিমা পরিবর্তন (`schema.sql` + `DataStore.js`)**:
- `products` টেবিলে নতুন `demand_type TEXT` কলাম + কম্পোজিট ইনডেক্স `idx_products_demand_name(demand_type, name)` যোগ হলো।
- `HOT_FIELDS.products` (DataStore.js)-এ `demand_type` কলাম+extract (`p.demandType ?? null`) যোগ হলো — এখন থেকে প্রতিটা dual-write এই কলাম পপুলেট করবে।
- **🔴 গুরুত্বপূর্ণ মাইগ্রেশন-গ্যাপ যেটা এই সেশনেই ধরে ফিক্স করা হয়েছে**: `getDb()` শুধু `CREATE TABLE IF NOT EXISTS` চালায়, যা আগে-থেকে-তৈরি DB ফাইলে নতুন কলাম যোগ করে না (no-op) — এতে পুরনো DB-তে `CREATE INDEX ... ON products(demand_type, ...)` "no such column" এরর দিয়ে **পুরো schema execute() ভেঙে দিত** (মানে আগের সেশনের টেস্ট-শপের DB নিয়ে অ্যাপ বুট করলে ক্র্যাশ করত)। ফিক্স: `restOfSchema` execute()-এর ঠিক আগে একটা আলাদা `ALTER TABLE products ADD COLUMN demand_type TEXT` (try/catch-এ, "duplicate column"/"no such table" দুটোই নিরাপদে ignore) — এটা পুরনো DB-তে কলাম আগেভাগে যোগ করে দেয়, তারপর CREATE INDEX নিরাপদে চলে।
- **⚠️ বিদ্যমান SQLite ডেটার জন্য এখনো একটা গ্যাপ থেকে যাচ্ছে**: ALTER TABLE কলাম যোগ করলেও, আগে থেকে migrate/backfill হওয়া রেকর্ডগুলোর `demand_type` মান NULL-ই থাকবে যতক্ষণ না সেই রেকর্ড আবার touch হয় (নতুন update ট্রিগার dual-write) — NULL-কে WHERE ক্লজে "common" হিসেবে ট্রিট করা হয়েছে (JS ডিফল্টের সাথে মিলিয়ে), তাই আগে-থেকে-"uncommon" মার্ক করা প্রোডাক্ট, backfill-এর পর re-touch না হওয়া পর্যন্ত, ভুলভাবে "common" বাকেটে দেখাবে। **টেস্ট শপে SQLite enable করার আগে একটা fresh backfill রি-রান আবশ্যক** (existing `migrateStoreResumable()`, idempotent — re-run নিরাপদ)।

**App.jsx পরিবর্তন (`Products` কম্পোনেন্ট)**:
- নতুন state/লজিক ব্লক (`browseRows`, `browseTotal`, `browseDone`, `browseLoading`, `browseFailed`, `loadBrowsePage()`) — `filteredAll` useMemo-এর ঠিক পরে, `filteredAll` নিজে অপরিবর্তিত।
- **ডিজাইন সিদ্ধান্ত**: `demand_type`-এর মাত্র ২টা মান বলে multi-column keyset cursor (যা `DataStore.js queryPage()` এখনো সাপোর্ট করে না, শুধু single sortColumn+id) এড়িয়ে গেছে — common বাকেট আগে (`name ASC`), শেষ হলে (`hasMore: false`) uncommon বাকেটে সিমলেসলি ট্রানজিশন করে, দুটো আলাদা `queryPage()` কল দিয়ে। `queryPage()` কোর ফাংশন **স্পর্শ করা হয়নি** (এন্ট্রি ২৭-এর টেস্ট কভারেজ প্রভাবিত হয় না)।
- **আচরণ-পরিবর্তন (ইচ্ছাকৃত, ডকুমেন্ট করা হলো)**: আগে ডিফল্ট-ব্রাউজ অর্ডার ছিল "কমন/আনকমন গ্রুপিং + বাকি স্টেবল-সর্ট (মূল array অর্ডার, যা মূলত arbitrary)"। এখন SQLite-ব্যাকড ব্রাউজ মোডে প্রতিটা বাকেটের ভেতরে **name ASC** (বর্ণানুক্রমিক) — deterministic ও index-এ ধরা সহজ। সার্চ-অ্যাক্টিভ অবস্থায় কোনো পরিবর্তন নেই।
- `showCount` এখন `useSqliteBrowse` অবস্থায় SQLite `COUNT(*)` থেকে আসা `browseTotal` দেখায় (আগের JS `filteredAll.length`-এর বদলে, যেহেতু browseRows পুরো ম্যাচিং সেট না, শুধু লোড-হওয়া পেজগুলো)।
- Virtuoso-র `data` prop `useSqliteBrowse` হলে `browseRows` (serial = offset-ভিত্তিক `i+1`), নাহলে আগের মতোই `filteredAll`। `endReached` হ্যান্ডলার `useSqliteBrowse` অবস্থায় পরের পেজ লোড করে।
- SQLite কল ব্যর্থ হলে (`try/catch`) `browseFailed=true` হয়ে যায়, যা `useSqliteBrowse`-কে `false` করে দেয় — পরের রেন্ডারে স্বয়ংক্রিয়ভাবে `filteredAll` (পুরনো JS পাথ)-এ ফলব্যাক করে।
- `filteredAll`-এর বাইরের ২টা ব্যবহার (batch-edit/export/অন্য কোনো লজিক) — কোড-অডিটে পাওয়া গেছে `filteredAll` শুধু ৩ জায়গায় ব্যবহৃত (showCount, empty-state, Virtuoso `data`), তাই ব্লাস্ট-রেডিয়াস ছোট, অন্য কোনো ফিচার এই পরিবর্তনে প্রভাবিত হয়নি।

**✅ পরবর্তী আপডেট (২০২৬-০৮-১৪, ব্যবহারকারী কনফার্মড) — যাচাই সম্পূর্ণ**:
- CI-এর `node-version: '20'` ছিল বাগ (এন্ট্রি ৩০-এর `datastore-querypage-tests.mjs`-এর `node:sqlite`-ব্যাকড শিমের জন্য কমপক্ষে Node 22 লাগে) — `'22'`-এ বাম্প করার পর `npm test` (logic, schema, integration, sync, querypage — সবগুলো suite) **pass কনফার্মড**।
- Fresh backfill রি-রান করা হয়েছে — products 2235/2235, customers 17/17, invoices 627/627, সব 100% (dev panel ডায়াগনস্টিকস স্ক্রিনশটে কনফার্মড)।
- Real-device-এ Products লিস্ট (আনকমন ফিল্টার) খুলে শেষ পর্যন্ত (২৩৫-২৪৩, endReached) স্ক্রল করে pagination কাজ করা কনফার্মড।
- `ALTER TABLE` গার্ড আসল পুরনো টেস্ট-শপের DB-তে ক্র্যাশ ছাড়া বুট হওয়া কনফার্মড (dev panel-এ "চালু" স্ট্যাটাস দেখা গেছে)।
- **এন্ট্রি ৩০-এর পুরো রোলআউট-চেকলিস্ট (npm test → backfill → real-device browse চেক) এখন সম্পূর্ণ।** বাকি শুধু "সব" ফিল্টার ও common বাকেট নির্দিষ্টভাবে UI-তে ভিজুয়ালি আলাদা চেক করা (আনকমন বাকেট কনফার্মড হয়েছে, common এখনো স্ক্রিনশটে দেখানো হয়নি)।

---

### [এন্ট্রি ২৯] — #১ Invoice history cutover সম্পূর্ণ (queryPage() প্রথম real UI কল-সাইট), #২ (products pagination) ইচ্ছাকৃতভাবে শুরু করা হয়নি — ডিজাইন আগে দরকার

**প্রসঙ্গ**: এন্ট্রি ২৮-এর ব্লকার ফিক্সের পর প্ল্যানের #১+#২ (একসাথে প্রস্তাবিত ছিল) নিয়ে এগোনো হলো। কিন্তু কোড রিভিউ করে দেখা গেল #১ (adapter-swap, কম ঝুঁকি) আর #২ (নতুন ডিজাইন লাগবে, সবচেয়ে ঝুঁকিপূর্ণ, live স্টক-এডিট স্ক্রিন) — এই দুটোকে এক বসায় একসাথে করাই একটা ঝুঁকি ছিল (আগের সেশনের প্ল্যানিং আলোচনাতেও এই একই উদ্বেগ ওঠা হয়েছিল)। তাই #১ সম্পূর্ণ করে, #২ শুরু করার আগে থামা হলো — নিচে কারণ ও প্রস্তাবিত ডিজাইন বিস্তারিত।

**✅ #১ সম্পূর্ণ — `ReturnModule`-এর তিনটা ফাংশন**:
- `loadInvHistPage()` ও `loadVoidHist()` — `isSqliteEnabled()` হলে এখন `InvoiceArchive.queryPage()` (IndexedDB)-এর বদলে `DataStore.queryPage()` (SQLite) কল করে। **গুরুত্বপূর্ণ ডিজাইন-সিদ্ধান্ত**: dual-write-এর কারণে SQLite-এ লাইভ+আর্কাইভড দুটো ইনভয়েসই থাকে (এন্ট্রি ২৮-এর ফিক্সের পর) — তাই আগের মতো লাইভ `invoices` state + `InvoiceArchive` merge করলে ডুপ্লিকেট হয়ে যেত, তাই SQLite path-এ শুধু SQLite-ই একক সোর্স (merge বাদ)। SQLite কল ব্যর্থ হলে (try/catch) পুরনো merge-পাথে সাইলেন্ট ফলব্যাক করে।
- `searchInvoice()` **ইচ্ছাকৃতভাবে অপরিবর্তিত রাখা হয়েছে** — এটা substring/LIKE-স্টাইল সার্চ করে (invoiceNo-তে যেকোনো অংশ ম্যাচ), যা `queryPage()`-এর keyset রেঞ্জ-কোয়েরিতে সরাসরি সম্ভব না (invoices টেবিলে FTS নেই, schema.sql-এ ইচ্ছাকৃতভাবে বাদ দেওয়া হয়েছিল)। এখনো লাইভ state + `InvoiceArchive.findByQuery()` ব্যবহার করে, নিরাপদ ও অপরিবর্তিত।
- `payType` ফিল্টার SQL WHERE-এ যায়নি (schema-তে কোনো `pay_type` কলাম নেই, শুধু `data` JSON ব্লবে) — SQLite path-এও আগের মতোই ফলব্যাক-ফ্রি JS পোস্ট-ফিল্টার (`matchesFilter`) ব্যবহার হচ্ছে, ব্যবহারকারীর দেখা রেজাল্টে কোনো পার্থক্য নেই। `json_extract()`-ভিত্তিক SQL ফিল্টারিং এই সেশনে ইচ্ছাকৃতভাবে এড়ানো হয়েছে (কোডবেসে এখনো কোথাও ব্যবহৃত হয়নি, native SQLite প্লাগইনে JSON1 সাপোর্ট এই সেশনে যাচাই করা যায়নি)।
- Dashboard (লাইন ~২১৮২৮) আর CustomerDetail (লাইন ~২৬১৫৯)-এর নিজস্ব `InvoiceArchive.queryPage()` কল-সাইট **ইচ্ছাকৃতভাবে ছোঁয়া হয়নি** — মূল প্ল্যানে শুধু ReturnModule-এর তিনটা ফাংশনকেই "#১" হিসেবে ধরা হয়েছিল, স্কোপ-ক্রিপ এড়াতে বাকিগুলো আলাদা ভবিষ্যৎ আইটেম।
- `businessType` prop হিসেবে `ReturnModule`-এ পাস হয় না — parent JSX অস্পৃষ্ট রাখতে prop-drilling না করে সরাসরি `useAppStore(s => s.businessType)` হুক দিয়ে নেওয়া হয়েছে।

**⚠️ যাচাই করা যায়নি**: এই সেশনের sandbox-এ নেটওয়ার্ক নেই (`npm install`/esbuild/test সম্ভব না)। এই এডিটটা এন্ট্রি ২৭-এর `datastore-querypage-tests.mjs`-এর একই `DataStore.queryPage()` ফাংশন কল করছে (ইতিমধ্যে ইউনিট-টেস্ট কভারড), কিন্তু App.jsx-এর এই নতুন কল-সাইট দুটো নিজে টেস্ট-কভারড না। **পরবর্তী সেশনে/CI-তে `npm test` + real-device dev-flag চালু করে ম্যানুয়াল স্মোক-টেস্ট (ইনভয়েস হিস্ট্রি খুলে পুরনো + নতুন ইনভয়েস দুটোই দেখা যাচ্ছে কিনা, ভয়েড হিস্ট্রি) আবশ্যক Enable করার আগে।**

**🔴 #২ (Products main list pagination) ইচ্ছাকৃতভাবে শুরু করা হয়নি** — কারণ:
1. **এখনো ডিজাইনই নেই** (মাস্টার স্ট্যাটাসের ৫ নং আইটেম) — এটা "queryPage() ওয়্যাপ করা" (যেমন #১) না, এটা একটা নতুন ফিচার-ডিজাইন দাবি করে: demand-type সর্ট (common/uncommon আগে) + সার্চ-টাইম hybrid FTS+JS scoring + সিরিয়াল-নম্বর — তিনটাই বর্তমানে পুরো `products` array-এর উপর নির্ভরশীল, আর SQLite `queryPage()` single-column keyset সর্ট করে, মাল্টি-ক্রাইটেরিয়া ডাইনামিক সর্ট (search-score-সহ) না।
2. **সবচেয়ে ঝুঁকিপূর্ণ স্ক্রিন** — এই স্ক্রিনেই স্টক এডিট/ব্যাচ ম্যানেজমেন্টের মতো ক্রিটিকাল অ্যাকশন হয়; বাগ হলে সরাসরি লাইভ দোকানের ইনভেন্টরি অপারেশন ব্যাহত হবে।
3. **নেটওয়ার্ক/টেস্ট-বিহীন sandbox-এ এত বড়, নতুন-ডিজাইনের পরিবর্তন যাচাই ছাড়া লেখা** — নিজে থেকেই একটা ঝুঁকি যোগ করত, যেটা এই মাইগ্রেশনের নিজস্ব "চিরস্থায়ী নিয়ম #৪" (প্রতিটা ধাপের পর টেস্ট) এর বিপরীত।

**প্রস্তাবিত ডিজাইন (পরের সেশনে কনফার্ম করে শুরু করা উচিত)**:
- **ডিফল্ট ব্রাউজ (সার্চ নেই)**: `demand_type` কলাম + ইনডেক্স schema-তে যোগ, SQLite `queryPage()` দিয়ে `ORDER BY demand_type ASC, <sortColumn> ASC` (row-value tuple keyset, এন্ট্রি ২৫-এর প্যাটার্নে) — খাঁটি pagination।
- **সার্চ-অ্যাক্টিভ অবস্থা**: বর্তমান hybrid প্যাটার্নই থাকবে (FTS candidate-narrowing + JS `productMatchScore()` র‍্যাঙ্কিং, ইতিমধ্যে ৪ কল-সাইটে প্রমাণিত) — কোনো নতুন ডিজাইন লাগবে না, শুধু narrowed candidate সেটে pagination যোগ হবে।
- **সিরিয়াল নম্বর**: `p.serial` (array-পজিশন থেকে) পেজ-ভিত্তিক হয়ে যাবে (`offset + i`) — ভিজ্যুয়াল ব্যাজ মাত্র, ইনভয়েসে carry হলেও critical কোনো লজিকে ব্যবহৃত হয় না (আগেই যাচাই করা হয়েছিল), তাই এই পরিবর্তন নিরাপদ।

---

### [এন্ট্রি ২৮] — 🔴 dual-write archiving বাগ ফিক্স (১+২ শুরুর আগে ব্লকার ছিল) + RFM lifetime-value স্কোপ ডিসিশন

**প্রসঙ্গ**: প্ল্যানের #১+২ (invoice history cutover + products pagination) নিয়ে আলোচনা করতে গিয়ে, এবং কাস্টমার লিস্টের RFM (LTV/segment) SQLite-এ আনার সম্ভাবনা যাচাই করতে গিয়ে কোড রিভিউ করার সময় দুইটা জিনিস ধরা পড়েছে — দ্বিতীয়টা এতটাই গুরুত্বপূর্ণ যে #১ শুরু করার আগে ফিক্স করা বাধ্যতামূলক হয়ে গেছে।

**১) RFM-এর `ltv` আসলে "৬-মাসের সেল", সত্যিকারের lifetime value না** — `rfmData` যে `invoices` array থেকে হিসাব করে সেটা এন্ট্রি ২৪-এর windowed live state (৬ মাসের বেশি পুরনো ইনভয়েস আর্কাইভে সরে যায়, live-এ থাকে না)। **সিদ্ধান্ত**: নতুন SQLite ভার্সনে `ltv` সত্যিকারের lifetime value হবে (সব ইনভয়েস, আর্কাইভ সহ)। এটা এখনো কোডে প্রয়োগ হয়নি — RFM materialization নিজেই একটা আলাদা, বড় future scope (নিচে ১১ নম্বরে যোগ হলো), শুধু ভবিষ্যতের স্কোপের জন্য সিদ্ধান্তটা এখানে রেকর্ড রাখা হলো।

**২) 🔴 বড় আবিষ্কার — Archiving আসলে SQLite থেকেও ডিলিট করে দিচ্ছিল (ফিক্স হয়ে গেছে)**: `dualWriteSqlite()` জেনেরিক `diffById()` মেকানিজম ব্যবহার করে — `invoices` array থেকে কোনো id "হারিয়ে গেলে" সেটাকে ডিলিট ধরে নেয় আর SQLite-এ `DELETE FROM invoices` চালায়। কিন্তু `archiveOldInvoices()` ঠিক এই কাজটাই করত — ৬ মাসের পুরনো ইনভয়েস `setInvoices(prev => prev.filter(...))` দিয়ে লাইভ array থেকে সরাত (IndexedDB আর্কাইভে পাঠানোর পর), যা জেনেরিক diff-মেকানিজমের চোখে হার্ড-ডিলিটের মতোই দেখাত। ফলাফল: SQLite-এর `invoices` টেবিলও আসলে শুধু ৬ মাসের ডেটা রাখছিল — ৬ মাস পার হলেই SQLite থেকেও মুছে যাচ্ছিল। ধরা না পড়লে RFM "true lifetime value" (উপরের ১ নং) কখনো কাজ করত না, আর #১ (invoice history cutover)-ও `DataStore.queryPage()` দিয়ে পুরনো ইনভয়েস খুঁজলে পেত না।

**ফিক্স**: `archiveOldInvoices()`-এ `setInvoices(prev => prev.filter(...))` কল করার ঠিক আগে, dual-write-এর "প্রেভিয়াস স্ন্যাপশট" ref (`_dsInvoicesRef`) থেকে ওই archived id-গুলো সরিয়ে দেওয়া হয়েছে (`_dsInvoicesRef.current.delete(id)`) — যাতে পরের diff-এ সেগুলো "removed" হিসেবে না ধরা পড়ে। এতে SQLite-এ ডেটা থেকেই যায় (archiving শুধু লাইভ React state/UI থেকে সরায়, SQLite থেকে না — যেটাই আসলে দরকার ছিল)।

**যাচাই**: এই সেশনের sandbox-এ নেটওয়ার্ক অ্যাক্সেস ছিল না বলে `npm test`/esbuild চালানো যায়নি এখানে (আগের সেশনে esbuild দিয়ে সিনট্যাক্স ভেরিফাই হয়েছিল, ভুল ধরা পড়েনি — একই প্যাটার্নের এডিট)। **পরবর্তী সেশনে/লোকাল মেশিনে/CI-তে `npm test` চালিয়ে কনফার্ম করা আবশ্যক**, বিশেষ করে `sync-tests.mjs` আর `datastore-querypage-tests.mjs`।

**ঝুঁকি**: ফিক্সটা নিজে ছোট ও সার্জিক্যাল (`archiveOldInvoices()`-এর ৭ লাইন, `DataStore.js`/schema অস্পৃষ্ট) কিন্তু **প্রোডাকশনে ইতিমধ্যে চলমান** dual-write বাগ ফিক্স করছে — অর্থাৎ এই মুহূর্ত পর্যন্ত deployed যেকোনো শপে SQLite-এর `invoices` টেবিল সম্ভবত ইতিমধ্যেই ৬-মাসের বেশি পুরনো ডেটা হারিয়ে ফেলেছে (dual-write শুধু shadow-write, IndexedDB blob এখনো সোর্স-অফ-ট্রুথ, তাই কোনো ইউজার-ফেসিং ডেটা-লস হয়নি, কিন্তু future RFM/read-path কাটওভারের ভিত্তি নষ্ট থাকত)।

**যা এখনো বাকি**: #১+#২ (invoice history cutover + products pagination) — এই ফিক্সের পরই শুরু করা নিরাপদ। RFM materialization এখনো ডিজাইনই হয়নি (নতুন কলাম + write-path denormalization লাগবে, স্কোপ বড়)।

---

### [এন্ট্রি ২৭] — `queryPage()` ইউনিট টেস্ট যোগ হলো (৭-৯ ধারার #৬, আসন্ন read-path cutover-এর সেফটি নেট)

**প্রসঙ্গ**: ৭টা বাকি সাব-টাস্ক (queryPage() wiring + async pagination, shadow-compare, date_key ইনডেক্স, FTS threshold রিভিজিট, ইত্যাদি)-এর ক্রম ঠিক করার সময় সিদ্ধান্ত হয়েছিল — সবচেয়ে ছোট/নিরাপদ, কোনো ডিপেন্ডেন্সি ছাড়া কাজ (queryPage() ইউনিট টেস্ট) দিয়ে শুরু করা, কারণ এটাই পরের বড় কাজের (read-path cutover, App.jsx-এর ~৪০ হাজার লাইনে wiring) সেফটি নেট হবে।

**সমস্যা**: `DataStore.js` `@capacitor-community/sqlite` (native bridge) + Vite-এর `?raw` ইম্পোর্ট (schema.sql) ব্যবহার করে — কোনোটাই plain `node`-এ চলে না, তাই `queryPage()` আগে কোনোভাবেই ইউনিট-টেস্ট করা যাচ্ছিল না (শুধু bench script দিয়ে raw SQL টেস্ট হতো, `DataStore.js`-এর আসল ফাংশন না)।

**সমাধান**: `tests/helpers/` এ দুইটা নতুন হেল্পার —
1. `capacitor-sqlite-shim.mjs` — `@capacitor-community/sqlite`-এর মিনিমাল fake, Node-এর বিল্ট-ইন `node:sqlite` (bench script যেটা ব্যবহার করে, সেটাই) দিয়ে ব্যাকড। `query`/`execute`/`run`/`executeSet`/connection lifecycle — যতটুকু `DataStore.js` আসলে ব্যবহার করে ততটুকুই কভার করে।
2. `vite-node-loader.mjs` — Node ESM loader hook (`resolve`/`load`), `@capacitor-community/sqlite` ইম্পোর্ট শিমে রিডাইরেক্ট করে আর `"*.sql?raw"` ইম্পোর্ট রিজলভ করে raw text হিসেবে।

এই দুইটার সুবাদে `tests/datastore-querypage-tests.mjs` **`DataStore.js`-এর আসল, অপরিবর্তিত কোড** সরাসরি import করে টেস্ট করে — কোনো লজিক কপি-পেস্ট বা রিইমপ্লিমেন্ট করতে হয়নি।

**১০টা কেস কভার করে**: বেসিক পেজিনেশন (limit/hasMore/nextCursor), শেষ পেজ ডিটেকশন, খালি store, পুরো তালিকা multi-page traversal-এ কোনো row miss/duplicate না হওয়া, **ডুপ্লিকেট sortColumn ভ্যালুতে id-tie-break** (এন্ট্রি ২৫-এর SEEK বাগের ঠিক যে এরিয়া, সবচেয়ে গুরুত্বপূর্ণ কেস), sortDir=ASC, custom where/params (soft-delete ফিল্টার), invoices-এর ডিফল্ট sort column (created_at, updated_at না — এটাও আগে একটা লুকানো বাগ ছিল যেটা কখনো কল-সাইট না থাকায় ধরা পড়েনি), custom sortColumn=id, আর JSON round-trip ডেটা ইন্টিগ্রিটি।

**যাচাই**: মিউটেশন-টেস্ট দিয়ে কনফার্ম করা হয়েছে যে টেস্টগুলো আসলে কার্যকর — tie-break শর্ত ইচ্ছাকৃতভাবে ভেঙে (row-value tuple-এর বদলে single-column comparison) দেখা গেছে ঠিক সেই কেসটাই ফেল করে (10 unique রেকর্ডের জায়গায় 3টা দেখাচ্ছিল — মানে ৭টা রো স্কিপ হয়ে যাচ্ছিল), বাকি ৯টা কেস পাস থাকে। তারপর কোড রিস্টোর করে কনফার্ম করা হয়েছে ফাইল অপরিবর্তিত।

`package.json`-এর `test` স্ক্রিপ্টে যোগ করা হয়েছে (এখন `npm test` এ ৫টা সুইট চলে)।

**⚠️ sandbox-নোট**: এই sandbox-এ `node_modules` ইনস্টল করা নেই বলে `schema-tests.mjs` (zod ডিপেন্ডেন্সি) রান করা যায়নি এখানে — কিন্তু এটা প্রি-এক্সিস্টিং sandbox-সীমাবদ্ধতা, নতুন টেস্টের কারণে না। GitHub Actions (`npm ci` চলে সেখানে) এ সমস্যা হবে না। `logic-tests.mjs` (৭২), `sync-tests.mjs` (২৪), আর নতুন `datastore-querypage-tests.mjs` (১০) — সবগুলো এই sandbox-এ পাস।

**পরবর্তী স্টেপ**: প্ল্যানের #১+২ (queryPage() App.jsx-এ wire করা + Virtuoso async pagination) — বড়, ঝুঁকিপূর্ণ কাজ, আলাদা মনোযোগী সেশনে করতে হবে, এই টেস্ট সুইট এখন তার সেফটি নেট হিসেবে প্রস্তুত।

---

### [এন্ট্রি ২৬] — ১ কোটি স্কেল বেঞ্চমার্ক অবশেষে সম্পূর্ণ কনফার্মড (real numbers, chunked run)

**যেভাবে করা হলো**: sandbox-এর single-command সময়সীমা (~৫ মিনিট) এড়াতে ইনভয়েস-ইনসার্ট ১০টা চাঙ্কে (প্রতিটা ৮ লাখ-১৫ লাখ রো) ভাগ করে একই persistent `.db` ফাইলে ধারাবাহিকভাবে ইনসার্ট করা হলো, প্রতি চাঙ্ক আলাদা প্রসেস রান হিসেবে। এটা শুধু এই এক-বারের কনফার্মেশনের জন্য একটা টেম্পোরারি ড্রাইভার স্ক্রিপ্ট (প্রজেক্টে ডেলিভার হয়নি) — `generate-synthetic-dataset.mjs`-এর একই schema/insert/query লজিক ব্যবহার করে।

**চূড়ান্ত ফলাফল (১,০০,০০০ প্রোডাক্ট · ১০,০০০ কাস্টমার · ১,০০,০০,০০০ ইনভয়েস)**:
- **মোট ইনভয়েস-ইনসার্ট সময়: ৮৬৪.২ সেকেন্ড (~১৪ মিনিট ২৪ সেকেন্ড)** — এন্ট্রি ২৫-এর "১২-২০ মিনিট" রুক্ষ প্রক্ষেপণের মধ্যেই পড়েছে, কিন্তু পুরনো "~৭ মিনিট" অনুমানের প্রায় দ্বিগুণ। প্রতি-রো খরচ ৪৪.৫µs (প্রথম চাঙ্ক) থেকে বেড়ে ~৯৯-১০৩µs-এ স্থির হয়েছে (৫৮ লাখ রো-র পর থেকে আর বাড়েনি — প্লাটো ধরা পড়েছে, যা আশ্বস্তকর: খরচ অসীম বাড়তে থাকবে না)।
- **DB ফাইল সাইজ (checkpoint-পরবর্তী): ৩৫৪২.১ MB (~৩.৫ GB)** — এন্ট্রি ২৫-এর ~৩.৬ GB প্রক্ষেপণের প্রায় হুবহু কাছাকাছি, কনফার্মড।
- **Keyset পেজিনেশন (এন্ট্রি ২৫-এর ফিক্সড ভার্সন)**: গভীর পেজে (offset ৫০ লাখ) OFFSET লাগে ৪২৬.৪ms, keyset লাগে ০.৫ms — **~৯১৩× দ্রুত**। গভীরতা বাড়ার সাথে স্পিডআপ বাড়তেই থাকছে (৪২×@১০লাখ → ১৫০×@৩০লাখ → ৯১৩×@১কোটি), যা keyset-এর O(log n) বনাম OFFSET-এর O(n) আচরণের সাথে সামঞ্জস্যপূর্ণ।
- অন্যান্য কোয়েরি: কাস্টমার মোবাইল লুকআপ ০.৩ms, Dashboard SUM ০.৬ms — দুটোই দ্রুতই থেকেছে।

**🟡 নতুন পর্যবেক্ষণ (ব্লকার না, কিন্তু নোট করার মতো)**: "আজকের ইনভয়েস লিস্ট" কোয়েরি (`WHERE date_key = ? ORDER BY created_at DESC LIMIT 50`) ৩০ লাখ স্কেলে ~৬ms ছিল, ১ কোটিতে ১২১.৩ms হয়ে গেছে — সম্ভবত কারণ `idx_invoices_date_key` single-column ইনডেক্স, `created_at`-এর সাথে কম্পোজিট না, তাই ম্যাচড রো (~৫৪৭৯টা, যেহেতু ৫ বছরে ছড়ানো ডেটা) সর্ট করতে একটা temp b-tree লাগছে। প্রোডাকশনে এই স্কেলে (কোনো দোকানে সত্যিই ১ কোটি ইনভয়েস জমলে) এটা "আজকের বিক্রি" স্ক্রিনে সামান্য টের পাওয়ার মতো ধীরতা হতে পারে (~১২০ms এখনো UX-এ imperceptible-এর কাছাকাছি, কিন্তু ভবিষ্যতে `(date_key, created_at)` কম্পোজিট ইনডেক্স যোগ করলে এটা আবার সাব-মিলিসেকেন্ডে নেমে আসবে বলে ধারণা)। এই সেশনে ফিক্স করা হয়নি — নতুন ইনডেক্স যোগ করলে ইনসার্ট স্পিড ও অন্য কোয়েরির উপর প্রভাব যাচাই করা দরকার, তাই আলাদা সেশনে সিদ্ধান্ত নেওয়াই ভালো।

**যা এখনো বাকি**:
- [ ] এই সাব-কম্পোনেন্ট ধীরতা (`date_key` লিস্ট কোয়েরি ১২১ms@১কোটি) — কম্পোজিট ইনডেক্স `(date_key, created_at)` যোগ করা বিবেচনা করা
- [ ] Real Android ডিভাইসে (বাজেট ফোন) আসল timing — এই সংখ্যাগুলো সার্ভার/ডেস্কটপ CPU-তে, ফোনে ধীর হবে
- [ ] `queryPage()`-এর জন্য ইউনিট টেস্ট (এন্ট্রি ২৫ থেকে এখনো বাকি)
- [ ] ৩.৫ GB DB সাইজের বিপরীতে দোকানগুলোর স্টোরেজ হেডরুম যাচাই

---

### [এন্ট্রি ২৫] — DB ফাইল-সাইজ রি-রান, এবং সেই রি-রানের সময় ধরা পড়া keyset SEEK বাগ ফিক্স

**শুরুর কাজ (এন্ট্রি ২৪-এর "পরের সেশনের প্রথম কাজ")**: `generate-synthetic-dataset.mjs`-এর DB ফাইল-সাইজ মাপার বাগ (মাপা হতো `db.close()`/checkpoint-এর আগে, WAL মোডে uncheckpointed ডেটা `.db-wal`-এ থাকত) ফিক্স করা হলো — এখন `PRAGMA wal_checkpoint(TRUNCATE)` কল করে তারপর `statSync()` দিয়ে মাপা হয়। ছোট স্কেলে (৫০ হাজার ইনভয়েস) স্মোক-টেস্ট করে কনফার্ম করা হলো checkpoint-পরবর্তী ও close()-পরবর্তী সাইজ মিলছে (দুটোই ১৬.৮ MB)।

**অপ্রত্যাশিত আবিষ্কার — keyset pagination আসলে seek করছিল না**: ১০ লাখ স্কেলে রি-রান করার সময় দেখা গেল "keyset পেজিনেশন" আসলে OFFSET-এর চেয়ে **ধীর** (২৪-৪০ms বনাম ১৩-১৯ms) — এন্ট্রি ২৪-এর "~৩× দ্রুত" দাবির সরাসরি বিপরীত। `EXPLAIN QUERY PLAN` দিয়ে কারণ বের করা হলো: cursor কন্ডিশন `(created_at < ? OR (created_at = ? AND id < ?))` — এই OR-প্যাটার্নে SQLite `idx_invoices_created_id` ইনডেক্স ব্যবহার করলেও তা **"SCAN"** (পুরো ইনডেক্স ট্রাভার্স করে প্রতি রো-তে শর্ত চেক), **"SEARCH"** (সরাসরি সিক) না — ঠিক OFFSET-এর মতোই স্লো, বরং OR-এভ্যালুয়েশনের এক্সট্রা খরচসহ।

**ফিক্স**: row-value tuple comparison — `(created_at, id) < (?, ?)` (SQLite ৩.১৫+ সমর্থিত সিনট্যাক্স)। `EXPLAIN QUERY PLAN` এখন `"SEARCH invoices USING INDEX idx_invoices_created_id ((created_at,id)<(?,?))"` দেখায় — প্রকৃত সিক। প্রয়োগ করা হয়েছে দুই জায়গায়:
- `src/db/DataStore.js`-এর `queryPage()` (আসল প্রোডাকশন কোড, লাইন ~৪২৫) — এটাই আসল বাগ, যেহেতু এই ফাংশন কোনো টেস্ট স্যুটে কভার হয় না এখনো।
- `scripts/generate-synthetic-dataset.mjs`-এর বেঞ্চমার্ক কোয়েরি — যাতে ভবিষ্যতে বেঞ্চমার্ক সঠিক নাম্বার দেয়।

**ফিক্সের পর যাচাই (real numbers, sandbox-এ)**:
| স্কেল | OFFSET | Keyset (fixed) | স্পিডআপ |
|---|---|---|---|
| ১০ লাখ ইনভয়েস, offset ৫ লাখ | ১২.৬ms | ০.৩ms | ~৪২× |
| ৩০ লাখ ইনভয়েস, offset ১৫ লাখ | ৪০.০ms | ০.৩ms | ~১৫০× |

গভীরতার সাথে স্পিডআপ বাড়ছে (যেমনটা আসলে theoretically হওয়ার কথা O(log n) বনাম O(n) — এন্ট্রি ২৪-এর মূল "~১৫০× পর্যন্ত" দাবিটা (docstring-এ) বরং এখন মেলে, "~৩×" রিগ্রেশন-টেস্ট নাম্বারটাই ভুল ছিল।

**১ কোটি স্কেল বেঞ্চমার্ক — এই সেশনেও সম্পূর্ণ চালানো যায়নি**: sandbox-এ single কমান্ডের সময়সীমা (~৫ মিনিট) ছাড়িয়ে যায়, শুধু ইনভয়েস-ইনসার্ট ধাপই। তিনটা ডেটা পয়েন্ট নেওয়া হলো (প্রোডাক্ট/কাস্টমার সবসময় ফুল টার্গেট স্কেলে — ১ লাখ/১০ হাজার):

| ইনভয়েস | ইনসার্ট সময় | প্রতি-রো | DB সাইজ (checkpoint-পরবর্তী) |
|---|---|---|---|
| ৫০ হাজার | ৭৯২ms | ~১৫.৮µs | ১৬.৮ MB |
| ১০ লাখ | ৩৫,২৮২ms | ~৩৫.৩µs | ৩৮৭.৪ MB |
| ৩০ লাখ | ১৮০,৮৬২ms | ~৬০.৩µs | ১০৯০.০ MB |

⚠️ **সততার সাথে নোট**: প্রতি-রো ইনসার্ট খরচ স্থির না — বাড়ছে (ইনডেক্স B-tree বড় হওয়ার স্বাভাবিক প্রভাব)। তাই ১০ লাখ থেকে সরল রৈখিক এক্সট্রাপোলেশন (~৭ মিনিট) সম্ভবত কম-প্রক্ষেপণ। রুক্ষ অনুমান ১২-২০ মিনিট রেঞ্জ, কিন্তু **নিশ্চিতভাবে জানতে রিয়েল মেশিনে সময়সীমা ছাড়া রান করা দরকার** — কমান্ড: `node scripts/generate-synthetic-dataset.mjs --products=100000 --customers=10000 --invoices=10000000`।

DB ফাইল-সাইজ স্কেলিং প্রায় রৈখিক (~৩৬৩ MB/মিলিয়ন ইনভয়েস) — এক্সট্রাপোলেটেড ১ কোটিতে **~৩.৬ GB**। এটা নতুন তথ্য, আগের কোনো এন্ট্রিতে ছিল না, এবং বাজেট Android ফোনে (৫০০ দোকান) storage-এর জন্য গুরুত্বপূর্ণ বিবেচ্য বিষয়।

**যাচাই এই সেশনে**: `npm install` (৪৮৭ প্যাকেজ) → `npm test` (logic ৭২ + schema ১৪ + integration ১০ + sync ২৪ = ১২০, সব পাস) → `npm run test:fuzz` (৭ প্রপার্টি, প্রতিটা ১০০০ রান, সব পাস) → `npm run test:golden-master` (৭ কেস পাস) → `npm run lint` (০ error, ৫৫০ প্রি-এক্সিস্টিং warning) → `npm run build` (সফল)। `queryPage()` নিজে কোনো টেস্ট স্যুটে সরাসরি কভার হয় না — এটা একটা গ্যাপ, ভবিষ্যতে ইউনিট টেস্ট যোগ করা ভালো হবে।

**যা এখনো বাকি**:
- [ ] ১ কোটি স্কেল ইনসার্ট + DB-সাইজ বেঞ্চমার্ক রিয়েল মেশিনে (সময়সীমা ছাড়া) সম্পূর্ণ কনফার্ম করা
- [ ] `queryPage()`-এর জন্য ইউনিট টেস্ট যোগ করা (keyset seek সঠিকতা + row-value সিনট্যাক্স কম্প্যাটিবিলিটি রিগ্রেশন গার্ড হিসেবে)
- [ ] Real-device টেস্ট (boot backfill windowing + keyset pagination উভয়ই) — এখনো sandbox-এর বাইরে টেস্ট হয়নি
- [ ] ৩.৬ GB প্রক্ষেপিত DB সাইজের বিপরীতে টার্গেট দোকানগুলোর স্টোরেজ হেডরুম যাচাই করা
- [ ] `@capacitor-community/sqlite`-এর underlying SQLite ভার্সন row-value tuple comparison (৩.১৫+) সমর্থন করে কিনা real-device-এ কনফার্ম করা (আধুনিক SQLite বান্ডলে সমস্যা হওয়ার কথা না, কিন্তু যাচাই হয়নি)

---

### [এন্ট্রি ২৪] — ব্লকার #১ (boot backfill) ও #২ (queryPage keyset) ফিক্স + ১ কোটি স্কেল বেঞ্চমার্ক (আংশিক — ফাইল-সাইজ রি-রান বাকি)

**১) Boot-time full invoice backfill সরানো (App.jsx, ~লাইন ১১৩৪৪-১১৪০৪)**:
- আগে: প্রথমে ৯০ দিনের windowed state (দ্রুত প্রথম রেন্ডার), তারপর `setTimeout(0)`-এ পুরো `allInvoicesForBoot` দিয়ে `_patch({ invoices: ... })` — এই দ্বিতীয় ধাপটাই ব্লকার ছিল, কারণ চূড়ান্ত অবস্থা ছিল "সব ইনভয়েস মেমোরিতে"।
- এখন: সেই `setTimeout` ব্লকটা সম্পূর্ণ সরিয়ে ফেলা হলো। Window ৯০ দিন থেকে **৬ মাসে** বদলানো হয়েছে — কারণ এই ফাইলেই আগে থেকে থাকা `archiveOldInvoices()` effect (লাইন ~১২০০৫) ৬ মাসের বেশি পুরনো ইনভয়েস স্বয়ংক্রিয়ভাবে state থেকে সরিয়ে `InvoiceArchive` (IndexedDB)-এ রাখে। দুটো কাটঅফ এখন identical, তাই বুটের ঠিক পরের state আর "স্টেডি-স্টেট" (archiveOldInvoices চলার পরের) state — এই দুটো এক এবং অভিন্ন, কোনো মধ্যবর্তী গ্যাপ নেই।
- ৬ মাসের বেশি পুরনো ইনভয়েসের জন্য on-demand লুকআপ **নতুন করে বানাতে হয়নি** — `InvoiceArchive.getById()`/`.findByQuery()`/`.queryPage()` আগে থেকেই বিদ্যমান ছিল (ReturnModule.searchInvoice, কাস্টমার হিস্ট্রি, void history কল-সাইটে ব্যবহৃত), কারণ ৬ মাসের বেশি পুরনো ডেটা এমনিতেও কিছুক্ষণ পরই state থেকে সরে যেত (archiveOldInvoices চলার পর) — শুধু বুটের ঠিক-পরের মুহূর্তে (আগে সাময়িকভাবে "সব মেমোরিতে" যেত, এখন যায় না) একই নিয়ম মেনে চলছে।
- ⚠️ **সততার সাথে নোট**: এই সেশনে App.jsx-এর প্রতিটা কল-সাইট যাচাই করা হয়নি যে "live invoices state"-নির্ভর প্রতিটা স্ক্রিন InvoiceArchive fallback ঠিকমতো ব্যবহার করছে কিনা। Real-device টেস্টে বিশেষভাবে "৬ মাসের বেশি পুরনো ইনভয়েস খোঁজা/দেখা" প্রতিটা স্ক্রিনে (ইনভয়েস হিস্ট্রি, কাস্টমার ডিটেইল, রিটার্ন, ভয়েড হিস্ট্রি) যাচাই করা উচিত।

**২) `queryPage()` — OFFSET থেকে keyset pagination (DataStore.js)**:
- নতুন সিগনেচার: `queryPage(businessType, store, { where, params, sortColumn, sortDir, limit, cursor })` — `cursor` হলো আগের পেজের শেষ রো-র `{ sortValue, id }`, প্রথম পেজে `null`। রিটার্ন করে `{ rows, nextCursor, hasMore }`।
- `id`-কে সব জায়গায় tiebreaker হিসেবে যোগ করা হয়েছে (`ORDER BY sortColumn DESC, id DESC`, WHERE-এ `(sortColumn < ? OR (sortColumn = ? AND id < ?))`) — sortColumn-এ ডুপ্লিকেট ভ্যালু (একই মিলিসেকেন্ডে একাধিক রেকর্ড) থাকলেও কোনো রো স্কিপ/রিপিট হয় না।
- 🔴 **বাগ ধরা পড়ল ও ফিক্স হলো (রিরাইট করার সময়ই)**: আগের ডিফল্ট `orderBy = "updated_at DESC"` invoices টেবিলে ভুল ছিল — সেই টেবিলে `updated_at` কলামই নেই (শুধু `created_at`)। কখনো লাইভ কল-সাইট না থাকায় এই বাগ আগে ধরাই পড়েনি। এখন `DEFAULT_SORT_COLUMN` ম্যাপ দিয়ে store-ভিত্তিক সঠিক ডিফল্ট (products/customers → `updated_at`, invoices → `created_at`)।
- `schema.sql`-এ ৩টা নতুন কম্পোজিট ইনডেক্স যোগ হলো: `idx_products_updated_id`, `idx_customers_updated_id`, `idx_invoices_created_id` — যাতে keyset-এর `(sortColumn, id)` কম্পোজিট প্রেডিকেট একটাই covering-index seek-এ সমাধান হয়।
- **সঠিকতা যাচাই (sandbox, standalone script, zip-এ নেই — শুধু এই সেশনে চালানো)**: ৫০০০ রো, ইচ্ছাকৃত ডুপ্লিকেট sort-value (প্রতি ৭ রো-তে একটা গ্রুপ) দিয়ে পুরো পেজিনেশন লুপ চালিয়ে দেখা হয়েছে — ১০১টা পেজে ঠিক ৫০০০টা ইউনিক রো, কোনো skip/duplicate/misorder নেই।
- ⚠️ **এখনো wire করা হয়নি**: App.jsx-এর কোনো real UI কল-সাইট (Virtuoso endReached ইত্যাদি) এখনো নতুন `queryPage()` কল করে না — এটা এখনো শুধু DataStore.js-এর ভেতরের প্রস্তুত ফাংশন, "🟡 #৪ Read-path cutover"/"#৫ Virtuoso pagination" কাজের সময় wire হবে।

**৩) ১ কোটি স্কেল ফুল বেঞ্চমার্ক**:
- `scripts/generate-synthetic-dataset.mjs`-এ নতুন সেকশন যোগ হলো — OFFSET (offset=৫০ লাখ, deep page) বনাম keyset পেজিনেশনের সরাসরি তুলনা।
- 🔴 **বাগ পুনরায় ধরা পড়ল**: DB ফাইল-সাইজ মাপার ফাংশন (`readFileSyncSize`) এন্ট্রি ৪-এ আগে একবার `statSync()`-এ ফিক্স হয়েছিল বলে লগে লেখা ছিল, কিন্তু **এই সেশনে আপলোড করা zip-এ পুরনো `readFileSync(p).length` ভার্সনই ছিল** (সম্ভবত সেই ফিক্স কোনো কারণে zip-এ অন্তর্ভুক্ত হয়নি বা কোনো পুরনো zip থেকে re-pack হয়েছিল)। ১ কোটি স্কেলের প্রথম রানে এই বাগের কারণে "DB ফাইল সাইজ: 0.0 MB" রিপোর্ট হয়েছে। এই সেশনেই আবার `statSync()`-এ ফিক্স করা হলো, সাথে কমেন্টে ব্যাখ্যা যোগ করা হলো যাতে ভবিষ্যতে এই রিগ্রেশন দ্রুত ধরা পড়ে।
- **প্রথম রানের ফলাফল (bug-fix-এর আগে, ১ লাখ প্রোডাক্ট / ১০ হাজার কাস্টমার / ১ কোটি ইনভয়েস)**:

| অপারেশন | সময় |
|---|---|
| প্রোডাক্ট ইনসার্ট (১ লাখ) | ~১০৫৪ms |
| কাস্টমার ইনসার্ট (১০ হাজার) | ~৭১ms |
| **ইনভয়েস ইনসার্ট (১ কোটি)** | **~৯৭৩,৯২৬ms (~১৬ মিনিট ১৪ সেকেন্ড)** — এন্ট্রি ৪/৫-এর ~১৫-২২ মিনিট রেঞ্জের সাথে সামঞ্জস্যপূর্ণ |
| DB ফাইল সাইজ | ❌ 0.0 MB (bug — উপরে দেখুন, এখন ফিক্সড) |
| প্রোডাক্ট নাম সার্চ (LIKE) | ৪.৭ms |
| প্রোডাক্ট নাম সার্চ (FTS5) | ১.৬ms |
| কাস্টমার লুকআপ (মোবাইল) | ০.৮ms |
| আজকের ইনভয়েস লিস্ট (৫০ পেজ) | ৩১৪.৭ms |
| Dashboard SUM(total) aggregate | ০.৯ms |
| নির্দিষ্ট কাস্টমারের হিস্ট্রি | ২.১ms |
| **OFFSET পেজিনেশন** (offset=৫০ লাখ, LIMIT ৫০) | ৮৬৯.২ms |
| **Keyset পেজিনেশন** (একই গভীরতা, LIMIT ৫০) | ২৯১.৯ms |
| **⚡ keyset speedup** | **~৩.০× দ্রুত** |

- **ফাইল-সাইজ বাগ ফিক্সের পর দ্বিতীয় রান শুরু করা হয়েছিল কিন্তু সম্পূর্ণ হয়নি** — ইউজার সেশন থামিয়েছেন (~৩ মিনিট ৪১ সেকেন্ড ইনভয়েস-ইনসার্টের মাঝপথে, আনুমানিক ~২০-২৫% সম্পূর্ণ)। বাকি সব নাম্বার (ইনসার্ট/কোয়েরি/পেজিনেশন টাইমিং) বদলানোর কথা না (কোনো লজিক বদলায়নি, শুধু সাইজ-রিপোর্টিং ফাংশন), তাই উপরের টেবিলের সব নাম্বারই ভরসাযোগ্য — শুধু DB ফাইল সাইজটাই এখনো অজানা।

**⚠️ নতুন উদ্বেগের বিষয় (পরের সেশনে)**: "আজকের ইনভয়েস লিস্ট" কোয়েরি (৩১৪.৭ms) এন্ট্রি ৫-এর dashboard-aggregate ফিক্সের (৮৯৮২ms → ১.৪ms) তুলনায় এখনো অনেক ধীর — সন্দেহ, `date_key` ইনডেক্স আজকের ~৫৫০০ রো (১ কোটি ÷ ১৮২৫ দিন) নিয়ে আসছে তারপর `ORDER BY created_at DESC LIMIT 50` করছে (in-memory sort, কারণ `idx_invoices_date_key` শুধু `date_key`-এর উপর, `created_at` না)। একটা কম্পোজিট `(date_key, created_at)` ইনডেক্স যোগ করলে এটা ঠিক হতে পারে — পরের সেশনে যাচাই করা উচিত।

**যাচাই**: `npx eslint 'src/**/*.{js,jsx}'` → 0 errors, 550 warnings (আগের এন্ট্রির সমান)। `npm test` (120), `test:fuzz` (৯), `test:golden-master` (৭) সব ✅। `npm run build` সফল (✓ built in ~১৫.৫s, কোনো নতুন এরর — শুধু আগে থেকে থাকা chunk-size ওয়ার্নিং, নতুন কিছু ভাঙেনি)।

**যা এখনো বাকি**:
- [ ] ফাইল-সাইজ বাগ-ফিক্সড ১ কোটি স্কেল বেঞ্চমার্ক রি-রান (~১৬ মিনিট, উপরে ৩) — শুধু DB ফাইল সাইজ কনফার্ম করতে
- [ ] Real device-এ dev flag দিয়ে boot memory/time যাচাই (৬-মাস windowed invoices)
- [ ] `queryPage()` কে আসল UI কল-সাইটে wire করা (Read-path cutover, #৪-৫)
- [ ] "আজকের ইনভয়েস লিস্ট" কোয়েরি স্লোনেস (৩১৪.৭ms) — কম্পোজিট ইনডেক্স যোগ করে রিভিজিট
- [ ] Phase ৬ (list/pagination UX), Phase ৭ (Dashboard Scientist pattern) — অপরিবর্তিত, এখনো ডিজাইন হয়নি

---

### [এন্ট্রি ২২] — Phase ৫ সম্পূর্ণ (getState()-সিঙ্কড write-through Map, ৭টা রিয়েল কল-সাইট); Phase ৬-৭ সম্পর্কে সৎ স্কোপ-নোট

**⚠️ প্রথমেই একটা সংখ্যা-গরমিল ধরা পড়েছে**: এন্ট্রি ১৮/২০-এ "বাকি ~৯৭টা" বলা হয়েছিল, কিন্তু এই সেশনে আসল কোডে গ্রেপ করে (`getState().products.find`, `getState().customers.find`, `getState().invoices.find`) পাওয়া গেছে মাত্র **৭টা** রিয়েল কল-সাইট (একটা মিল ছিল আসলে কমেন্ট, কোড না)। "৯৭" সংখ্যাটা সম্ভবত একটা আগের সেশনের ব্যাপক অনুমান ছিল (হয়তো সব ধরনের `.find(id)` প্যাটার্ন গুনে, যার বড় অংশ THEME_PRESETS/users/expenses/allCategories-এর মতো এই মাইগ্রেশনের স্কোপের বাইরের জিনিস) — এই সেশনে actual grep-count দিয়ে ভুল ধরা পড়ল ও ঠিক করা হলো।

**যা করা হলো (Phase ৫ সম্পূর্ণ)**:
- Store definition-এ (`useAppStore = create(...)`) নতুন তিনটা ফিল্ড: `productsById`, `customersById`, `invoicesById` (খালি `Map()` দিয়ে ইনিশিয়ালাইজড)।
- Store তৈরির ঠিক পরে `useAppStore.subscribe(selector, listener, {fireImmediately:true})` (৩টা — products/customers/invoices প্রতিটার জন্য) — যখনই সেই array বদলায় (`set()` বা `patch()` যেভাবেই বদলাক, দুটোই একই zustand internal `set` কল করে), নতুন `id → record` Map রিবিল্ড হয়ে store-এ ফিরে বসে।
- 🔴 **কেন এটা getState().find()-এর নিরাপদ প্রতিস্থাপন**: এই Map render-cycle-এর বাইরে, subscription-চালিত — তাই `useAppStore.getState().productsById` সবসময় সর্বশেষ কমিটেড state প্রতিফলিত করে, ঠিক `getState().products.find()`-এর মতোই fresh, কিন্তু O(1)। আগের এন্ট্রি ১৮-এর useMemo-ভিত্তিক Map (render-time snapshot) থেকে এটা আলাদা — সেটা এই getState() কল-সাইটগুলোর জন্য যথেষ্ট ছিল না, এই নতুন subscription-ভিত্তিক Map-ই সেই gap পূরণ করলো।
- ৭টা কল-সাইট রিওয়্যার করা হলো: `processReturn()`-এর `freshInv`/`localP`/`freshP` (৩ জায়গা, লাইন ~13518-14011), walk-in customer balance lookup (২ জায়গা, ~18444-18476), POS return flow-এর `freshP` (~18487)। প্রতিটাতে `.find(x => x.id === Y)` → `.get(String(Y))`, ID-কে `String()`-এ wrap করা হয়েছে (Map key হিসেবে productsById-এর বিদ্যমান কনভেনশন অনুসরণ করে)।
- `ViewerDashboardScreen`-এর পুরনো comment (লাইন ~16892) আপডেট করা হলো যাতে ভুল না বোঝায় — সেখানকার local useMemo Map ভিন্ন জিনিস (component-local, store-independent), আর store-level `productsById` এখন এই gap সমাধান করেছে সেটা স্পষ্ট করা হলো।

**যাচাই**: `npx eslint 'src/**/*.{js,jsx}'` → 0 errors (550 warnings, entry ২০-এর সমান — নতুন কোনো warning আসেনি)। `npm test` (১২০), `test:fuzz` (৯), `test:golden-master` (৭) সব ✅। `npm run build` সফল।

**⚠️ এখনো বাকি — real device টেস্ট**: sandbox-এ এই Map সবসময়-ফ্রেশ কিনা যাচাই করা যায় না (rapid concurrent action, race condition এড়ানো হচ্ছে কিনা)। Real device-এ দ্রুত পরপর একাধিক return/sale করে দেখা উচিত ডেটা কখনো stale দেখাচ্ছে কিনা।

**Phase ৬ ও ৭ নিয়ে সৎ কথা (এই সেশনে করা হয়নি, এবং এক বসায় করাটা যুক্তিসঙ্গত না)**:
- **Phase ৬ (list/pagination)**: এটা Phase ৪-৫-এর মতো "existing behavior-এর নিচে নতুন infra বসানো" না — এটা synchronous array-slice রেন্ডারিং থেকে SQLite-এর async `queryPage()`-এ পুরো আর্কিটেকচার বদল (নতুন loading state, race handling, scroll-position/UX ডিজাইন লাগবে)। এটা এন্ট্রি ১৮-এও এই কারণেই স্কিপ করা হয়েছিল। কোন লিস্ট (products/customers/invoices) আগে, pagination-এর UX কেমন হবে (infinite scroll vs page button), আর loading-state হ্যান্ডলিং কীভাবে — এগুলো আগে ঠিক করে নেওয়া দরকার একটা আলাদা ফোকাসড সেশনে।
- **Phase ৭ (Dashboard Scientist pattern)**: shadow-compare ইনফ্রা (SQLite রেজাল্ট vs IndexedDB রেজাল্ট রানটাইমে তুলনা করে mismatch লগ করা) — এখনো ডিজাইনই করা হয়নি এই thread-এ, শুধু নাম উল্লেখ ছিল। কোন মেট্রিক/query compare হবে, mismatch পেলে কী করবে (silent log vs alert) — এসব প্রথমে ঠিক করা দরকার।

**এই সেশনে না করার কারণ**: eternal rule অনুযায়ী প্রতিটা ধাপ আলাদাভাবে verify করে এগোনো — Phase ৬/৭ একসাথে চাপিয়ে দিলে ঠিক যে ধরনের স্কোপ-মিসম্যাচ বাগ এন্ট্রি ১৯-এ হয়েছিল, সেই ঝুঁকি অনেক বেড়ে যায় (৫০০ দোকানের লাইভ প্রোডাক্ট)। Phase ৫ ছোট, well-defined, এবং সম্পূর্ণ ভেরিফায়েবল ছিল বলেই এক সেশনে করা নিরাপদ মনে হয়েছে।

---

### [এন্ট্রি ২১] — Real device ম্যানুয়াল টেস্ট সম্পন্ন: backfill + সার্চ + রিটার্ন (সবচেয়ে বড় unverified গ্যাপ ক্লোজড)

**যা টেস্ট করা হলো (real device, dev panel দিয়ে ফ্ল্যাগ চালু করে, টেস্ট ফার্মেসি শপে)**:
- **Backfill**: products 2235/2235, customers 17/17, invoices 627/627 — সব ১০০% done।
- **Row-count ভেরিফিকেশন**: SQLite vs IndexedDB — products, customers, invoices তিনটাই মিলেছে (backfill-পরবর্তী স্ন্যাপশটে 2236/2236, 17/17, 629/629)।
- **হাইব্রিড সার্চ**: ইউজার কনফার্ম করেছেন সার্চ কাজ করছে (কোন কল-সাইট নির্দিষ্ট করে বলা হয়নি)।
- **`processReturn()` রিটার্ন ফ্লো**: নতুন ইনভয়েস (INV-000630, Walk-in Customer, ৩টি পণ্য) তৈরি করে ১টি পণ্য রিটার্ন করা হলো। ইনভয়েস কার্ডে "১টি পণ্য ফেরত হয়েছে" ব্যাজ সঠিকভাবে দেখাচ্ছে। রিটার্নের **পরে** আবার row-count ভেরিফাই করা হলো — SQLite vs IndexedDB এখনো ১০০% মিলছে (products 2236/2236, customers 17/17, invoices 630/630) — অর্থাৎ `productsById` write-through Map-ভিত্তিক রিটার্ন পাথ dual-write-এ কোনো ডেটা-মিসম্যাচ তৈরি করেনি।
- **ANALYZE**: ম্যানুয়ালি রান করা হয়েছে, ইনডেক্স স্ট্যাটিস্টিক্স রিফ্রেশড।

**ঝুঁকি**: শূন্য নতুন কোড — এটা শুধু ভেরিফিকেশন। কোনো এরর/ক্র্যাশ/মিসম্যাচ পাওয়া যায়নি।

**যা এখনো বাকি**:
- [ ] Phase ৫ — বাকি ~৯৭টা transaction-critical `.find(id)` কল-সাইট (getState()-ভিত্তিক, আলাদা write-through mechanism দরকার)
- [ ] Phase ৬ (list/pagination), Phase ৭ (Dashboard Scientist pattern)
- [ ] ১ কোটি স্কেলের ফুল বেঞ্চমার্ক এখনো বাকি (১০ লাখ পর্যন্তই করা হয়েছে)
- [ ] একাধিক শপে (test শপের বাইরে) এখনো টেস্ট করা হয়নি

---

### [এন্ট্রি ২০] — dependency-conflict ফিক্স + Phase ৪ বাকি ৩টা কল-সাইট (হাইব্রিড সার্চ সম্পূর্ণ)

**১) `npm install` dependency-conflict ফিক্স**:
- সমস্যা: `@codetrix-studio/capacitor-google-auth@3.3.6`-এর peer dependency `@capacitor/core@^5.0.0`, কিন্তু প্রজেক্টের বাকি সব `@capacitor/*` প্যাকেজ `^6.2.0` — `npm install` (কোনো flag ছাড়া) ERESOLVE এরর দিয়ে ব্যর্থ হতো।
- ফিক্স: `@codetrix-studio/capacitor-google-auth` আপডেট `3.3.6` → `3.4.0-rc.4` (npm registry-তে peerDependencies চেক করে কনফার্ম করা হয়েছে — এই ভার্সন `@capacitor/core@^6.0.0` চায়, যেটা প্রজেক্টের সাথে মেলে)।
- ⚠️ **সততার সাথে নোট**: এটা একটা **release-candidate** ভার্সন (স্টেবল `3.4.0` না, প্যাকেজের নিজস্ব npm history-তে এখনো `-rc.4`-ই সর্বশেষ ট্যাগ)। ফাংশনালিটি (Google sign-in) real device-এ টেস্ট করে দেখা উচিত deploy করার আগে যদি এই ফিচার সক্রিয়ভাবে ব্যবহৃত হয়।
- যাচাই: `rm -rf node_modules package-lock.json && npm install` কোনো `--force`/`--legacy-peer-deps` ছাড়াই ক্লিন সম্পন্ন হয়েছে।

**২) Phase ৪ (হাইব্রিড সার্চ) — বাকি ৩টা কল-সাইট**:
- `Products` কম্পোনেন্ট — `filteredAll` (মূল পণ্য লিস্ট সার্চ) ও `peFilteredProds` (ক্রয় এন্ট্রি ফর্ম সার্চ) — দুটোর জন্য আলাদা candidate state (`prodListFtsIds`/`peFtsIds`), কারণ দুটোর query-উৎস আলাদা (`deferredSearch` বনাম `peForm.productSearch`), একসাথে খোলা থাকলে একটার candidate আরেকটাকে প্রভাবিত না করে সেজন্য।
- `Dashboard` কম্পোনেন্ট — সাপ্লায়ার-লিস্ট মডালের পণ্য-সার্চ (IIFE-এর ভেতরে)। 🔴 **গুরুত্বপূর্ণ ডিজাইন-সিদ্ধান্ত**: এই সার্চ UI একটা conditionally-rendered IIFE-তে (`{(() => {...})()}`) থাকায় সেখানে সরাসরি `useState`/`useEffect` বসালে **rules-of-hooks ভাঙত** (মডাল খোলা/বন্ধ হওয়ার সাথে hook-count বদলে যেত, যেটা React রানটাইম এরর দেয়)। তাই state/effect `Dashboard`-এর top-level-এ (সবসময় unconditionally কল হয়) বসানো হয়েছে, IIFE শুধু ফলাফল পড়ে — নতুন hook কল করে না।
- 🔴 **বাগ এড়ানো (এন্ট্রি ১৯-এর মতো আরেকটা স্কোপ-সমস্যা প্রায় হতেই যাচ্ছিল)**: `FTS_NARROW_THRESHOLD` আগে শুধু `SmartInvoiceBuilder`-এর ভেতরে component-local const ছিল — নতুন কল-সাইট দুটো (Products, Dashboard) আলাদা কম্পোনেন্ট হওয়ায় এটা রেফারেন্স করতে পারত না। কোড লেখার সময়ই এটা ধরে **module-level কনস্ট্যান্টে তুলে আনা হয়েছে** (মান অপরিবর্তিত, ৫০০০), `SmartInvoiceBuilder`-এর লোকাল কপি সরিয়ে ফেলা হয়েছে যাতে duplicate/shadow না হয়।
- এখন `productMatchScore()`-এর সবগুলো (৪টা) কল-সাইটই হাইব্রিড প্যাটার্নে ওয়্যার্ড — Phase ৪ সম্পূর্ণ।

**যাচাই**: `npx eslint 'src/**/*.{js,jsx}'` → 0 errors (550 warnings, নতুন কোনো no-undef আসেনি)। `npm test` (120), `test:fuzz`, `test:golden-master` (7) সব ✅। `npm run build` সফল। থ্রেশহোল্ড (৫০০০) সব জায়গায় একই এবং আপনার বর্তমান স্কেলের (২০০০-এর কম) উপরে, তাই **আচরণ এখনো সম্পূর্ণ অপরিবর্তিত** — শুধু ইনফ্রাস্ট্রাকচার প্রস্তুত।

**যা এখনো বাকি (অপরিবর্তিত অবস্থায়)**:
- [ ] Real device-এ dev panel দিয়ে ফ্ল্যাগ চালু করে backfill + সার্চ + রিটার্ন ম্যানুয়ালি টেস্ট — sandbox-এ এখনো করা যায়নি, এটা এখনো সবচেয়ে বড় unverified গ্যাপ
- [ ] Phase ৫ — বাকি ~৯৭টা transaction-critical `.find(id)` (getState()-ভিত্তিক)
- [ ] Phase ৬ (list/pagination), Phase ৭ (Dashboard Scientist pattern)

---

### [এন্ট্রি ১৯] — বাগ-ফিক্স: CI build fail (`productsById is not defined`) — Phase ৫-এর স্কোপ মিসম্যাচ

**সমস্যা (GitHub Actions run #678, screenshots থেকে রিপোর্ট করা)**: ESLint `no-undef` — 2টা এরর, `'productsById' is not defined` (`src/App.jsx`), build exit code 1।

**রুট কজ**: এন্ট্রি ১৮-এ Phase ৫ (write-through Map) যোগ করার সময় `productsById`/`customersById` `useMemo` **ভুলবশত শুধু `ViewerDashboardScreen`-এ** (viewer-mode কম্পোনেন্ট, লাইন ~16811) ডিফাইন হয়েছিল। কিন্তু এটা যেখানে আসলে ব্যবহার হচ্ছে — `processReturn()` (লাইন 13932, 14134) — সেটা সম্পূর্ণ ভিন্ন, top-level কম্পোনেন্ট `SmartBusinessMgmt()`-এর ভেতরে (আসল App)। দুটো আলাদা ফাংশন-স্কোপ হওয়ায় `processReturn` থেকে `productsById` দেখা যাচ্ছিল না — কোড কপি করার সময় দুই কম্পোনেন্ট গুলিয়ে ফেলা হয়েছিল, sandbox-এ Babel syntax-check pass করলেও (syntax ভুল ছিল না, শুধু স্কোপ ভুল) real ESLint (`no-undef` rule) এটা ধরত, যেটা sandbox টেস্টিং-এ চালানো হয়নি।

**ফিক্স**: `SmartBusinessMgmt()`-এর ভেতরে, যেখানে `products = useAppStore(s => s.products)` ইতিমধ্যে আছে (লাইন ~10862), সেখানেই একই `productsById = useMemo(...)` যোগ করা হলো — যাতে `processReturn()` ঠিক স্কোপ থেকেই এটা পড়ে। আচরণ অপরিবর্তিত, শুধু স্কোপ ঠিক করা হয়েছে, নতুন লজিক যোগ হয়নি। `ViewerDashboardScreen`-এর কপি স্পর্শ করা হয়নি (এখন সেখানে `productsById` unused — শুধু warning, error না, ব্লক করে না)।

**যাচাই**: `npx eslint 'src/**/*.{js,jsx}'` → **0 errors** (550 warnings, আগে ছিল 2 errors/551 warnings) → exit code 0। `npm test` (120), `npm run test:fuzz`, `npm run test:golden-master` (7) সব ✅। `npm run build` সফল।

**শিক্ষা (পরবর্তী সেশনের জন্য)**: sandbox-এ শুধু Babel syntax-check বা `npm test`/`build` চালানো যথেষ্ট না — `no-undef`-জাতীয় স্কোপ বাগ ধরতে হলে আসল `npm run lint` (ESLint) সবসময় প্রতিটা কল-সাইট ওয়্যারিং-এর পর চালাতে হবে, শুধু "syntax ওকে" বলে সন্তুষ্ট হওয়া যাবে না।

**ঝুঁকি**: শূন্য — এটা শুধু আগে থেকে-ভাঙা একটা বিল্ড ঠিক করা, নতুন কোনো read-path বা transaction লজিক বদলায়নি।

---

### [এন্ট্রি ১৮] — Phase ৪-৬ শুরু (হাইব্রিড সার্চ, write-through Map; Phase ৬ ইচ্ছাকৃতভাবে স্কিপড)

**Phase ৪ (হাইব্রিড সার্চ) — একটা কল-সাইট (প্রোডাক্ট গ্রিড সার্চ, `filteredProducts`)**:
- `DataStore.js`-এ `hybridSearchCandidateIds()` — FTS5 দিয়ে candidate id সেট বের করে।
- 🔴 **ডিজাইন-সিদ্ধান্ত পুনর্বিবেচনা**: আগে এন্ট্রি/আলোচনায় ভাবা হয়েছিল candidate narrowing সবসময় চালু থাকবে, কিন্তু কোড দেখে confirm হলো — FTS5 শুধু prefix/token ম্যাচ করে, `productMatchScore()`-এর ফাজি/বারকোড-সাবস্ট্রিং ম্যাচ না। তাই candidate pool দিয়ে narrow করলে ভ্যালিড ম্যাচ বাদ পড়ার ঝুঁকি (কোয়ালিটি রিগ্রেশন)। **সিদ্ধান্ত**: `FTS_NARROW_THRESHOLD = 5000` — এর নিচে (আমাদের ৩ দোকানের বর্তমান স্কেল) narrowing সম্পূর্ণ বন্ধ, পুরনো ফুল-array `productMatchScore()`-ই চলে (আচরণ ১০০% অপরিবর্তিত)। ভবিষ্যতে ডেটা অনেক বড় হলেই এই path সক্রিয় হবে।
- debounced (150ms) `useEffect` candidate fetch করে, ব্যর্থ হলে সাইলেন্টলি `null` (ফুল-array ফলব্যাক)।
- **বাকি ৩টা `productMatchScore()` কল-সাইট** (কাস্টমার সার্চ, POS দুটো জায়গা) এই সেশনে ছোঁয়া হয়নি — একই প্যাটার্নে পরের সেশনে যোগ করা যাবে।

**Phase ৫ (write-through Map) — infra + ১টা প্রুফ-অফ-কনসেপ্ট কল-সাইট**:
- `productsById`/`customersById` — `useMemo`-ভিত্তিক id→record Map (products/customers array বদলালেই রিকম্পিউট, React-নিজস্ব মেমোাইজেশন, ম্যানুয়াল ref/effect বুককিপিং নেই)।
- ওয়্যার করা হলো: `processReturn()`-এর `localP` লুকআপ (line ~13924) — এটা render-time closure `products`-থেকে সরাসরি `.find()` করত, তাই Map দিয়ে সরাসরি প্রতিস্থাপন নিরাপদ (একই ডেটা সোর্স, শুধু O(1))।
- 🔴 **স্পষ্ট সীমা**: বাকি ~৯৭টা `.find(id)` কল-সাইটের বড় অংশ `useAppStore.getState().products.find(...)` প্যাটার্নে — এগুলো ইচ্ছাকৃতভাবে **ছোঁয়া হয়নি**, কারণ এই render-time Map সবসময়-ফ্রেশ না (getState() ঠিক এই কারণেই ব্যবহৃত হয়, race-condition এড়াতে)। এই ক্লাসের কল-সাইটের জন্য আলাদা (getState()-সিঙ্কড) write-through mechanism দরকার — এটা আলাদা, বড়, ঝুঁকিপূর্ণ কাজ, তাড়াহুড়ো করে এই সেশনে করা হয়নি।

**Phase ৬ (list/pagination) — ইচ্ছাকৃতভাবে স্কিপড এই সেশনে**:
- Virtuoso-র sync `useMemo`/array-slice থেকে SQLite `queryPage()`-এ যাওয়া মানে synchronous থেকে async রেন্ডারিং-এ যাওয়া (loading state, race handling নতুন করে ডিজাইন করা লাগবে) — এটা Phase ৪-৫-এর চেয়ে গুণগতভাবে ভিন্ন/বড় ঝুঁকির কাজ। এই সেশনে শুরু করা হয়নি, পরের একটা ডেডিকেটেড সেশনে আলাদাভাবে করা উচিত (নিজের দোকানে টেস্টের সময়সহ)।

**যাচাই**: `npm test` (১২০) ✅, `test:fuzz` ✅, `test:golden-master` (৭) ✅, `npm run build` ✅। প্রোডাক্ট সার্চ, কাস্টমার রিটার্ন ফ্লো — real-device-এ ম্যানুয়ালি চেক করা এখনো বাকি (sandbox-এ Capacitor/SQLite bridge চলে না)।

**পরের ধাপ**: Phase ৬ (list/pagination, আলাদা সেশনে) → Phase ৭ (Dashboard/useKpiStats, Scientist pattern) → Phase ৮-৯ (নিজের দোকানে টেস্ট, রোলআউট)।

---

### [এন্ট্রি ১৭] — Phase ১-৩ শুরু (foundation টেবিল + Repository লেয়ার + golden-master test)

**প্রেক্ষাপট**: `PHASE_3_4_5_FINAL_PLAN_v2.md` (নতুন, প্রজেক্ট রুটে) অনুযায়ী কাজ শুরু। প্ল্যানে ১১টা ধাপ — এই সেশনে প্রথম ৩টা।

**Phase ১ (foundation টেবিল, sync-ready)**:
- `schema.sql`-এ ২টা নতুন টেবিল: `feature_flags` (key/value/updated_at/device_id) ও `events` (append-only log — entity_type/entity_id/op/payload/device_id/ts/synced)।
- `DataStore.js`: `getEventDeviceId()` (localStorage-ভিত্তিক synchronous, লাইসেন্স deviceId থেকে ইচ্ছাকৃতভাবে আলাদা), `mirrorFlagToSqlite()`, `logEventsMany()`, `getUnsyncedEvents()`/`markEventsSynced()` (ভবিষ্যৎ sync-এর জন্য, এখনো কোথাও কল হচ্ছে না)।
- `isSqliteEnabled()`/`setSqliteEnabled()` **ইচ্ছাকৃতভাবে অপরিবর্তিত** (এখনো synchronous localStorage) — `dualWriteSqlite()`-এর সিঙ্ক্রোনাস কনট্র্যাক্ট ভাঙা যাবে না বলে। শুধু SqliteMigrationCard-এর টগলে `mirrorFlagToSqlite()` fire-and-forget কল যোগ হয়েছে।
- `App.jsx`-এর `dualWriteSqlite()`-এ প্রতিটা upsert/remove-এর পাশে `logEventsMany()` কল যোগ (fire-and-forget, মূল write-path অস্পৃষ্ট)।

**Phase ২ (Repository লেয়ার)**:
- নতুন `src/db/Repository.js` — `getCustomerById()`, `getProductById()`, `getInvoiceById()` (এখনো ভেতরে plain array, আচরণ অপরিবর্তিত)।
- প্রুফ-অফ-কনসেপ্ট হিসেবে ২টা কল-সাইট ওয়্যার করা হয়েছে (`detailCust` — মূল App() আর viewer-mode কম্পোনেন্ট দুটোতেই) — এগুলো আগে চিহ্নিত "pure-display lookup" জায়গার একটা।
- **বাকি**: বাকি ~৯৮টা `.find(id)` কল-সাইট (বেশিরভাগ transaction-critical, `useAppStore.getState()` প্যাটার্নে) এখনো ওয়্যার করা হয়নি — সেগুলো Phase ৫ (write-through Map)-এর কাজ, ইচ্ছাকৃতভাবে এই সেশনে ছোঁয়া হয়নি (race-condition ঝুঁকি এড়াতে আগে Map-ইনফ্রা লাগবে)।

**Phase ৩ (টেস্ট ইনফ্রাস্ট্রাকচার)**:
- 🔍 **আবিষ্কার**: property-based testing (`fast-check`) ইতিমধ্যেই আছে — `tests/logic-fuzz.mjs` (calcInvoiceTotal, calcCashDrawer, restoreBatchQty, isBatchExpired, getSortedActiveBatches, computeSupplierDueMap-এ, প্রতিটা ১০০০ random রান)। কোনো আগের এন্ট্রিতে এটা উল্লেখ পাইনি, কিন্তু কোডে বিদ্যমান ও পাস করছে। তাই নতুন করে বানানো হয়নি — শুধু কনফার্ম করা হলো এখনো কাজ করছে (`npm run test:fuzz` — সব পাস)।
- নতুন `tests/golden-master.mjs` + `npm run test:golden-master`। **সীমাবদ্ধতা সৎভাবে বলা দরকার**: `@capacitor-community/sqlite` native bridge-নির্ভর, তাই plain Node.js CI-তে আসল SQLite connection খোলা যায় না — mock/stub ব্যবহার করা হয়নি (মিথ্যা নিরাপত্তাবোধ এড়াতে)। তাই এই টেস্ট `DataStore.js`-এর pure transformation ফাংশন (`normName`, `dateKeyFromTs` — দুটোই এখন export করা হয়েছে টেস্টযোগ্যতার জন্য) সেই নির্দিষ্ট known-good input/output-এর বিপরীতে pin করে, বিশেষত এন্ট্রি ২ (BD টাইমজোন বাউন্ডারি) আর এন্ট্রি ৯ (ডাবল-স্পেস normalize)-এর বাগ আবার সাইলেন্টলি না ফেরার গ্যারান্টি হিসেবে। **আসল array-vs-SQLite রিয়েল-ডেটা রিকনসিলিয়েশন এখনো শুধু dev panel দিয়ে ডিভাইসেই সম্ভব** — Phase ৭ (Scientist pattern shadow-compare) চালু হলে এটা রানটাইমেও স্বয়ংক্রিয় হবে।

**যাচাই**: `npm test` (৭২+১৪+১০+২৪ = ১২০ কেস) ✅, `npm run test:fuzz` ✅, `npm run test:golden-master` (৭ কেস) ✅, `npm run build` ✅। কোনো ফাংশনাল টেস্ট SQLite native bridge লাগে এমন কিছুতে (Phase ০-১-এর মতোই) করা যায়নি — real-device-এ dev panel দিয়ে ফ্ল্যাগ চালু করে backfill+verify করে দেখা দরকার।

**পরের ধাপ**: প্ল্যানের Phase ৪ (হাইব্রিড সার্চ কাটওভার) — FTS5 candidate pool + আসল `productMatchScore()` দিয়ে র‍্যাংক।

---

### [এন্ট্রি ১৬] — স্বয়ংক্রিয় ANALYZE-এর ফলাফলে toast যোগ (আগে সাইলেন্ট ছিল)

**সমস্যা**: এন্ট্রি ১৫-এ স্বয়ংক্রিয় ANALYZE যোগ হয়েছিল, কিন্তু `migrateStoreResumable()` (`src/db/DataStore.js`) ইচ্ছাকৃতভাবে framework-agnostic — এই ফাইলে কোনো React import নেই (ফাইলের একদম শুরুতেই এই ডিজাইন সিদ্ধান্ত লেখা আছে, Node.js সিন্থেটিক-ডেটাসেট স্ক্রিপ্ট থেকেও ব্যবহারযোগ্য রাখতে)। তাই এখান থেকে সরাসরি `showToast()` কল করা যায় না — ANALYZE ব্যর্থ হলে শুধু `console.warn` হতো, ব্যবহারকারী কিছুই দেখতেন না।

**ফিক্স**:
- `migrateStoreResumable()`-এর রিটার্ন-অবজেক্টে এখন `analyzeOk` (boolean) ও `analyzeError` (string|null) যোগ হয়েছে — ANALYZE সফল/ব্যর্থ হয়েছে কিনা, আর ব্যর্থ হলে কেন।
- `src/App.jsx`-এর `runResumable()`-এ (যার `showToast` অ্যাক্সেস আছে) এখন এই ফলাফল পড়ে আলাদা toast দেখানো হয়:
  - ANALYZE সফল হলে: "📊 {store}: ANALYZE-ও স্বয়ংক্রিয়ভাবে সম্পন্ন হয়েছে"
  - ব্যর্থ হলে: "⚠️ {store}: ব্যাকফিল সফল হলেও ANALYZE ব্যর্থ হয়েছে — ম্যানুয়াল বাটনে চেষ্টা করুন" (এরর মেসেজসহ)
- `alreadyDone` (আগে থেকেই সম্পূর্ণ) ক্ষেত্রে এই toast দেখানো হয় না, কারণ সেই পথে ANALYZE চলেই না (শুধু নতুন সম্পূর্ণ হওয়া backfill-এর পরই চলে)।

**যাচাই**: Babel দিয়ে App.jsx ও DataStore.js দুটোই সিনট্যাক্স-ওকে। `analyzeOk`/`analyzeError` নাম দুই ফাইলে সামঞ্জস্যপূর্ণ। real-device-এ পরের ব্যাকফিলের পর দুটো toast (backfill সম্পন্ন + ANALYZE সম্পন্ন) একসাথে/পরপর আসছে কিনা কনফার্ম করা দরকার।

---

### [এন্ট্রি ১৫] — ANALYZE (backfill শেষে স্বয়ংক্রিয় + ম্যানুয়াল বাটন)

**সমস্যা যা ঠিক করা হলো** (এন্ট্রি ২-এ প্রথম ধরা পড়েছিল): বড় backfill-এর পর SQLite-কে না জানালে (`ANALYZE` না চালালে) query planner পুরনো/অনুপস্থিত স্ট্যাটিস্টিক্স দিয়ে ভুল ইনডেক্স বেছে নিতে পারে — dashboard-এর covering index (`idx_invoices_dashboard`) থাকা সত্ত্বেও aggregate query সময়ের সাথে সাথে আবার ধীর হয়ে যেতে পারে।

**ফিক্স**:
- `src/db/DataStore.js`-এ নতুন `analyzeDb(businessType)` এক্সপোর্ট — `ANALYZE;` চালায়।
- `migrateStoreResumable()`-এর একদম শেষে (একটা store-এর backfill সত্যিই এইমাত্র সম্পূর্ণ হলে, `alreadyDone` শর্টসার্কিটে না) স্বয়ংক্রিয়ভাবে `analyzeDb()` কল হয়। ব্যর্থ হলেও migration নিজে ব্যর্থ ধরা হয় না (`try/catch` + `console.warn`) — ANALYZE শুধু অপ্টিমাইজেশন, ক্রিটিকাল পাথ না।
- `src/App.jsx`-এর dev প্যানেলে নতুন "📊 ANALYZE চালান (ম্যানুয়াল)" বাটন — অনেকদিন পর ডেটা অনেক বেড়ে গেলে বা কোনো কারণে স্বয়ংক্রিয় ANALYZE মিস হয়ে গেলে হাতে আবার চালানোর জন্য।

**যাচাই**: Babel দিয়ে App.jsx ও DataStore.js দুটোই সিনট্যাক্স-ওকে, `analyzeDb` ইমপোর্ট/এক্সপোর্ট/কল — সব জায়গায় নাম মিলেছে, ডুপ্লিকেট ডিক্লেয়ারেশন নেই। sandbox-এ ফাংশনাল টেস্ট করা যায়নি (SQLite native প্লাগইন real device/Capacitor-নির্ভর) — real-device-এ পরের ব্যাকফিলের পর toast "📊 ANALYZE সম্পন্ন" আসছে কিনা কনফার্ম করা দরকার।

**পরের ধাপ**: Phase 1 + Phase 2 (dual-write + resumable migration + ANALYZE) — মূল কাজ সম্পূর্ণ। এখন থেকে যা বাকি মূলত সময়সাপেক্ষ পর্যবেক্ষণ ও পরবর্তী ফেজের প্ল্যানিং:
1. কয়েক সপ্তাহ dual-write চালু রেখে টেস্ট শপে স্বাভাবিক ব্যবহার পর্যবেক্ষণ
2. customers/invoices-এও resumable migration টেস্ট (ঐচ্ছিক, একই কোড-পাথ)
3. ৫০০ দোকানে rollout প্ল্যান (dual-write কীভাবে চালু হবে সবার জন্য)
4. Phase 3 (read-path cutover) — এখনো অনেক দূরে, migration সম্পূর্ণ-নিশ্চিত হওয়ার আগে শুরু হবে না

---

### [এন্ট্রি ১৪] — real-device Phase 2 টেস্ট: resumable migration সফল সম্পন্ন (500 থেকে resume → 2235/2235 done), + মাইনর UI ফ্ল্যাশ ফিক্স

**টেস্ট রেজাল্ট (real device, স্ক্রিনশট-ভিত্তিক কনফার্মড)**:
- app-kill-এর পর কার্ড খুলতেই status লাইনে সাথে সাথে "in_progress (500/2235)" দেখা গেছে, "অজানা" না — এন্ট্রি ১৩-এর mount-time `useEffect` ফিক্স কনফার্মড কাজ করছে।
- "শুরু/রিজিউম" চাপার পর ব্যাচে ব্যাচে (1000 → 1500 → ... → 2235) এগিয়ে শেষে ✅ toast + status "done (2235/2235)" — সম্পূর্ণ সফল, কোনো ডেটা লস/ডুপ্লিকেট নেই।

**নতুন ধরা পড়া মাইনর ইস্যু (ফাংশনালিটি বাগ না, শুধু initial UI flash)**: "শুরু/রিজিউম" বাটনে চাপার সাথে সাথেই progress line মুহূর্তের জন্য "0/2235 (0%)" দেখাত (স্ক্রিনশটে ধরা পড়েছে), যদিও DB-স্ট্যাটাস তখনো ঠিকই "500/2235" দেখাচ্ছিল আর ভেতরে ভেতরে `migrateStoreResumable()` ঠিক ৫০১ থেকেই resume করছিল। কারণ: `runResumable()`-এ progress line হার্ডকোডেড `{ migrated: 0, ... }` দিয়ে রিসেট হতো, resume-পয়েন্ট বিবেচনা না করেই।

**ফিক্স** (`src/App.jsx`): এখন বাটনে চাপার সময় ইতিমধ্যে লোড করা `migrationStates` (dbState) থেকে `migrated_rows` পড়ে progress line-কে সেই সংখ্যা দিয়ে ইনিশিয়ালাইজ করা হয় (status `"in_progress"` হলে), `0` দিয়ে না — তাই "রিজিউম" চাপার সাথে সাথেই সঠিক শুরুর বিন্দু দেখাবে।

**যাচাই**: Babel সিনট্যাক্স-চেক ওকে। real-device-এ পরের বার resume করার সময় নিশ্চিত করা দরকার প্রাথমিক flash-এ এখন সঠিক সংখ্যা দেখায় কিনা (যেমন 500/2235 শুরুতেই, 0/2235 না)।

**পরের ধাপ**: Phase 2-এর মূল কাজ (resumable migration) মূলত কনফার্মড কাজ করছে। বাকি যা আগে বলা হয়েছিল — ANALYZE কমান্ড রান করা, customers/invoices-এও একই ধরনের টেস্ট (বাধ্যতামূলক না, কারণ একই কোড-পাথ), আর কয়েক সপ্তাহ পর্যবেক্ষণ পিরিয়ড।

---

### [এন্ট্রি ১৩] — "স্ট্যাটাস: অজানা" আসল কারণ: app-kill-এর পর React state রিসেট হয়ে যাওয়া, DB-তে progress ঠিকই ছিল

**রিপোর্ট করা উপসর্গ**: real-device টেস্টে `products` 2000/2235-এ (in_progress) পৌঁছানোর পর অ্যাপ ব্যাকগ্রাউন্ড থেকে সরানো হলো (recent apps swipe)। আবার অ্যাপে ঢুকে দেখা গেল প্রগ্রেস লাইন উধাও, স্ট্যাটাস "অজানা", আর দেখতে মনে হচ্ছিল ০ থেকে আবার শুরু হবে।

**আসল কারণ**: `SqliteMigrationCard`-এর `migrationStates` ও `resumableProgress` — দুটোই React `useState`, শুধু কম্পোনেন্ট মাউন্ট থাকা অবস্থায় মেমরিতে থাকে। অ্যাপ kill হলে পুরো React tree রিসেট হয়, তাই কম্পোনেন্ট আবার মাউন্ট হয় খালি স্টেট নিয়ে (`migrationStates = null`, `resumableProgress = {}`) — আগে এই দুটো স্টেট শুধু ম্যানুয়াল "রিফ্রেশ" বাটন বা কোনো রান শুরু/শেষ হলেই লোড হতো, মাউন্টেই না। কিন্তু **`_migration_state` টেবিলের আসল ডেটা (SQLite ফাইলে) অক্ষত ছিল** — `last_migrated_id`, `migrated_rows: 2000` সবই ঠিকই সেভ ছিল। তাই "রিজিউম" চাপলে ফাংশনালি ঠিক ২০০১ থেকেই শুরু হতো (এন্ট্রি ১১-এর `migrateStoreResumable()` লজিক অপরিবর্তিত, সঠিক), কিন্তু ব্যবহারকারী UI দেখে বুঝতে পারছিলেন না যে progress টিকে আছে — বিভ্রান্তিকর মনে হচ্ছিল ০ থেকে শুরু হবে।

**ফিক্স** (`src/App.jsx`, `SqliteMigrationCard`):
- নতুন `useEffect(() => { refreshMigrationStates(); }, [businessType])` যোগ করা হয়েছে — কার্ড মাউন্ট হওয়ামাত্রই (অ্যাপ কোল্ড-স্টার্ট হোক বা ট্যাব-সুইচ) DB থেকে আসল `_migration_state` পড়ে দেখায়, ম্যানুয়াল রিফ্রেশ চাপার দরকার নেই।
- ফলে এখন app-kill-এর পর কার্ড খুললেই সাথে সাথে "স্ট্যাটাস: in_progress (2000/2235)" দেখাবে, "অজানা" না — এবং "রিজিউম" চাপলে সেটাই কনফার্ম করে ঠিক জায়গা থেকে চলবে।

**সীমাবদ্ধতা**: এই ফিক্সটা শুধু status-টেক্সট লাইন কভার করে (`dbState`-নির্ভর)। নিচের ⏳/✅ progress-বার লাইনটা এখনো শুধু `resumableProgress` (লোকাল, লাইভ-রান-ভিত্তিক) থেকে আসে — mount-এ dbState থাকলেও ওই বারটা দেখাবে না যতক্ষণ না নতুন করে রান শুরু হয় (এটা বাগ না, কারণ status-টেক্সট লাইনেই এখন সংখ্যাটা স্পষ্ট দেখা যাচ্ছে) — future polish হিসেবে চাইলে dbState থেকে fallback প্রগ্রেস-বার-ও রেন্ডার করা যায়।

**যাচাই**: Babel `transformFileSync()`-এ সিনট্যাক্স ওকে, `useEffect` ইতিমধ্যে top-level import-এ আছে। real-device-এ পরের টেস্টে কনফার্ম করা দরকার: app-kill → reopen → কার্ড খুলে সাথে সাথেই "in_progress (2000/2235)" দেখাচ্ছে কিনা রিফ্রেশ না চেপেই।

---

### [এন্ট্রি ১২] — dev প্যানেলের "স্ট্যাটাস: অজানা" বিভ্রান্তি ফিক্স (ডেটা বাগ না, শুধু UI স্টেল-স্টেট)

**রিপোর্ট করা উপসর্গ**: real-device টেস্টে `products` মাইগ্রেশন প্রথমে ✅ done (2235/2235) দেখাল, তারপর স্ক্রিনশটে হঠাৎ আবার "চলছে..." + progress 1500/2235 + status লাইনে "অজানা" দেখা গেল — মনে হচ্ছিল প্রগ্রেস হারিয়ে গেছে বা ডেটা নষ্ট হয়েছে।

**তদন্তে যা পাওয়া গেল**: ডেটা নষ্ট হয়নি। আসল কারণ দুটো UI স্টেট (`resumableProgress` লোকাল স্টেট বনাম `migrationStates` DB-রিড স্টেট) সিঙ্কে ছিল না:
1. রিসেট চাপলে `_migration_state`-এর রো ডিলিট হয় ও সাথে সাথে রিফ্রেশ হয় — তখন `dbState` পাওয়া যায় না, তাই status লাইন "অজানা" দেখায় (এটা নিজে বাগ না, প্রত্যাশিত)।
2. কিন্তু পুরনো `resumableProgress[store]` (✅ 2235/2235) ক্লিয়ার হতো না রিসেটে — তাই progress লাইন আর status লাইন পরস্পরবিরোধী দেখাত।
3. এরপর আবার "শুরু/রিজিউম" চাপলে শূন্য থেকে নতুন রান শুরু হয় (batch progress দেখায়, যেমন 1500/2235) — কিন্তু `migrationStates` শুধু পুরো রান **শেষ হওয়ার পর** (`runResumable`-এর `finally`-তে) রিফ্রেশ হতো, তাই রান চলাকালীন status লাইন স্টেল/অজানা থেকে যেত, প্রগ্রেস বার এগোলেও।

**ফিক্স** (`src/App.jsx`):
- `runResumable()`-এর `onProgress` কলব্যাকে এখন প্রতি ব্যাচের পর `refreshMigrationStates()`-ও কল হয় — status লাইন এখন progress বারের সাথে লাইভ সিঙ্কে থাকবে।
- `runResetMigrationState()`-এ রিসেটের সাথে সাথে `resumableProgress[store]`-ও ক্লিয়ার করা হয়, যাতে পুরনো ✅ progress line ঝুলে না থাকে DB-স্টেট মুছে যাওয়ার পরও।

**যাচাই**: Babel `transformFileSync()`-এ পুরো App.jsx সিনট্যাক্স-ওকে। ফাংশনাল রি-টেস্ট (রিসেট → রিজিউম → মাঝপথে progress দেখা) sandbox-এ করা যায়নি (real device দরকার) — পরের real-device টেস্টে status লাইন প্রতি ব্যাচে আপডেট হচ্ছে কিনা কনফার্ম করা দরকার।

**ঝুঁকি**: `refreshMigrationStates()` এখন প্রতি ব্যাচে (৫০০ রেকর্ডে একবার) একটা extra DB read করবে — বড় স্কেলে (লাখ+ রেকর্ড, শত ব্যাচ) এটা সামান্য বাড়তি I/O যোগ করবে, কিন্তু প্রতিটা কল হালকা (`SELECT * FROM _migration_state`, মাত্র ৩ রো), তাই বাজেট ফোনেও এর প্রভাব নগণ্য হওয়ার কথা।

---

### [এন্ট্রি ১১] — Phase 2: Resumable migration runner (`_migration_state` টেবিল, ব্যাচড ব্যাকফিল)

**কেন**: এন্ট্রি ৯/১০-এর "যা এখনো বাকি" #১ — এন্ট্রি ৬-৭-এর dev-প্যানেল ম্যানুয়াল ব্যাকফিল সবসময় *পুরো* অ্যারে একবারে `upsertMany()` দিয়ে পাঠায়। আপনার নিজের দোকানে (২২৩৫ প্রোডাক্ট) এটা সমস্যা করেনি, কিন্তু ৫০০ দোকানের মধ্যে বড় স্কেলের দোকানে (লাখ-কোটি রেকর্ড) মাঝপথে অ্যাপ বন্ধ/kill হলে — কোনো progress-ট্র্যাকিং না থাকায় — আবার পুরো ব্যাকফিল প্রথম থেকে শুরু করতে হতো। schema.sql-এর `_migration_state` টেবিল (Phase 0 থেকেই সংজ্ঞায়িত ছিল, এতদিন অব্যবহৃত) এখন কাজে লাগানো হলো।

**কী করা হলো**:
- `DataStore.js`-এ নতুন `migrateStoreResumable(businessType, store, sourceRecords, opts)` — উৎস অ্যারে `id` দিয়ে সর্ট করে একটা স্থিতিশীল/ডিটারমিনিস্টিক ক্রম বানায় (resumability-র জন্য জরুরি — insertion-order-এর উপর নির্ভর করলে রান থেকে রানে "কোথা থেকে চালিয়ে যেতে হবে" অস্পষ্ট হয়ে যেত), তারপর `_migration_state`-এ সেভ থাকা `last_migrated_id` অনুযায়ী ঠিক পরের রেকর্ড থেকে শুরু করে, ৫০০-রেকর্ডের ব্যাচে (কনফিগারযোগ্য) `upsertMany()` কল করে — প্রতি ব্যাচের পর `_migration_state` (migrated_rows, last_migrated_id, status) আপডেট হয়।
- সাপোর্টিং ফাংশন: `getAllMigrationStates()` (dev প্যানেলে progress দেখানোর জন্য), `resetMigrationState()` (নির্দিষ্ট store-এর progress রিসেট করে জোর করে আবার প্রথম থেকে শুরুর জন্য)।
- `SqliteMigrationCard`-এ (App.jsx) একটা নতুন "🔁 Resumable migration" সেকশন — products/customers/invoices প্রতিটার জন্য আলাদা progress bar, "শুরু/রিজিউম করুন" আর "রিসেট" বাটন, আর সব store-এর `_migration_state` রিফ্রেশ করে দেখার বাটন।

**যাচাই**: এবার শুধু syntax-check না, সম্পূর্ণ **ফাংশনাল সিমুলেশন** `node:sqlite`-এ চালানো হয়েছে (DataStore.js-এর ঠিক একই অ্যালগরিদম re-implement করে, কারণ `@capacitor-community/sqlite` sandbox-এ নেই) — ২৩০০-রেকর্ডের সিন্থেটিক ডেটাসেটে ৪টা সিনারিও টেস্ট করা হয়েছে:
1. **সিমুলেটেড ক্র্যাশ**: ২ ব্যাচ (১০০০ রেকর্ড) পর ইচ্ছাকৃতভাবে লুপ বন্ধ করে দেওয়া হয়েছে — `_migration_state`-এ সঠিকভাবে `migrated_rows=1000, status='in_progress', last_migrated_id='p00999'` সেভ হয়েছে কনফার্ম করা হয়েছে।
2. **Resume**: আবার একই ফাংশন কল করে — বাকি ১৩০০ রেকর্ড ঠিক যেখান থেকে থেমেছিল সেখান থেকে শুরু হয়ে সম্পূর্ণ হয়েছে, শেষে মূল টেবিলে ও FTS টেবিলে দুটোতেই ঠিক ২৩০০ রো (কোনো ডুপ্লিকেট/মিসিং না) কনফার্ম করা হয়েছে।
3. **Already-done**: সম্পূর্ণ হওয়ার পর আবার কল করলে `alreadyDone: true` রিটার্ন করে কোনো নতুন write ছাড়াই কনফার্ম করা হয়েছে।
4. **Force restart**: `force: true` দিয়ে আবার পুরো migration চালিয়ে — `INSERT OR REPLACE`-এর কারণে row-count এখনো ঠিক ২৩০০-ই আছে (ডুপ্লিকেট হয়নি) কনফার্ম করা হয়েছে।

`App.jsx`/`DataStore.js` দুটোই Babel `transformSync()`-এ সিনট্যাক্স-ওকে, নতুন import/export মিলেছে (grep দিয়ে কনফার্ম)।

**ঝুঁকি**: কম — নতুন কোড শুধু dev প্যানেলের নতুন সেকশন থেকে ম্যানুয়ালি ট্রিগার হয়, বিদ্যমান dual-write (`dualWriteSqlite()`)/live effect-flow অপরিবর্তিত। schema.sql ছোঁয়া হয়নি (টেবিল আগে থেকেই ছিল)।

**⚠️ সীমাবদ্ধতা**: alogরিদম-লেভেলে (resumability logic) পুরোপুরি ভ্যালিডেট করা হয়েছে `node:sqlite`-এ, কিন্তু আসল Capacitor প্লাগইনের `executeSet()`-এর transaction-behavior (batch-এর মাঝে সত্যিকারের app-kill হলে partial-batch commit/rollback ঠিক কেমন আচরণ করে) শুধু real-device টেস্টেই পুরোপুরি কনফার্ম হবে।

**যা এখনো বাকি**:
- [ ] Real-device-এ resumable migration টেস্ট — বিশেষভাবে "মাঝপথে সত্যিই অ্যাপ force-close করে resume করা" (সিমুলেটেড না, real app kill)
- [ ] backfill/migration শেষে `ANALYZE` চালানো এখনো কোথাও কোড করা হয়নি
- [ ] Phase 3 (read-path cutover): এখনো App.jsx সব রিড IndexedDB থেকেই করছে, SQLite শুধু shadow-write। migration সম্পূর্ণ ও যাচাই-নিশ্চিত হওয়ার পরই এই ধাপ শুরু হবে
- [ ] Phase 4 (reconciliation/ongoing verification), Phase 5 (পুরনো IndexedDB কোড অপসারণ) — এখনো অনেক দূরে

---

### [এন্ট্রি ১০] — Real-device Phase 1 টেস্ট ফলাফল (এন্ট্রি ৮-৯ ফিক্সের পর) — ✅ সফল

আপনার নিজের ফার্মেসি দোকানে (businessType: pharmacy, products: 2233 → 2235, customers: 17, invoices: 627) real-device-এ dev প্যানেল দিয়ে সরাসরি টেস্ট করা হয়েছে (স্ক্রিনশট শেয়ার করা হয়েছে) — এন্ট্রি ৮ (PRAGMA ফিক্স) আর এন্ট্রি ৯ (FTS trigger ফিক্স) দুটোরই বাস্তব-ডিভাইস কনফার্মেশন:

1. **পূর্ণ ব্যাকফিল**: প্রথমবার dual-write চালু করে — ✅ "ব্যাকফিল সম্পন্ন — products: 2233, customers: 17, invoices: 627" — কোনো এরর ছাড়া।
2. **Row-count ভেরিফাই**: SQLite vs IndexedDB — products/customers/invoices তিনটাতেই ✓ মিলেছে।
3. **Live/automatic dual-write** (এন্ট্রি ৬-এর `dualWriteSqlite()` effect): অ্যাপে সরাসরি একটা নতুন প্রোডাক্ট যোগ করার পর (dev প্যানেলে ফিরে **ম্যানুয়াল ব্যাকফিল না চেপেই**) — products কাউন্ট নিজে থেকেই 2234 → 2235-এ আপডেট হয়ে SQLite-এ দেখা গেছে, IndexedDB-এর সাথে মিলেছে। এটাই সবচেয়ে গুরুত্বপূর্ণ কনফার্মেশন — dual-write শুধু ম্যানুয়াল বাটনে না, স্বাভাবিক ব্যবহারেও ঠিকমতো চলছে।

**উল্লেখযোগ্য পার্শ্ব-পর্যবেক্ষণ (অ্যাকশন লাগবে না, শুধু নোট)**: প্রথম টেস্টের সময় app data clear করা হয়েছিল (এন্ট্রি ৯-এর পরামর্শ অনুযায়ী, সম্ভাব্য আধা-তৈরি স্কিমা এড়াতে) — এতে লোকাল Google Drive OAuth সেশন লগ-আউট হয়ে গেছে (স্ক্রিনশটে "OFF" দেখা গেছে)। এটা প্রত্যাশিত পার্শ্ব-প্রতিক্রিয়া, ডেটা-লস না — শুধু আবার "Connect" চেপে লগইন করলেই ঠিক হয়ে যাবে।

**উপসংহার**: Phase 1 (dual-write) core mechanism — schema init, FTS sync, ব্যাচ ব্যাকফিল, row-count ভেরিফিকেশন, আর live incremental write — সবগুলোই এখন real-device-এ কনফার্মড কাজ করছে একটা আসল প্রোডাকশন দোকানের ডেটাসেটে।

---

### [এন্ট্রি ৯] — ২য় real-device বাগ ফিক্স: FTS5 trigger "incomplete input" এরর (root-cause fix, শুধু patch না)

**কেন**: এন্ট্রি ৮-এর ফিক্সসহ আবার real-device-এ ব্যাকফিল টেস্ট করার পর PRAGMA এরর চলে গেছে, কিন্তু নতুন এরর ধরা পড়ল — এবারও প্রথম চেষ্টাতেই।

**এরর (স্ক্রিনশটে)**: `Execute: incomplete input: CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN INSERT INTO products_fts(products_fts, rowid, id, name) VALUES ('delete', old.rowid, old.id, old.name);` — statement-টা `END;`-এর আগেই কাটা।

**রুট কজ (দুটো আলাদা সমস্যা একসাথে)**:
1. **প্লাগইনের statement-splitter বাগ**: `@capacitor-community/sqlite`-এর Android bridge multi-statement SQL টেক্সট চালানোর সময় প্রতিটা `;` দিয়ে টুকরো করে, কিন্তু `CREATE TRIGGER ... BEGIN ... END;`-এর ভেতরের `;`-গুলো বুঝতে পারে না। `products_ai`/`products_ad` ট্রিগারে ভেতরে মাত্র ১টা statement ছিল বলে কাকতালীয়ভাবে চলে গেছে, কিন্তু `products_au`-এ ২টা statement (delete + insert) থাকায় ঠিক প্রথম `;`-এ কেটে গেছে — এটাই এরর মেসেজে দেখা "incomplete input"।
2. **একটা গভীর ডিজাইন-ত্রুটি, যেটা প্লাগইন-বাগ ফিক্স করলেও থেকে যেত**: `upsert()`/`upsertMany()` সবসময় `INSERT OR REPLACE` ব্যবহার করে, আর `id` কলাম `TEXT PRIMARY KEY` (rowid-alias না, কারণ `INTEGER PRIMARY KEY` না) — তাই SQLite-এ PK-conflict হলে `INSERT OR REPLACE` আসলে ভেতরে ভেতরে পুরনো row **DELETE করে নতুন INSERT** করে, real `UPDATE` না। ফলে `products_au` (AFTER **UPDATE**) ট্রিগার আদৌ এই write-path-এ কখনো ফায়ারই হতো না — আর প্রতিটা replace-এ rowid বদলে যেত, যা `content_rowid='rowid'`-নির্ভর FTS5 external-content সিঙ্ককে থিওরিগতভাবেই ভঙ্গুর করে তুলেছিল। মানে শুধু প্লাগইন-বাগ প্যাচ করলেও ভবিষ্যতে সাইলেন্ট FTS-desync ধরা পড়ত।

**কী করা হলো (root-cause fix)**: SQL trigger-নির্ভর FTS5 sync সম্পূর্ণ সরিয়ে ফেলা হয়েছে —
- `schema.sql`: `products_fts`/`customers_fts` এখন **standalone FTS5** টেবিল (`content=`/`content_rowid=` নেই), আর ৬টা ট্রিগারই (`products_ai/ad/au`, `customers_ai/ad/au`) মুছে ফেলা হয়েছে।
- `DataStore.js`: নতুন `syncFtsRow()` (একক upsert) আর `buildFtsStatements()` (ব্যাচ upsert) ফাংশন — `id` দিয়ে ম্যাচ করে সরাসরি `DELETE FROM ..._fts WHERE id=?` + `INSERT INTO ..._fts (...)`, কোনো rowid/trigger নির্ভরতা ছাড়াই। `upsert()`, `upsertMany()` (একই ব্যাচ-transaction-এ), আর `remove()` — তিনটাতেই এখন এই ম্যানুয়াল সিঙ্ক কল হয়। `searchFts()`-এর কোয়েরি (`JOIN ..._fts ON f.id = t.id`) অপরিবর্তিত রাখা গেছে, কারণ standalone FTS5-তেও `id` কলাম দিয়ে জয়েন কাজ করে।

**যাচাই**: Node-এর `node:sqlite`-এ পুরো ফ্লো ফাংশনালি টেস্ট করা হয়েছে — (ক) নতুন schema (trigger ছাড়া) ক্লিন execute হয়েছে, (খ) upsert + FTS sync simulation করে বাংলা টেক্সট (প্যারাসিটামল) সার্চ করে সঠিক রেকর্ড পাওয়া গেছে, (গ) একই `id`-তে দ্বিতীয়বার upsert করে FTS-এ ডুপ্লিকেট রো হয়নি কিনা কনফার্ম করা হয়েছে (count=1), (ঘ) remove()-এর পর FTS row সত্যিই মুছে গেছে কিনা কনফার্ম করা হয়েছে (count=0)। `DataStore.js` ও `App.jsx` (অপরিবর্তিত) দুটোই Babel `transformSync()`-এ সিনট্যাক্স-ওকে।

**ঝুঁকি**: কম-মাঝারি — এটা এন্ট্রি ৭-এর প্যাটার্নের চেয়ে বড় পরিবর্তন (schema + লজিক দুটোই), কিন্তু এখনো শুধু dev-প্যানেল-ট্রিগারড ব্যাকফিলে সীমাবদ্ধ, কোনো দোকানে লাইভ প্রভাব নেই। **আগের যেকোনো টেস্ট শপে যদি ইতিমধ্যে dual-write একবার চালু করে থাকেন (এন্ট্রি ৮-এর ফিক্সের পর), সেই SQLite DB ফাইলে হয়তো আংশিক/ভাঙা স্কিমা তৈরি হয়ে থেকে গেছে** (schema execute মাঝপথে ব্যর্থ হয়েছিল) — তাই এই ফিক্সের পর প্রথমবার ব্যাকফিল চালানোর আগে সেই টেস্ট শপের SQLite DB ফাইলটা মুছে/রিসেট করে নেওয়া নিরাপদ (নিচে দেখুন)।

**⚠️ পরবর্তী টেস্টের আগে করণীয়**: যদি আগের এরর স্ক্রিনশটের সময় dual-write একবার "চালু" অবস্থায় গিয়ে থেকে থাকে, সেই ডিভাইসের `sbm_pharmacy`/`sbm_<businessType>` SQLite DB ফাইলে আংশিক স্কিমা থাকতে পারে (যেমন `products_au` ট্রিগার তৈরি না হয়েই বাকি সব টেবিল/ইনডেক্স তৈরি হয়ে গেছে)। যেহেতু এই এন্ট্রিতে schema.sql-এর trigger অংশটাই সম্পূর্ণ সরানো হয়েছে, `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS` idempotent হওয়ায় পরের বার app খুললে এমনিতেই ঠিক হয়ে যাওয়ার কথা — কিন্তু পুরনো `products_fts`/`customers_fts` যদি আগের (external-content) সংজ্ঞা দিয়ে already তৈরি হয়ে থেকে থাকে, `CREATE VIRTUAL TABLE IF NOT EXISTS` নতুন সংজ্ঞা প্রয়োগ করবে না (already exists ধরে স্কিপ করবে)। এই এজ-কেস এড়াতে টেস্ট শপে dev প্যানেলে গিয়ে একবার dual-write বন্ধ করে অ্যাপ থেকে ওই ডিভাইসের SQLite DB ফাইল মুছে (বা অ্যাপ ডেটা ক্লিয়ার করে, IndexedDB অক্ষত থাকবে যেহেতু এখনো ওটাই sole source-of-truth) আবার তাজা backfill চালানো সবচেয়ে নিরাপদ।

**যা এখনো বাকি**:
- [ ] উপরের ক্লিন-স্লেট নোট মাথায় রেখে আবার real-device-এ ব্যাকফিল টেস্ট
- [ ] Migration backfill runner/resumability (`_migration_state` টেবিল) — এখনো লেখা হয়নি
- [ ] backfill শেষে `ANALYZE` চালানো এখনো কোথাও কোড করা হয়নি

---

### [এন্ট্রি ৮] — ফার্স্ট real-device টেস্টে ধরা পড়া বাগ ফিক্স: PRAGMA execSQL() এরর (`src/db/DataStore.js`)

**কেন**: এন্ট্রি ৭-এর হিডেন dev প্যানেল দিয়ে আপনি প্রথমবার real-device-এ (আপনার নিজের ফার্মেসি দোকান, ২২৩৩ প্রোডাক্ট/১৭ কাস্টমার/৬৫৭ ইনভয়েস) "SQLite dual-write চালু + ব্যাকফিল" টেস্ট করেছেন — ঠিক যা করতে বলা হয়েছিল, আর তাতেই একটা রিয়েল বাগ ধরা পড়ল (স্ক্রিনশট শেয়ার করার জন্য ধন্যবাদ, এটাই টেস্ট প্যানেলের আসল উদ্দেশ্য)।

**এরর (স্ক্রিনশটে)**: `Execute: unknown error: Queries cannot be performed using execSQL(), use query() instead.`

**রুট কজ**: `schema.sql`-এর প্রথম লাইনগুলো —
```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```
— `getDb()`-এ পুরো schema.sql একসাথে `db.execute()` দিয়ে চালানো হচ্ছিল। কিন্তু Android-এ `PRAGMA journal_mode = WAL` statement-টা journal mode-এর নতুন ভ্যালু **রিটার্ন করে** (একটা রেজাল্ট রো), যেটাকে Android-এর `SQLiteDatabase.execSQL()` "query" হিসেবে গণ্য করে প্রত্যাখ্যান করে — `@capacitor-community/sqlite`-এর `execute()` শুধু non-query DDL/DML (CREATE TABLE, INSERT ইত্যাদি)-এর জন্য, PRAGMA-র জন্য না।

**কী করা হলো**: `getDb()`-এ schema লোড করার পর একটা regex (`/^\s*PRAGMA\s[^;]*;/gim`) দিয়ে সব PRAGMA লাইন schema টেক্সট থেকে আলাদা করা হয়েছে — সেগুলো এখন একে একে `db.query()` দিয়ে চালানো হচ্ছে (query() যেকোনো ধরনের statement, রেজাল্ট রিটার্ন করুক বা না করুক, সাপোর্ট করে)। বাকি স্কিমা (CREATE TABLE/INDEX/VIRTUAL TABLE/TRIGGER, কোনো PRAGMA ছাড়া) আগের মতোই `db.execute()`-এ যায়। `schema.sql` ফাইল নিজে অপরিবর্তিত — শুধু `DataStore.js`-এ কীভাবে এটা রান করা হচ্ছে সেটা বদলেছে।

**যাচাই**: regex split + উভয় অংশের বৈধতা Node-এর বিল্ট-ইন `node:sqlite`-এর `DatabaseSync`-এ ফাংশনালি টেস্ট করা হয়েছে — ৩টা PRAGMA ঠিকভাবে আলাদা হয়েছে, বাকি স্কিমায় কোনো PRAGMA অবশিষ্ট নেই (regex দিয়ে কনফার্ম), আর দুই অংশই আলাদাভাবে এরর ছাড়া execute হয়েছে। `DataStore.js` পুরোটা Babel `transformSync()`-এ সিনট্যাক্স-ভ্যালিডেট করা হয়েছে (`SYNTAX OK`)। **⚠️ সীমাবদ্ধতা**: এই regex-ভিত্তিক ফিক্সটা `node:sqlite`-এ (যেটা Capacitor-community/sqlite-এর মতোই SQLite ব্যবহার করে) যাচাই করা হয়েছে, কিন্তু আসল Capacitor প্লাগইনের `db.query()`/`db.execute()`-এর নির্দিষ্ট আচরণ (Android-এ) শুধু real-device টেস্টেই পুরোপুরি কনফার্ম হবে — এটাই এখন পরের ধাপ।

**ঝুঁকি**: কম — শুধু `DataStore.js`-এর `getDb()` ফাংশনের schema-execution লজিক বদলেছে, `schema.sql`/App.jsx/অন্য কোনো ফাইল ছোঁয়া হয়নি। যেহেতু এই কোড এখনো শুধু dev প্যানেল থেকে (৭-ট্যাপ আনলক) manually ট্রিগার হয়, প্রোডাকশনের কোনো দোকানে এখনো প্রভাব নেই।

**যা এখনো বাকি**:
- [ ] এই ফিক্সসহ আবার real-device-এ ব্যাকফিল টেস্ট করা — এবার সফল হওয়ার কথা, তারপর "ভেরিফাই" বাটনে চেপে SQLite row-count IndexedDB-এর সাথে মিলছে কিনা দেখা
- [ ] Migration backfill runner/resumability (`_migration_state` টেবিল) — এখনো লেখা হয়নি
- [ ] backfill শেষে `ANALYZE` চালানো এখনো কোথাও কোড করা হয়নি

---

### [এন্ট্রি ৭] — হিডেন dev/সাপোর্ট Settings প্যানেল: SQLite ফ্ল্যাগ টগল + ম্যানুয়াল ব্যাকফিল + ভেরিফাই

**কেন**: এন্ট্রি ৬-এর "যা এখনো বাকি" #১ — এতদিন `sbm_use_sqlite_store` ফ্ল্যাগ চালু করতে হলে ম্যানুয়ালি `localStorage.setItem(...)` করতে হতো (কোনো UI ছিল না), যা টেস্ট শপে বাস্তবিক real-device যাচাই (বাকি #২) শুরু করার আগে একটা ব্লকার ছিল।

**🔴 এই এন্ট্রিতে মাঝপথে একটা ডিজাইন ভুল ধরা পড়ে ঠিক করা হয়েছে**: প্রথমে নতুন কার্ডটা বিদ্যমান `DevPanelFlag.visible` গার্ডের পেছনে বসানো হয়েছিল (মনে হয়েছিল এটা পুনর্ব্যবহারযোগ্য প্যাটার্ন)। কিন্তু ইউজার-রিভিউ থেকে ধরা পড়ল — `DevPanelFlag.visible` শুধু `checkSubscription()`-এ (কেন্দ্রীয় Firestore-এর `subscriptions/{phone}` ডকুমেন্ট পড়ে) সেট হতো, আর `admin.html` + কেন্দ্রীয় Firebase প্রজেক্ট দুটোই আগেই সম্পূর্ণ ডিলিট করা হয়েছে (অ্যাপ এখন পুরো অফলাইন)। ফলে `DevPanelFlag.visible` কখনো `true` হওয়ার কোনো পথই অবশিষ্ট নেই — এটা `SubscriptionGate`-এর মতোই ১০০% মৃত/অপ্রাপ্য কোড, ওই গার্ড ব্যবহার করলে নতুন কার্ডটা চিরস্থায়ীভাবে অদৃশ্যই থাকত। **ফিক্স**: `AppVersionCard`-এ (Settings-এর নিচে, "অ্যাপ ভার্সন" কার্ড) ভার্সন নাম্বারে ৭ বার ট্যাপ করলে আনলক হওয়ার পুরনো (admin.html-এরও আগের, কমেন্টে উল্লেখিত) gesture-ভিত্তিক মেকানিজম ফেরত আনা হলো — সম্পূর্ণ অফলাইন, কোনো সার্ভার/রিমোট কনফিগ লাগে না। আনলক অবস্থা `localStorage` (`sbm_dev_panel_unlocked`)-এ persist হয় যাতে বারবার ৭-বার ট্যাপ করতে না হয়।

**কী করা হলো**: App.jsx-এ `SqliteMigrationCard` নামে একটা নতুন collapsible কার্ড যোগ হয়েছে, বিদ্যমান `BackupDiagnosticsCard`-এর হুবহু একই প্যাটার্নে। এটা এখন `Settings_`-এর `devPanelUnlocked` state-এর পেছনে গার্ডেড — যেটা শুধুমাত্র `AppVersionCard`-এর ভার্সন নাম্বারে ৭ বার ট্যাপ (২.৫ সেকেন্ডের মধ্যে) করলে সেট হয়।

কার্ডের তিনটা কাজ:
1. **ফ্ল্যাগ টগল** — বাটনে চাপলে `setSqliteEnabled(true/false)` কল হয় (`DataStore.js`-এ আগে থেকেই ছিল, শুধু এখন App.jsx থেকে import করে UI-তে ওয়্যার করা হলো)। চালু করার আগে `window.confirm()` দিয়ে সতর্ক করে যে বর্তমান সব products/customers/invoices ব্যাকফিল হবে।
2. **ম্যানুয়াল ব্যাকফিল** — flag চালু করার সাথে সাথেই সরাসরি `upsertMany()` কল করে তিনটা অ্যারে (products/customers/invoices) SQLite-এ পাঠানো হয়, তারপর যেকোনো সময় "আবার ব্যাকফিল চালান" বাটনেও। *কেন এটা দরকার ছিল*: `dualWriteSqlite()` (এন্ট্রি ৬) শুধু তখনই ফায়ার হয় যখন products/customers/invoices state আসলেই বদলায় (useEffect dependency) — শুধু flag toggle করলে সেই effect নিজে থেকে রি-রান হয় না। টেস্ট শপে তাৎক্ষণিক ফলাফল দেখার জন্য এখানে ম্যানুয়ালি সরাসরি কল করা হচ্ছে।
3. **ভেরিফাই** — `DataStore.js`-এর `aggregate()` দিয়ে SQLite-এর `COUNT(*)` বনাম IndexedDB অ্যারের `.length` পাশাপাশি দেখায় (মিলছে কিনা রঙ-কোডেড ✓/⚠️)।

**যাচাই**: পুরো `App.jsx` (৩৯,৬০০+ লাইন) `@babel/core`-এর `transformSync()` (`@babel/preset-react` সহ) দিয়ে ২ বার সিনট্যাক্স-ভ্যালিডেট করা হয়েছে (গার্ড ফিক্সের আগে ও পরে) — দুইবারই `SYNTAX OK`। `grep`-এ নিশ্চিত করা হয়েছে `DevPanelFlag.visible`-এর কোনো live রেফারেন্স আর অবশিষ্ট নেই (শুধু একটা পুরনো ঐতিহাসিক কমেন্ট আছে, কোড-পাথ না)। `SqliteMigrationCard`/`Settings_`/`AppVersionCard`/`BackupDiagnosticsCard` ফাংশন নাম ইউনিক, `DataStore.js`-এর সব export (`isSqliteEnabled`, `setSqliteEnabled`, `aggregate`) App.jsx-এর import লাইনের সাথে মেলানো হয়েছে। **⚠️ সীমাবদ্ধতা**: এই সেশনেও sandbox-এ `@capacitor/core` peer-dependency conflict-এর কারণে প্রজেক্টের নিজস্ব `node_modules` পুরোপুরি ইনস্টল করা যায়নি (তাই `npm test`/`npm run build` চালানো যায়নি এবার) — Babel সিনট্যাক্স-চেক আলাদা isolated npm প্রজেক্টে বসিয়ে চালানো হয়েছে। পুশের পর GitHub Actions CI (`build-apk.yml`)-এর ফুল বিল্ড পাস করেছে কিনা চেক করে নেওয়া উচিত, ঠিক আগের এন্ট্রিগুলোর মতোই।

**ঝুঁকি**: ডিফল্ট অবস্থায় শূন্য — নতুন কার্ডটা `devPanelUnlocked` (ডিফল্ট `false`, `localStorage`-ভিত্তিক) গার্ডের পেছনে, ভার্সন নাম্বারে ৭ বার ইচ্ছাকৃত ট্যাপ ছাড়া কোনো দোকানের Settings-এই এটা দেখা যাবে না। তারপরও শুধু কেউ সচেতনভাবে "SQLite dual-write চালু করুন" বাটনে চেপে দ্বিতীয়বার `window.confirm()`-এ রাজি হলেই প্রভাব পড়বে।

**যা এখনো বাকি**:
- [ ] টেস্ট শপে real-device-এ ছোট স্কেলে dual-write চালু করে যাচাই করা — এখন Settings-এ গিয়ে ভার্সন নাম্বারে ৭ বার ট্যাপ করে, তারপর "চালু + ব্যাকফিল" বাটনে চেপে সহজেই করা যাবে
- [ ] Migration backfill runner/resumability (`_migration_state` টেবিল ব্যবহার করে) — এখনো লেখা হয়নি, বড় স্কেলে (১ কোটি+ ইনভয়েস) reliability-র জন্য দরকার; এই এন্ট্রির ম্যানুয়াল ব্যাকফিল ছোট/মাঝারি স্কেলের টেস্টের জন্য যথেষ্ট কিন্তু resumable না (মাঝপথে অ্যাপ বন্ধ হলে প্রথম থেকে আবার শুরু করতে হবে)
- [ ] backfill শেষে `ANALYZE` চালানো এখনো কোথাও কোড করা হয়নি (এন্ট্রি ২-এর নোট মনে রাখতে হবে, Phase 2 migration runner লেখার সময়)

---

### [এন্ট্রি ৬] — Phase 1 শুরু: dual-write ওয়্যারিং (single point-of-truth, App.jsx-এ ৪৬টা কল-সাইট আলাদাভাবে না ছুঁয়ে)

**কেন**: এন্ট্রি ৫-এ সব Phase 0 ব্লকার সমাধান হয়ে গিয়েছিল। এখন Phase 1 (dual-write) শুরু — App.jsx-এর পুরনো IndexedDB blob-array path অপরিবর্তিত রেখে, পাশাপাশি SQLite-এও একই ডেটা লেখা।

**ডিজাইন সিদ্ধান্ত — কেন ৪৬টা setProducts/setCustomers/setInvoices কল-সাইট আলাদাভাবে ছোঁয়া হয়নি**: `grep`-এ দেখা গেছে App.jsx-জুড়ে products/customers/invoices-এর ৪৬টা কল-সাইট আছে (createInvoice, voidInvoice, Settings, Purchase Entry, Customer edit, Restore ইত্যাদি বহু জায়গায় ছড়ানো)। প্রতিটা আলাদাভাবে ইন্সট্রুমেন্ট করা লাইভ প্রোডাক্টে (৫০০ দোকান) ঝুঁকিপূর্ণ এবং মিস হওয়ার সম্ভাবনা বেশি। বদলে দেখা গেছে এই তিনটা অ্যারেই ইতিমধ্যে একটা single point-of-truth-এ মিলিত হয় — `debouncedSave(LK(SK.products), products, ...)` টাইপের তিনটা `useEffect([products/customers/invoices, loaded])`, যেগুলো IndexedDB-তে পুরো অ্যারে ব্যাকআপ করে। **dual-write লজিক এই তিনটা effect-এই বসানো হয়েছে** — অ্যারে যে কল-সাইট থেকেই বদলাক না কেন, শেষমেশ এই effect-গুলো অবশ্যই ফায়ার হবে, তাই কোনো কল-সাইট মিস হওয়ার ঝুঁকি নেই।

**কী করা হলো**:
1. App.jsx-এ `import { upsertMany, remove as dsRemove, isSqliteEnabled } from "./db/DataStore.js";` যোগ।
2. মডিউল-লেভেলে দুইটা নতুন হেল্পার (`debouncedSave`-এর পাশে): `diffById(prevMap, currentArr)` — প্রেভিয়াস id→object স্ন্যাপশটের সাথে বর্তমান অ্যারে তুলনা করে শুধু বদলানো/নতুন রেকর্ড বের করে (React-এর `setXxx(prev => prev.map(...))` প্যাটার্নে অপরিবর্তিত আইটেমের object reference অক্ষত থাকে বলে এটা সস্তা রেফারেন্স-চেক, কোনো deep-compare লাগে না) + `removedIds` (হার্ড-ডিলিট হওয়া আইডি)। `dualWriteSqlite(businessType, store, prevMapRef, currentArr)` — `isSqliteEnabled()` false হলে সাথে সাথে রিটার্ন (zero-cost), true হলে `diffById()`-এর ফলাফল দিয়ে `upsertMany()`/`dsRemove()` কল করে (fire-and-forget, `.catch(() => {})` — কোনো ব্যর্থতা মূল state-update path-কে কখনো ছোঁবে না)।
3. `SmartBusinessMgmt`-এ তিনটা `useRef(new Map())` (`_dsCustomersRef`/`_dsProductsRef`/`_dsInvoicesRef`) যোগ, আর customers/products/invoices-এর তিনটা `debouncedSave` effect-এ `dualWriteSqlite(...)` কল যোগ করা হলো — প্রতিটা effect-এ একলাইন এক্সট্রা কল, বাকি সব কোড অপরিবর্তিত।

**⚠️ পার্শ্ব-প্রতিক্রিয়া (ইচ্ছাকৃত, নোট রাখা হলো)**: যেহেতু ref শুরু হয় খালি Map দিয়ে, ফ্ল্যাগ (`sbm_use_sqlite_store`) প্রথমবার চালু করার পর অ্যাপ রিলোড/state-লোড হলে এই effect-গুলোর প্রথম রান-এ *সব* বিদ্যমান রেকর্ড "changed" হিসেবে ধরা পড়বে এবং `upsertMany()`-তে একবারে পুরো অ্যারে (potentially ১ কোটি ইনভয়েস) পাঠানো হবে — এটা কার্যত Phase 2 (backfill)-এর কাজটাও বিনামূল্যে করে দেয়, কিন্তু বাস্তব ডিভাইসে (কম RAM/CPU বাজেট ফোনে) এই এক-বারের বড় ব্যাচ কতটা ভারী পড়বে সেটা এখনো real-device টেস্ট করা হয়নি। **সতর্কতা**: ফ্ল্যাগ চালু করার আগে ছোট স্কেলে (কয়েক হাজার রেকর্ড) একটা টেস্ট শপে যাচাই করা উচিত।

**স্কোপ নোট**: `txns` অ্যারের জন্য dual-write যোগ করা হয়নি — Phase 0 `schema.sql`-এ এখনো `txns` টেবিল নেই (শুধু products/customers/invoices), এটা মূল প্ল্যানেরই অংশ, বাদ পড়েনি।

**যাচাই**: `npm test`-এর তিনটা স্যুট (logic ৭২ + integration ১০ + sync ২৪, মোট ১০৬) সব পাস। নতুন `diffById`/`dualWriteSqlite` লজিক আলাদা standalone স্ক্রিপ্টে সিনট্যাক্স+ফাংশনাল টেস্ট করা হয়েছে (reference-equality diff সঠিকভাবে কাজ করছে নিশ্চিত হয়েছে)। **⚠️ সীমাবদ্ধতা**: এই সেশনের sandbox-এ নেটওয়ার্ক বন্ধ থাকায় `node_modules` ইনস্টল করা যায়নি, তাই `npm run build` (vite build, পুরো App.jsx বান্ডল করে) বা `schema-tests.mjs` (zod প্যাকেজ লাগে) চালানো যায়নি এই সেশনে — App.jsx-এর edit ম্যানুয়ালি রিভিউ + একটা isolated স্ক্রিপ্টে সিনট্যাক্স-চেক করে যাচাই করা হয়েছে, কিন্তু GitHub push-এর পর CI (build-apk.yml)-এর ফুল বিল্ড স্টেপ প্রথমবার আসল কনফার্মেশন দেবে। পুশ করার পর CI পাস করেছে কিনা একবার চেক করে নেওয়া উচিত।

**ঝুঁকি**: ফ্ল্যাগ ডিফল্ট বন্ধ (`isSqliteEnabled()` false), তাই এই মুহূর্তে প্রোডাকশনে (৫০০ দোকানে) কোনো আচরণগত পরিবর্তন নেই — `dualWriteSqlite()` কল হলেও সাথে সাথে রিটার্ন করে। ঝুঁকি শুধু তখনই সক্রিয় হবে যখন কেউ সচেতনভাবে ফ্ল্যাগ অন করবে (এখনো কোনো UI টগল নেই এর জন্য, শুধু localStorage-এ ম্যানুয়ালি সেট করা যায়)।

**যা এখনো বাকি**:
- [ ] ফ্ল্যাগ টগল করার একটা (হিডেন/ডেভ-ওনলি) Settings UI যোগ করা, যাতে টেস্ট শপে চালু করা সহজ হয়
- [ ] টেস্ট শপে real-device-এ ছোট স্কেলে dual-write চালু করে যাচাই করা (initial backfill batch performance-সহ)
- [ ] Migration backfill runner/resumability (`_migration_state` টেবিল ব্যবহার করে) — dual-write ইতিমধ্যে কার্যত ইনিশিয়াল ব্যাকফিল করে দিচ্ছে বলে এটার প্রায়োরিটি এখন কম, কিন্তু resumable/progress-ট্র্যাকড ভার্সন এখনো দরকার বড় স্কেলে নির্ভরযোগ্যতার জন্য

---

### [এন্ট্রি ৫] — Dashboard aggregate slowness ফিক্স: covering ইনডেক্স + ১ কোটি স্কেল রি-বেঞ্চমার্ক

**কেন**: এন্ট্রি ৪-এ ফ্ল্যাগ হওয়া Dashboard SUM(total) aggregate-এর ~৯ সেকেন্ড স্লোনেস সমাধান করা — Phase 1 (dual-write) শুরুর আগে বাধ্যতামূলক ছিল।

**রুট কজ**: `invoices` টেবিলে `date_key`, `status`, `customer_id`-এর উপর আলাদা আলাদা single-column ইনডেক্স ছিল, কিন্তু `WHERE date_key = ? AND status = 'active'` কোয়েরির জন্য কোনো কম্বাইন্ড/কভারিং ইনডেক্স ছিল না — `EXPLAIN QUERY PLAN` দিয়ে নিশ্চিত হওয়া গেছে SQLite পুরো টেবিল স্ক্যান করছিল।

**কী করা হলো**: `schema.sql`-এ নতুন ইনডেক্স যোগ — `idx_invoices_dashboard ON invoices(date_key, status, total)`। `total` কলামটাও ইনডেক্সে থাকায় এটা একটা covering index — মূল টেবিলের কোনো row lookup ছাড়াই শুধু ইনডেক্স থেকে SUM/COUNT বের করা যায়।

**যাচাই**: প্রথমে ছোট স্কেলে `EXPLAIN QUERY PLAN` দিয়ে নিশ্চিত করা হয়েছে প্ল্যান এখন `SEARCH invoices USING COVERING INDEX idx_invoices_dashboard`। এরপর পুরো ১ কোটি স্কেলে আবার ফুল বেঞ্চমার্ক চালানো হয়েছে।

**১ কোটি স্কেল রি-বেঞ্চমার্ক ফলাফল (নতুন ইনডেক্সসহ, আগের এন্ট্রি ৪-এর সাথে তুলনা)**:
| মেট্রিক | এন্ট্রি ৪ (আগে) | এন্ট্রি ৫ (এখন) |
|---|---|---|
| **Dashboard SUM(total) aggregate** | ৮,৯৮২ms | **১.৪ms** (~৬,৪০০ গুণ দ্রুত) |
| ইনভয়েস ইনসার্ট (১ কোটি) | ~১৫ মিনিট ৪১ সেকেন্ড | ~২১ মিনিট ৪১ সেকেন্ড (এক্সট্রা ইনডেক্স মেইনটেইন করার খরচ) |
| DB ফাইল সাইজ | ~২.৯০ GB | ~৩.২০ GB (কভারিং ইনডেক্সের এক্সট্রা স্টোরেজ) |
| আজকের ইনভয়েস লিস্ট | ১৪৫.৮ms | ৭৯.৬ms |
| অন্যান্য কোয়েরি (LIKE/FTS5/লুকআপ/হিস্ট্রি) | অপরিবর্তিত রেঞ্জে (১-১৫ms) | অপরিবর্তিত রেঞ্জে (১-১৩ms) |

**ট্রেড-অফ বিশ্লেষণ**: ইনসার্ট সময় ~৬ মিনিট বাড়ল আর DB সাইজ ~১০% বাড়ল, বিনিময়ে Dashboard-এর প্রতিদিন বহুবার লোড হওয়া কোয়েরি ৬৪০০ গুণ দ্রুত — শপকিপারের বাস্তব অভিজ্ঞতায় (ইনসার্ট ব্যাকগ্রাউন্ডে/এক-বারই হয়, কিন্তু Dashboard বারবার খোলা হয়) এই ট্রেড-অফ স্পষ্টভাবে সঠিক দিকে।

**ঝুঁকি**: শূন্য — শুধু `schema.sql`-এ নতুন `CREATE INDEX IF NOT EXISTS` যোগ হয়েছে, বিদ্যমান কোনো টেবিল/কলাম/ইনডেক্স স্পর্শ করা হয়নি, App.jsx অস্পৃষ্ট।

**যা এখনো বাকি**:
- [ ] Phase 1 (dual-write) শুরু করা — এখন সব Phase 0 ব্লকার সমাধান হয়ে গেছে
- [ ] Migration backfill runner (Phase 2) এখনো লেখা হয়নি

---

### [এন্ট্রি ৪] — ১ কোটি স্কেল ফুল বেঞ্চমার্ক সম্পন্ন + বেঞ্চমার্ক স্ক্রিপ্টের ২টা বাগ ফিক্স

**কেন**: এন্ট্রি ৩-এ পেন্ডিং ছিল "১ কোটি স্কেলের ফুল বেঞ্চমার্ক এখনো বাকি"। চালানোর আগে দেখা গেল এন্ট্রি ৩-এর দাবি ("বেঞ্চমার্ক স্ক্রিপ্টে dateKey ফিক্স আগেই হয়ে গিয়েছিল") **ভুল ছিল** — `scripts/generate-synthetic-dataset.mjs`-এ `date_key`/`today` তখনো `new Date().toISOString().slice(0,10)` (UTC) ব্যবহার করছিল, `DataStore.js`-এর সাথে সিঙ্কড ছিল না।

**কী করা হলো**:
1. `generate-synthetic-dataset.mjs`-এ `src/logic.js`-এর `_bdParts()` import করে একটা `bdDateKey()` হেল্পার যোগ করা হলো, ইনভয়েস ইনসার্টের `date_key` আর "আজকের ইনভয়েস" কোয়েরির `today` — দুটোতেই এখন GMT+6 ব্যবহার হচ্ছে, `DataStore.js`-এর সাথে সিঙ্কড।
2. DB ফাইল সাইজ মাপার জায়গা `db.close()`-এর আগে থেকে সরিয়ে, `PRAGMA wal_checkpoint(TRUNCATE)` কল করে (WAL-এর সব ডেটা মূল `.db` ফাইলে ফ্লাশ করে) তারপর মাপা হচ্ছে — আসল/নির্ভরযোগ্য সাইজ পাওয়া যায় এখন।
3. **নতুন বাগ ধরা পড়ল ও ফিক্স হলো**: সাইজ মাপার ফাংশন `readFileSync(p).length` ব্যবহার করত, যেটা পুরো ফাইল RAM-এ Buffer করে লোড করার চেষ্টা করে — ১ কোটি ইনভয়েস রানে (৩ GB DB ফাইল) এটা silently ব্যর্থ হয়ে catch ব্লকে পড়ে "0.0 MB" রিপোর্ট করেছিল। `statSync(p).size`-এ পাল্টানো হলো (ফাইল কনটেন্ট লোড না করে শুধু ফাইলসিস্টেম মেটাডেটা পড়ে) — যেকোনো সাইজে নির্ভরযোগ্য।

**১ কোটি স্কেল বেঞ্চমার্ক ফলাফল** (১ লাখ প্রোডাক্ট, ১০ হাজার কাস্টমার, ১ কোটি ইনভয়েস):
| মেট্রিক | ফলাফল |
|---|---|
| প্রোডাক্ট ইনসার্ট (১ লাখ) | ৫.৬ সেকেন্ড |
| কাস্টমার ইনসার্ট (১০ হাজার) | ০.৪ সেকেন্ড |
| **ইনভয়েস ইনসার্ট (১ কোটি)** | **~১৫ মিনিট ৪১ সেকেন্ড (৯,৪১,০০০ms)** — আগের এক্সট্রাপোলেশনে ধারণা করা ~৭ মিনিটের প্রায় দ্বিগুণ |
| DB ফাইল সাইজ (checkpoint-এর পরে) | **~২.৯০ GB** |
| প্রোডাক্ট নাম সার্চ (LIKE) | ৭.৪ms |
| প্রোডাক্ট নাম সার্চ (FTS5) | ১৫.৭ms |
| কাস্টমার মোবাইল লুকআপ | ০.৯ms |
| আজকের ইনভয়েস লিস্ট (date_key ইনডেক্স) | ১৪৫.৮ms |
| **Dashboard SUM(total) aggregate** | **⚠️ ৮,৯৮২ms (~৯ সেকেন্ড)** |
| কাস্টমার ইনভয়েস হিস্ট্রি | ০.৮ms |

**⚠️ নতুন উদ্বেগের বিষয় (Phase 1-এর আগে সমাধান করা উচিত)**: Dashboard SUM(total) aggregate কোয়েরি (`SELECT SUM(total), COUNT(*) FROM invoices WHERE date_key = ? AND status = 'active'`) ১ কোটি স্কেলে ~৯ সেকেন্ড লাগছে — শপকিপারের দৈনিক ড্যাশবোর্ডে এটা প্রতিবার লোড হওয়ার কথা, ৯ সেকেন্ড অগ্রহণযোগ্য রকম স্লো। সন্দেহ: `status`-এর উপর আলাদা ইনডেক্স নেই, শুধু `date_key`-এর উপর আছে হয়ত, ফলে পুরো দিনের রো স্ক্যান হয়ে `status` ফিল্টার হচ্ছে row-by-row। **পরবর্তী সেশনে প্রথম কাজ**: `schema.sql`-এর `invoices` টেবিলের ইনডেক্স রিভিউ করা এবং সম্ভবত `(date_key, status)` কম্পোজিট ইনডেক্স যোগ করে আবার বেঞ্চমার্ক করা — অথবা একটা pre-aggregated daily_stats টেবিল/ট্রিগার বিবেচনা করা (Phase 1 প্ল্যানে যেমন উল্লেখ ছিল)।

**যাচাই**: ছোট স্কেলে (৫০০-১০০০ রো) স্ক্রিপ্ট রি-রান করে নিশ্চিত করা হয়েছে দুটো ফিক্সই ঠিকভাবে কাজ করছে (সঠিক MB রিপোর্ট হচ্ছে)।

**ঝুঁকি**: শূন্য — শুধু বেঞ্চমার্ক স্ক্রিপ্ট বদলেছে, App.jsx/DataStore.js কিছুই ছোঁয়া হয়নি।

**যা এখনো বাকি**:
- [ ] Dashboard SUM(total) aggregate-এর ৯-সেকেন্ড স্লোনেস সমাধান (উপরে বিস্তারিত) — এটা Phase 1 শুরুর আগে ফিক্স করা উচিত
- [ ] Phase 1 (dual-write) এখনো শুরু হয়নি
- [ ] Migration backfill runner (Phase 2) এখনো লেখা হয়নি

---

### [এন্ট্রি ৩] — normName + টাইমজোন বাগ ফিক্স (`src/db/DataStore.js`)

**কেন**: এন্ট্রি ২-এ ধরা পড়া দুইটা পেন্ডিং বাগ ফিক্স করা — dual-write (Phase 1) শুরুর আগে বাধ্যতামূলক ছিল।

**কী করা হলো**:
- `dateKeyFromTs()` — আগে `toISOString().slice(0,10)` (UTC) ব্যবহার করত, এখন `src/logic.js`-এর `_bdParts()` (fixed GMT+6) import করে ব্যবহার করছে — App.jsx-এর `_dateKeyOf()`-এর সাথে ১০০% সিঙ্কড। (`scripts/generate-synthetic-dataset.mjs`-এ এই ফিক্সটা কোনো এক আগের সেশনে ইতিমধ্যে হয়ে গিয়েছিল — এই এন্ট্রিতে শুধু `DataStore.js` বাকি ছিল, সেটাই এখন করা হলো, একই প্যাটার্ন অনুসরণ করে।)
- `normName()` — App.jsx-এর আসল ইমপ্লিমেন্টেশন (লাইন ~27194, ~27243) হুবহু কপি করা হলো, আগে যে `.replace(/\s+/g," ")` অংশ মিসিং ছিল সেটা যোগ হলো।

**যাচাই**: একটা standalone স্ক্রিপ্টে `_bdParts`-ভিত্তিক `dateKeyFromTs()`/`normName()`-কে App.jsx-এর রেফারেন্স ইমপ্লিমেন্টেশনের বিপরীতে টেস্ট করা হয়েছে — BD মধ্যরাত (UTC 18:00) ক্রস করা কেসসহ, ডাবল-স্পেস নাম নরমালাইজেশনসহ — সব মিলেছে। এরপর `npm test` (logic ৭২ + integration ১০ + sync ২৪) সব পাস।

**ঝুঁকি**: শূন্য — App.jsx-এর একটা লাইনও ছোঁয়া হয়নি, `DataStore.js` এখনো কোথাও import/কল হচ্ছে না।

**যা এখনো বাকি**: Phase 1 (dual-write) শুরু হয়নি, ১ কোটি স্কেলের ফুল বেঞ্চমার্ক এখনো বাকি।

---

### [এন্ট্রি ২] — Phase 0: schema + DataStore + benchmark (কোড লেখা ও টেস্ট করা হয়েছে)

**অবস্থা**: Phase 0-এর মূল স্কেলেটন তৈরি ও বেঞ্চমার্ক করে দেখা হয়েছে। **এখনো App.jsx-এর একটা লাইনও বদলানো হয়নি** — সব নতুন ফাইল, dual-write এখনো শুরু হয়নি।

**নতুন ফাইল তৈরি হয়েছে**:
- `src/db/schema.sql` — products/customers/invoices টেবিল + ইনডেক্স + FTS5 virtual table + sync trigger + `_migration_state` টেবিল (resumable backfill-এর জন্য)
- `src/db/DataStore.js` — abstraction layer: `getDb()`, `upsert()`, `upsertMany()`, `getById()`, `queryPage()`, `searchFts()`, `aggregate()`, feature-flag হেল্পার `isSqliteEnabled()`/`setSqliteEnabled()`। এখনো কোথাও import হচ্ছে না।
- `scripts/generate-synthetic-dataset.mjs` — সিন্থেটিক ডেটা জেনারেটর + বেঞ্চমার্ক (Node.js বিল্ট-ইন `node:sqlite` দিয়ে, একই schema.sql ব্যবহার করে)
- `package.json`-এ `@capacitor-community/sqlite@^6.0.2` যোগ হয়েছে (আপনার Capacitor 6 সেটআপের সাথে সামঞ্জস্যপূর্ণ ভার্সন)

**বেঞ্চমার্ক রেজাল্ট (১ লাখ প্রোডাক্ট / ১০ হাজার কাস্টমার / ১০ লাখ ইনভয়েস দিয়ে টেস্ট করা হয়েছে — সার্ভার-গ্রেড CPU-তে, তাই "best case" হিসেবে ধরবেন, বাজেট Android ফোনে কিছুটা স্লো হবে)**:

| অপারেশন | সময় |
|---|---|
| ১ লাখ প্রোডাক্ট ইনসার্ট | ~৫.৫ সেকেন্ড |
| ১০ হাজার কাস্টমার ইনসার্ট | ~০.৪ সেকেন্ড |
| ১০ লাখ ইনভয়েস ইনসার্ট | ~৪২.৭ সেকেন্ড |
| DB ফাইল সাইজ (এই ডেটাতে) | ৩৩১ MB |
| প্রোডাক্ট নাম FTS5 সার্চ | ১৩.৮ms |
| কাস্টমার মোবাইল লুকআপ | ০.৩ms |
| আজকের ইনভয়েস লিস্ট (পেজিনেটেড) | ১৪.৭ms |
| নির্দিষ্ট কাস্টমারের ইনভয়েস হিস্ট্রি | ০.৯ms |

**⚠️ গুরুত্বপূর্ণ ফাইন্ডিং (একটা রিয়েল বাগ ধরা পড়েছে টেস্টে)**:
Dashboard SUM(total) aggregate কোয়েরি প্রথমে **২০২ms** নিচ্ছিল — টার্গেটের (৩০০ms) কাছাকাছি হলেও সন্দেহজনক স্লো, কারণ `date_key` ইনডেক্স থাকা সত্ত্বেও SQLite-এর কোয়েরি প্ল্যানার ভুল ইনডেক্স (`idx_invoices_status`, যেটাতে মাত্র ২টা distinct ভ্যালু — কম selective) বেছে নিচ্ছিল, ফলে ~৯৫০k রো স্ক্যান হচ্ছিল। `ANALYZE` কমান্ড রান করার পর (যেটা SQLite-কে কলামের ডেটা-ডিস্ট্রিবিউশন স্ট্যাটিস্টিক্স দেয়) একই কোয়েরি **২.৫ms**-এ নেমে আসে (৮০× দ্রুত) — প্ল্যানার তখন সঠিক `date_key` ইনডেক্স ব্যবহার করে।

**➡️ Action item এখন থেকেই মনে রাখতে হবে (Phase 2 backfill migration কোড লেখার সময় বাধ্যতামূলক)**:
- backfill migration শেষ হওয়ার পর **`ANALYZE` কমান্ড অবশ্যই রান করতে হবে** প্রতিটা business-type DB-তে।
- ভবিষ্যতে ডেটা বড় আকারে বদলালে (বাল্ক ইমপোর্ট, mass edit) periodic `ANALYZE` শিডিউল করা উচিত (যেমন সাপ্তাহিক, backup routine-এর সাথে জুড়ে দেওয়া যায়)।
- এটা schema.sql বা DataStore.js-এ এখনই কোড করে ফেলিনি (Phase 2-এর migration runner-এর অংশ হবে) — কিন্তু ভুলে গেলে dashboard slow হয়ে যাবে, তাই এখানে বড় করে নোট রাখা হলো।

**⚠️ ইউজার-রিভিউ থেকে নতুন পাওয়া দুইটা ইস্যু (Phase 1 শুরুর আগে ফিক্স করা আবশ্যক)**:

1. **টাইমজোন বাগ (গুরুত্বপূর্ণ, ব্যবসায়িক ইমপ্যাক্ট আছে)**: `DataStore.js`-এর `dateKeyFromTs()` এবং বেঞ্চমার্ক স্ক্রিপ্টের `today` — দুটোই `new Date().toISOString().slice(0,10)` ব্যবহার করছে, যেটা **UTC তারিখ** দেয়, বাংলাদেশ লোকাল (UTC+6) না। ফলে বাংলাদেশ সময় রাত ১২টা থেকে ভোর ৬টা পর্যন্ত `date_key` এখনো **আগের দিনের** তারিখ দেখাবে — Dashboard-এর "আজকের বিক্রি" এই সময়ে ভুল হিসাব দেখাবে। **Fix**: App.jsx-এ বর্তমানে "আজকের তারিখ" বের করার জন্য যে ফাংশন ব্যবহৃত হয় (যেমন `todayEn()` বা সমতুল্য) সেটা খুঁজে বের করে `dateKeyFromTs()`/`today` কে সেটার সাথে সামঞ্জস্যপূর্ণ করতে হবে — নাহলে dual-write ফেজে পুরনো আর নতুন সিস্টেমে "আজ"-এর সংজ্ঞা আলাদা হয়ে যাবে।
2. **বেঞ্চমার্ক DB ফাইল সাইজ মেজারমেন্ট ইস্যু (ছোট, ইনফরমেশনাল)**: `generate-synthetic-dataset.mjs`-এ DB ফাইল সাইজ (৩৩১ MB) মাপা হয়েছে `db.close()`-এর **আগে**, আর schema-তে WAL mode অন — তাই মাপার সময় অনেক ডেটা `.db-wal` ফাইলে থাকতে পারে, মূল `.db` ফাইলে না। আসল storage সাইজ পেতে হলে `db.close()` (checkpoint হয়) এর **পরে** ফাইল সাইজ মাপতে হবে, বা `PRAGMA wal_checkpoint(TRUNCATE)` কল করে তারপর মাপতে হবে।

**যা এখনো বাকি**:
- [ ] `DataStore.js`-এর `normName()` placeholder-টা App.jsx-এর আসল `normName()` ফাংশন দিয়ে replace করা (এই মুহূর্তে দুটো ভিন্ন হলে সার্চ রেজাল্ট না মেলার ঝুঁকি আছে)
- [ ] উপরের টাইমজোন বাগ ফিক্স করা — App.jsx-এর আসল "আজকের তারিখ" লজিকের সাথে মিলিয়ে
- [ ] ১ কোটি (পুরো টার্গেট স্কেল) ইনভয়েসে বেঞ্চমার্ক এখনো চালানো হয়নি (১০ লাখ পর্যন্তই করা হয়েছে, সময়ের কারণে) — এক্সট্রাপোলেশনে ~৭ মিনিট ইনসার্ট টাইম হওয়ার কথা, কিন্তু আসলে চালিয়ে নিশ্চিত হওয়া উচিত (এবার DB ফাইল সাইজ `close()`-এর পরে মাপতে হবে)
- [ ] Phase 1 (dual-write) এখনো শুরু হয়নি — App.jsx-এর `setInvoices`/`setProducts`/`setCustomers`-এর পাশে `DataStore.upsert()` কল যোগ করা বাকি
- [ ] Migration backfill runner (Phase 2) এখনো লেখা হয়নি

---

### [এন্ট্রি ১] — Phase 0 প্রস্তুতি

**অবস্থা**: এইমাত্র শুরু হয়েছে, এখনো কোনো কোড লেখা হয়নি।

**যা নিশ্চিত হয়েছে (প্রজেক্ট রিভিউ থেকে)**:
- `android/` ফোল্ডার রিপোতে নেই — CI (`build-apk.yml`)-এ `npx cap add android` দিয়ে জেনারেট হয়। মানে নতুন নেটিভ প্লাগিন যোগ করা মূলত `package.json` + `capacitor.config.json` লেভেলে হবে।
- বিদ্যমান কাস্টম নেটিভ প্লাগিনের প্যাটার্ন: `capacitor-backup-service/` (local file dependency, `window.Capacitor.Plugins.X` দিয়ে সরাসরি কল, কোনো JS wrapper ছাড়াই) — SQLite প্লাগিন যোগ করার সময় এই একই প্যাটার্ন অনুসরণযোগ্য, কিন্তু `@capacitor-community/sqlite` একটা রেডিমেড পাবলিশড প্যাকেজ, তাই এটা `npm install` দিয়েই আসবে, কাস্টম বানানোর দরকার নেই।
- `package.json`-এ এখনো `@capacitor-community/sqlite` নেই।
- মূল ডেটা ফাইল: `src/App.jsx` (৩৯,৫৬২ লাইন), `src/logic.js`, `src/sync.js`, `src/schemas.js`, `src/worker.js`।
- সিদ্ধান্ত হয়ে গেছে (আগের চ্যাটে): (১) প্রতি বিজনেস-টাইপের জন্য আলাদা SQLite DB ফাইল, (২) FTS5 সার্চ, (৩) Firebase সম্পূর্ণ ডিলিট — pure offline।

**পরবর্তী স্টেপ (এই সেশনে বা পরের সেশনে যা করতে হবে)**:
- [ ] `package.json`-এ `@capacitor-community/sqlite` ডিপেন্ডেন্সি যোগ
- [ ] `src/db/DataStore.js` — abstraction layer স্কেলিটন (get/query/upsert/delete), feature-flag সহ
- [ ] `src/db/schema.sql` — products/customers/invoices টেবিল + ইনডেক্স + FTS5 virtual table + sync trigger
- [ ] Synthetic dataset generator স্ক্রিপ্ট (`scripts/generate-synthetic-dataset.mjs`) — ১ লাখ প্রোডাক্ট/১০ হাজার কাস্টমার/১ কোটি ইনভয়েস টেস্ট ডেটা
- [ ] এখনো App.jsx-এর কোনো লাইন এডিট করা হয়নি — dual-write ওয়্যারিং এখনো শুরু হয়নি

**সতর্কতা এই মুহূর্তে কিছু নেই** (কাজ এখনো শুরু হয়নি বলে)।

---

*(পরবর্তী সেশন শেষে এখানে নতুন এন্ট্রি যোগ হবে — সবার উপরে)*
