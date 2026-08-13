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

---

## 🎯 মাস্টার স্ট্যাটাস (এন্ট্রি ২৪-এ আপডেট — নতুন সেশনে প্রথমে এই সেকশনটাই পড়ুন)

**টার্গেট স্কেল**: ১,০০,০০০ প্রোডাক্ট · ১০,০০০ কাস্টমার · ১,০০,০০,০০০ (১ কোটি) ইনভয়েস — বর্তমান টেস্ট শপের ডেটা (২২৩৬/১৭/৬৩০) এই লক্ষ্যের তুলনায় প্রায় নগণ্য, তাই "এখন সমস্যা হচ্ছে না" কোনো নির্ভরযোগ্য সংকেত না।

### ✅ সম্পূর্ণ ও real-device ভেরিফায়েড
Schema+FTS5 · dual-write (shadow) · resumable batch backfill · row-count verify টুল · ANALYZE (auto+manual) · BD timezone ফিক্স · normName() সিঙ্ক · হাইব্রিড সার্চ (৪ কল-সাইট) · getState() write-through Map (৭ কল-সাইট) · processReturn() রিটার্ন ফ্লো।

### ✅ এই সেশনে (এন্ট্রি ২৪) কোড-সম্পূর্ণ, sandbox-ভেরিফায়েড — real-device টেস্ট বাকি
1. **Boot-time full invoice backfill সরানো হয়েছে** — App.jsx-এর boot sequence এখন কখনো পুরো invoice history state-এ আনে না, স্থায়ীভাবে ৬-মাস windowed থাকে (archiveOldInvoices()-এর কাটঅফের সাথে সিঙ্কড)।
2. **`queryPage()` এখন keyset pagination** — `id` tiebreaker + নতুন কম্পোজিট ইনডেক্স। sandbox-এ সঠিকতা (কোনো skip/duplicate নেই) ও ১ কোটি স্কেলে গতি (~৩× দ্রুত গভীর পেজে) দুটোই যাচাই হয়েছে।
3. **১ কোটি স্কেল বেঞ্চমার্ক** — একবার সম্পূর্ণ চলেছে (ফলাফল নিচে এন্ট্রি ২৪-এ), কিন্তু DB ফাইল-সাইজ মাপার বাগ (আগেও একবার ধরা পড়েছিল, entry ৪) আসলে zip-এ রয়ে গিয়েছিল বলে "0.0 MB" দেখাচ্ছিল — সেটা এই সেশনেই আবার ফিক্স হয়েছে, কিন্তু ফিক্সের পর রি-রান **সম্পূর্ণ হয়নি** (ইউজার সেশন থামিয়েছেন, ~৩ মিনিট ৪১ সেকেন্ড ইনভয়েস-ইনসার্টের মধ্যে ছিল)। **পরের সেশনের প্রথম কাজ**: শুধু রি-রান করে সঠিক DB ফাইল-সাইজ কনফার্ম করা (অন্য কোনো নাম্বার বদলানোর কথা না, শুধু সাইজ রিপোর্টিং ফিক্স)।

### 🔴 ব্লকার — বাকি
- (Boot backfill ও queryPage() সমাধান হয়ে গেছে উপরে — কোনো নতুন কোড-লেভেল ব্লকার এই মুহূর্তে চিহ্নিত নেই)
- **Real-device যাচাই এখনো বাকি** — dev flag চালু করে real device-এ boot টাইম/মেমরি ব্যবহার (৬-মাস windowed invoices দিয়ে) আর keyset pagination উভয়ই sandbox-এর বাইরে কখনো টেস্ট হয়নি।
- DB ফাইল-সাইজ রিপোর্টিং বাগ-ফিক্সড বেঞ্চমার্ক রি-রান (উপরে #৩ দ্রষ্টব্য)।

### 🟡 দরকারি, ব্লকার না
4. Read-path cutover — স্কোপড প্রস্তাব: শুধু pagination/historical browsing SQLite থেকে read করবে, POS/dashboard হিসাব-নিকাশ এখনো IndexedDB-ভিত্তিক লজিকেই থাকবে (কম ঝুঁকি)। এখনো ডিজাইন হয়নি। **নোট**: queryPage() এখন keyset-এ প্রস্তুত থাকলেও App.jsx-এর কোনো real UI কল-সাইট এখনো এটা কল করে না (এখনো শুধু DataStore.js-এর ভেতরের ফাংশন, wire করা হয়নি) — এই কাটওভার-ই সেই wiring-এর কাজ।
5. ১৬টা Virtuoso লিস্টের মধ্যে invoices ও products-কে async pagination দিতে হবে (stale-response/sequence-token guard সহ)। customers (টার্গেট ১০ হাজার) মেমোরিতেই থাকতে পারে, pagination লাগবে না।
6. Scientist-স্টাইল shadow-compare (Phase ৭) — এখনো ডিজাইন হয়নি, শুধু নাম উল্লেখ ছিল।
7. `FTS_NARROW_THRESHOLD = 5000` (App.jsx লাইন ৫২) — ১ লাখ প্রোডাক্ট টার্গেটে এই থ্রেশহোল্ড এখনো ঠিক আছে কিনা রিভিজিট করা দরকার।

### 🟢 কম জরুরি
8. customers/invoices resumable migration আলাদাভাবে টেস্ট (ঐচ্ছিক, একই কোড-পাথ ব্যবহার করে)
9. একাধিক শপে টেস্ট (এখনো শুধু ১টা টেস্ট শপ)
10. `capacitor-google-auth` RC ভার্সন (এন্ট্রি ২০) real-device কনফার্ম

### প্রস্তাবিত অর্ডার
🔴-এর তিনটা আগে (একে অপরের উপর নির্ভরশীল — pagination ঠিক না করে boot backfill ফিক্স করলেও লিস্ট UI-তে একই সমস্যা থেকে যাবে) → তারপর ৪-৫-৬-৭ একটা করে আলাদা সেশনে।

---

## এন্ট্রি লগ

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
