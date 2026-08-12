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

## এন্ট্রি লগ

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
