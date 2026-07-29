# ⚠️ এই ফাইলটি প্রতিটা Claude সেশনের শুরুতে বাধ্যতামূলক পড়তে হবে

এই অ্যাপ (SBM) বর্তমানে **৩ জন সক্রিয় দোকানদারের আসল ব্যবসায়** চলছে। কোনো
আপডেট/আপগ্রেড/রিফ্যাক্টর যদি নিচের ৮টা এলাকার কোনোটায় নিঃশব্দে বাগ ঢুকিয়ে
দেয়, তার ফলাফল হবে: দোকানদারের **টাকা/স্টক ভুল হিসাব**, ডেটা হারানো, বা
মাল্টি-ডিভাইস কনফ্লিক্টে ডুপ্লিকেট/হারানো লেনদেন — যেটা প্রোডাকশনে ধরা পড়ার
আগেই ক্ষতি করে ফেলবে। তাই এই ৮টা এলাকা **সবসময় হাই-প্রায়োরিটি**:

1. অফলাইন–অনলাইন সিঙ্ক
2. মাল্টি-ডিভাইস সিঙ্ক
3. ব্যাকআপ
4. রিস্টোর
5. সব হিসাব (profit, cash drawer, supplier due, KPI)
6. পণ্য (stock, batch/FEFO)
7. কাস্টমার
8. ইনভয়েস + ইনভয়েস বাতিল (void)

---

## টপ প্রায়োরিটি ১ — আউটপুট ফরম্যাট (প্রতি সেশনে বাধ্যতামূলক)

ব্যবহারকারী প্রতি সেশনে পুরো প্রজেক্ট (zip) আপলোড করেন এবং মোবাইল থেকে কাজ
করেন — PC নেই। তাই কাজ শেষে কখনো পুরো প্রজেক্ট zip করে দেওয়া যাবে না।

- শুধু এই সেশনে যে ফাইলগুলো নতুন তৈরি হয়েছে বা পরিবর্তিত হয়েছে, শুধু
  সেগুলোই একটা zip-এ দিতে হবে।
- zip-এর ভেতরে ফাইলগুলো ঠিক সেই ডিরেক্টরি-স্ট্রাকচারে থাকতে হবে যেখানে
  GitHub রিপোতে গিয়ে বসবে (যেমন src/App.jsx, src/logic.js,
  scripts/check-rules-sync.mjs, firestore.rules — রুট থেকে সঠিক পাথ)।
  ভেতরের পাথ ধরে ব্যবহারকারী সরাসরি GitHub-এ প্রতিটা ফাইল ওভাররাইট করে বসিয়ে
  দিতে পারবেন, যেন কোনটা কোথায় বসবে তা নিয়ে জিজ্ঞেস করা বা আলাদাভাবে বলে
  দেওয়া না লাগে।
- নতুন ফাইল হলেও একই নিয়ম — ঠিক যে পাথে তৈরি হওয়া উচিত সেই পাথ বজায় রাখতে হবে।
- অপরিবর্তিত ফাইল zip-এ দেওয়া যাবে না (অকারণে বড় zip, কনফিউশন তৈরি করে)।
- ডেলিভারির সময় কোন কোন ফাইল বদলেছে তার একটা সংক্ষিপ্ত তালিকা (পাথসহ) সবসময়
  সাথে দিতে হবে, যাতে ব্যবহারকারী GitHub-এ বসানোর আগে দেখে নিতে পারেন।

## টপ প্রায়োরিটি ২ — সেশন হিস্টোরি লগ (প্রতি সেশনে বাধ্যতামূলক)

প্রতিটা Claude সেশনে যে কাজ করা হয়েছে তার ইতিহাস এই ফাইলের একদম নিচে
"সেশন হিস্টোরি" সেকশনে নতুন এন্ট্রি হিসেবে যোগ করতে হবে (আগের এন্ট্রিগুলো
মুছে ফেলা বা ওভাররাইট করা যাবে না — শুধু নতুন এন্ট্রি যোগ হবে, তারিখ-সময়
সহ, সবচেয়ে নতুনটা সবার উপরে)। প্রতিটা এন্ট্রিতে বাধ্যতামূলকভাবে থাকতে হবে:

1. কেন এই কাজ করা হলো — মূল সমস্যা/অনুরোধ কী ছিল
2. কী কী করা হলো — ফাইলভিত্তিক তালিকা (কোন ফাইলে কী বদলেছে)
3. এর ফলে কী কী পরিবর্তন হলো — আচরণগত/লজিক্যাল প্রভাব, কোন প্রায়োরিটি-এলাকা
   (উপরের ৮টার মধ্যে) ছোঁয়া হয়েছে
4. ভবিষ্যতে এখানে কাজ করলে কী মাথায় রাখতে হবে — কোনো ফাঁদ, নির্ভরতা, বা
   অসম্পূর্ণ অংশ যা পরের সেশনের Claude-কে জানা দরকার
5. কনসিকুয়েন্স — এই পরিবর্তন ভুল হলে বাস্তবে কী ক্ষতি হতে পারে (টাকা/স্টক
   ভুল হিসাব, ডেটা লস, ডিভাইস কনফ্লিক্ট ইত্যাদি), এবং কী যাচাই করে নিশ্চিত
   হওয়া হয়েছে বনাম কী শুধু কোড-রিভিউ করে অনুমান করা হয়েছে

এই লগ BUGFIX_LOG.md-এর প্রতিস্থাপন না — BUGFIX_LOG.md বাগ-নির্দিষ্ট
(symptom/root cause/blast radius), আর এই সেকশনটা সেশন-নির্দিষ্ট বর্ণনা
(পুরো সেশনে কী হলো, কেন হলো)। দুটোই বজায় রাখতে হবে।

---

## কোনো কোড পরিবর্তনের আগে (Pre-flight)

1. পরিবর্তনটা কোন ফাইল ছোঁবে দেখুন এবং সেটা কোন প্রায়োরিটি-এলাকা(গুলো) ছোঁয়:

   | ফাইল | এলাকা |
   |---|---|
   | `src/logic.js` | হিসাব, পণ্য/ব্যাচ, ইনভয়েস/ভয়েড |
   | `src/sync.js` | অফলাইন-অনলাইন সিঙ্ক, মাল্টি-ডিভাইস সিঙ্ক, ব্যাকআপ ডিফ |
   | `src/schemas.js` | সব write-এর শেপ ভ্যালিডেশন (choke-point) |
   | `firestore.rules` / `database.rules.json` | সব কালেকশনের read/write শর্ত |
   | `src/App.jsx` | উপরের সবগুলোর UI + state-bound কল (`createInvoice`,
     `voidInvoice`, `FSS.setRecord`, `SyncOutbox`, `RestoreSelfTest`,
     `RetentionDB`, `WormArchive`, `useFSSCollection`) |

2. `src/App.jsx`-এ কোনো state-bound ফাংশন (createInvoice/voidInvoice/
   buildDailySummaryData ইত্যাদি) বদলালে **আগে চেক করুন সেটা `logic.js`-এর
   কোনো shared ফাংশন কল করছে কিনা** (`calcInvoiceTotal`, `calcVoidNetChange`,
   `calcCashDrawer`, `restoreBatchQty` ইত্যাদি) — থাকলে সেই shared ফাংশনটাই
   বদলান, ডুপ্লিকেট ফর্মুলা লিখবেন না (এটা আগে একবার বাগের কারণ হয়েছিল, দেখুন
   `BUGFIX_LOG.md`)।
3. বড়/ঝুঁকিপূর্ণ পরিবর্তন (Auth, rules, schema hard-reject মোড, merge/conflict
   লজিক) একবারে-সব-শপে না চালিয়ে **Monitor/soft mode আগে, Enforce পরে** —
   এই প্যাটার্ন অনুসরণ করুন (App Check ও schema validation এই প্যাটার্নেই আছে)।

## কোনো কোড পরিবর্তনের পরে (Post-flight — বাধ্যতামূলক, স্কিপ করবেন না)

1. `npm test` চালান (logic + schema + integration + sync + rules-sync)।
   **সব পাস না হলে পরিবর্তনটা সম্পূর্ণ ধরা যাবে না।**
2. যদি `firestore.rules` / `database.rules.json` / admin.html-এর embedded
   rules কোনোটা ছোঁয়া হয় → `npm run test:rules-sync` এবং সম্ভব হলে
   `npm run test:rules` (emulator লাগে; এই sandbox-এ network না থাকলে অন্তত
   `node --check` দিয়ে syntax যাচাই করে CI-তে emulator জব-এর উপর নির্ভর করুন)।
3. `src/logic.js` ছোঁয়া হলে → `npm run test:fuzz` চালিয়ে অন্তত একবার চোখে
   দেখুন (এখনো CI-ব্লকিং না, কিন্তু ম্যানুয়ালি স্কিপ করবেন না)।
4. পরিবর্তনটা 8-প্রায়োরিটি-এলাকার কোনোটা ছুঁয়েছে কিন্তু existing টেস্টে কভার
   হয়নি এমন কোনো edge case থাকলে (নতুন branch, নতুন conflict scenario,
   নতুন schema field) → নতুন টেস্ট কেস যোগ না করে "কাজ শেষ" বলবেন না।
5. `BUGFIX_LOG.md`-এ এন্ট্রি যোগ করুন (বিদ্যমান ফরম্যাট অনুসরণ করে): উপসর্গ,
   মূল কারণ, ফিক্স কোথায়, **ব্লাস্ট রেডিয়াস** (এই পরিবর্তন উপরের ৮টার মধ্যে
   কোনটাকে ছুঁয়েছে/কতদূর ছড়াতে পারত), রিগ্রেশন টেস্ট যোগ হয়েছে কিনা, এবং —
   সবচেয়ে গুরুত্বপূর্ণ — **এই sandbox-এ আসলে যা চালিয়ে যাচাই করা হয়েছে বনাম
   যা শুধু কোড-রিভিউ করে ধরে নেওয়া হয়েছে**, স্পষ্টভাবে আলাদা করে লিখুন। কখনো
   "চালিয়ে দেখা হয়েছে" বলে দাবি করবেন না যদি আসলে শুধু পড়ে/অনুমান করে বলা হয়।
6. যদি কোনো কারণে ২-৫ নম্বর স্কিপ করতে হয় (যেমন: network sandbox-এ emulator
   চালানো যায়নি) → সেটা স্পষ্টভাবে ব্যবহারকারীকে বলুন এবং কী এখনো
   ম্যানুয়ালি/CI-তে যাচাই করা বাকি, তার একটা তালিকা দিন। নীরবে "সব ঠিক আছে"
   বলবেন না।

## রেড লাইন — এগুলো কখনো "শুধু একটু" করবেন না

- Firestore rules-কে টেস্ট/emulator ছাড়া looser করা (schema validation বাদ
  দেওয়া বা `if true` বাড়ানো)।
- `FSS.setRecord()`-এর schema-validation hook বাইপাস করে সরাসরি write করা এমন
  কোনো নতুন কোড-পাথ যোগ করা।
- সিঙ্ক/মার্জ লজিক (`mergeCollection`, `mergeAllCollections`,
  `effectiveTs`) বদলানো emulator/integration টেস্ট ছাড়া — conflict-resolution
  ভুল হলে সব দোকানের ডেটা একসাথে করাপ্ট হতে পারে।
- ব্যাকআপ/রিস্টোরের ফরম্যাট বদলানো পুরনো ব্যাকআপ ফাইল দিয়ে backward-compat
  টেস্ট না করে (পুরনো ব্যাকআপ থেকে রিস্টোর করতে না পারা মানে দোকানদারের কাছে
  ডেটা-লস)।
- `npm test` fail করা অবস্থায় কমিট/রিলিজ করা (`prepare` স্ক্রিপ্ট দিয়ে husky
  pre-commit এমনিতেই আটকাবে, কিন্তু ইচ্ছাকৃতভাবে `--no-verify` দিয়ে বাইপাস
  করবেন না)।

## বর্তমানে যা এখনো "সফট"/অসম্পূর্ণ (জানা গ্যাপ, নতুন বাগ না)

এগুলো নতুন করে "আবিষ্কার" করার দরকার নেই — এগুলোর প্রেক্ষাপট
`PHASE0_NOTES.md`/`ENTERPRISE_ROADMAP.md`/`BUGFIX_LOG.md`-এ আছে:

- Schema validation soft mode-এ আছে (write ব্লক করে না, শুধু লগ করে)।
- Firebase Authentication নেই — role client-side; rules-এ canary টেস্ট এই
  গ্যাপ ট্র্যাক করছে ইচ্ছাকৃতভাবে।
- Fuzz/mutation টেস্ট এখনো CI-ব্লকিং না।

কোনো নতুন কাজ শুরু করার আগে এই তিনটা ফাইল স্ক্যান করে দেখে নিন সেই এলাকায়
ইতিমধ্যে কোনো ডকুমেন্টেড সিদ্ধান্ত/কারণ আছে কিনা — থাকলে সেটাকে সম্মান করুন
বা স্পষ্টভাবে জানিয়ে বদলান, নীরবে ওভাররাইট করবেন না।

---

## সেশন হিস্টোরি

নতুন এন্ট্রি সবসময় এই সেকশনের সবার উপরে যোগ করুন (সবচেয়ে নতুনটা প্রথমে)।
পুরনো এন্ট্রি কখনো মুছবেন না বা এডিট করবেন না।

### ৩০ জুলাই ২০২৬ — Session C: Firebase build/test infra ক্লিনআপ (package.json, CI workflow, dead emulator টেস্ট)

**কেন:** নিচের Session B এন্ট্রির প্ল্যান অনুযায়ী পরের ধাপ ছিল
package.json/firebase.json/firestore.rules/firestore.indexes.json/
database.rules.json/google-services.json ক্লিনআপ। কাজ শুরুর আগে যাচাই করে
দেখা গেল প্ল্যানটা যতটা সহজ মনে হয়েছিল ততটা না — নিচে বিস্তারিত।

**যা যাচাই করে পাওয়া গেছে (কোড না বদলে আগে):**
- `firestore.rules`/`firestore.indexes.json`/`database.rules.json` শুধু
  emulator টেস্টের জন্যই না — `netlify-site/admin.html`-এর ভেতরেও এদের
  embedded কপি (`FB_DEFAULT_RULES` ইত্যাদি) আছে, যেটা দোকানদারদের নিজস্ব
  Firebase প্রজেক্টে deploy করার জন্য (`scripts/check-rules-sync.mjs` এই দুই
  কপির drift ধরত, `npm test`-এর অংশ ছিল)।
- `.github/workflows/build-apk.yml`-এর আসল `build` জব (যেটা শপগুলোতে যাওয়া
  APK বানায়) `needs: [firestore-rules, release-canary]` — এই দুইটা emulator-
  ভিত্তিক জব আগে সরিয়ে না দিলে শুধু rules ফাইল মুছলেই CI-তে `build` জব আর
  কখনো ট্রিগার হতো না।
- `google-services.json` **সম্পূর্ণ আলাদা উদ্বেগ** — এটা App.jsx-এর
  JS-সাইড Firebase-এর জন্য না, বরং native Android build-এ FCM push
  notification (`firebase-messaging` Gradle dependency, `google-services`
  প্লাগিন) সেট করতে ব্যবহৃত হয় (`build-apk.yml`-এর "Add google-services.json"
  ও "Add Firebase dependencies to build.gradle" স্টেপ)। ব্যবহারকারী নিশ্চিত
  করেছেন push notification ফিচার থাকবে — তাই এই ফাইল **স্পর্শ করা হয়নি**।
- ব্যবহারকারী নিশ্চিত করেছেন admin.html-এর দোকান-ডিপ্লয়মেন্ট ফাংশনালিটি আর
  দরকার নেই, এবং build-apk.yml-এর emulator-গেটেড জব দুটো সরাসরি সরিয়ে ফেলতে
  বলেছেন (admin.html ফাইল নিজে অস্পৃশ্য রাখা হয়েছে — Session D-র স্কোপ)।

**এই সেশনে যা করা হলো:**
1. **ডিলিট করা ফাইল:** `firebase.json`, `firestore.rules`,
   `firestore.indexes.json`, `database.rules.json`, `scripts/check-rules-sync.mjs`
   (ও খালি হয়ে যাওয়া `scripts/` ফোল্ডার), এবং emulator-নির্ভর dead টেস্ট
   ফাইল ৪টা: `tests/canary-tests.mjs`, `tests/rules-tests.mjs`,
   `tests/sync-emulator-tests.mjs`, `tests/release-canary.mjs`।
2. **`.github/workflows/build-apk.yml`:** `firestore-rules` ও
   `release-canary` জব দুটো সম্পূর্ণ সরানো হয়েছে; `build` জবের `needs`
   ফিল্ড মুছে ফেলা হয়েছে (আর কোনো জবের উপর নির্ভরশীল না, সরাসরি চলে)।
   `google-services.json`/Firebase Gradle স্টেপ **অপরিবর্তিত**।
3. **`package.json`:** মূল `test` স্ক্রিপ্ট থেকে
   `node scripts/check-rules-sync.mjs` অংশ সরানো হয়েছে; `test:rules-sync`,
   `test:rules`, `test:sync-emulator`, `test:canary`, `emulators` স্ক্রিপ্ট
   ডিলিট। `dependencies`-এ থাকা `firebase` (JS SDK — App.jsx-এ আর কোনো
   import নেই, bundle-এও ০) এবং `devDependencies`-এ থাকা `firebase-tools`,
   `@firebase/rules-unit-testing` (শুধু এখন-ডিলিটেড emulator টেস্টের জন্য
   ছিল) সরানো হয়েছে। `npm install` পুনরায় চালিয়ে `package-lock.json` রিজেনারেট
   করা হয়েছে — 1081 → 466 প্যাকেজ (firebase/firebase-tools বিশাল dependency
   ট্রি টেনে আনত)।

**এই সেশনে যাচাই করা হয়েছে (সবগুলো বাস্তবে রান করে):**
- `rm -rf node_modules package-lock.json && npm install --legacy-peer-deps` —
  ✅ সফল, ৪৬৬ প্যাকেজ।
- `npm test` — ✅ সব পাস (logic ৬৮, schema ১৪, integration ১০, sync ২৪) —
  rules-sync চেক আর নেই কারণ সংশ্লিষ্ট ফাইল ডিলিট হয়ে গেছে।
- `npm run lint` — ০টা এরর, ৫৩০টা warning (Session B-এর সমান, নতুন কিছু
  ভাঙেনি)।
- `npm run typecheck` — ✅ ০টা এরর।
- `VITE_OFFLINE_MODE=true npm run build` — ✅ সফল, bundle সাইজ অপরিবর্তিত
  (firebase আগে থেকেই bundle-এ ছিল না, শুধু package.json থেকে ঘোষণা সরলো)।
- `.github/workflows/build-apk.yml` Python `yaml.safe_load()` দিয়ে পার্স
  করে নিশ্চিত করা হয়েছে — এখন শুধু `build` জব আছে, কোনো `needs` নেই।

**পরিবর্তনের ফল:** পরিবর্তিত ফাইল — `package.json`, `package-lock.json`,
`.github/workflows/build-apk.yml`, এই CLAUDE.md। ডিলিট করা ফাইল উপরে
তালিকাভুক্ত ৯টা। App.jsx/logic.js/sync.js কিছুই ছোঁয়া হয়নি — কোনো
accounting/stock/invoice/sync লজিক প্রভাবিত হয়নি। CI-তে এখন থেকে প্রতিটা
push-এ সরাসরি `build` জব চলবে, কোনো emulator-গেট ছাড়াই — build দ্রুত হবে,
কিন্তু rules/canary যাচাইয়ের সেফটি-নেট (যেটা মূলত admin.html-এর deploy
ফ্লো-র জন্য ছিল) আর নেই। `netlify-site/vendor/firebasejs/` ও `admin.html`
নিজে **অস্পৃশ্য** — Session D-তে হবে।

**কনসিকুয়েন্স:** GitHub-এ zip আপলোডের পর **ডিলিট করা ৯টা ফাইল ম্যানুয়ালি
রিপো থেকে মুছে দিতে হবে** (zip শুধু বদলানো/নতুন ফাইল দেয়, GitHub স্বয়ংক্রিয়ভাবে
অনুপস্থিত ফাইল ডিলিট করে না) — নাহলে পুরনো `firebase.json`/`firestore.rules`
ইত্যাদি রিপোতে থেকে যাবে (নিরীহ কিন্তু বিভ্রান্তিকর ও `check-rules-sync.mjs`
আর নেই বলে আর কেউ drift ধরবে না)। GitHub Actions-এ পরের push-এ workflow
আসলেই শুধু `build` জব চালায় ও সফল হয় কিনা — এটা sandbox-এ শুধু YAML পার্স
করে জব-গ্রাফ যাচাই করা হয়েছে, real GitHub Actions রান-ই প্রথম আসল টেস্ট।
এরপরের ধাপ: Session D (`netlify-site/admin.html`, এখনো সম্পূর্ণ অস্পৃশ্য)।

---

### ৩০ জুলাই ২০২৬ — Session B (সম্পূর্ণ): বাকি `OFFLINE_MODE` কন্ডিশনাল ও কনস্ট্যান্ট সরানো শেষ (src/App.jsx)

**কেন:** নিচের এন্ট্রিতে (২৯ জুলাই, Session B আংশিক) যেখানে থেমেছিল ঠিক সেখান
থেকে চালিয়ে যাওয়া — বাকি ছিল SMS Template/Logs ব্লক, দুইটা `if (OFFLINE_MODE)`
ফাংশন (owner PIN change), শেষ role-check ব্লক (ডেটা রিকভারি কার্ড), এবং
সবশেষে `OFFLINE_MODE` কনস্ট্যান্টের ঘোষণা নিজেই।

**এই সেশনে যা করা হলো (App.jsx-এ):**
1. SMS Template কার্ড (Due/Payment টেমপ্লেট এডিটর), তার পাশের "১ ক্লিকে বাকি
   রিমাইন্ডার SMS" বাটন ব্লক, এবং SMS Logs কার্ড — তিনটাই `{!OFFLINE_MODE &&
   (...)}` গার্ডে dead ছিল, সম্পূর্ণ মুছে ফেলা হয়েছে।
2. মালিকের PIN পরিবর্তন ফ্লো-র দুইটা জায়গায় (step 1: পুরনো PIN যাচাই, step 3:
   নতুন PIN সেভ) `if (OFFLINE_MODE) { ... return; }` গার্ড সরিয়ে ভেতরের
   লোকাল-হ্যাশ কোডকেই একমাত্র পথ করা হয়েছে (non-OFFLINE_MODE Firebase শাখা
   আগেই Session A-তে সরানো হয়েছিল, তাই শুধু গার্ড তোলা বাকি ছিল)।
3. "ডেটা রিকভারি (Phone + PIN)" কার্ড (`currentUser?.role !== "staff" &&
   !OFFLINE_MODE && (...)`) — dead, সম্পূর্ণ মুছে ফেলা হয়েছে (ভেতরের
   `RecoverySetupCard` কম্পোনেন্ট নিজে ডিলিট করা হয়নি, শুধু কল-সাইট — lint
   এখন এটাকে unused দেখাবে, প্রত্যাশিত)।
4. সবশেষে `OFFLINE_MODE` কনস্ট্যান্টের ঘোষণা (লাইন ৬১) ও তার উপরের বড়
   টপ-অফ-ফাইল কমেন্ট ব্লক ("অফলাইন-বিল্ড ফ্ল্যাগ") ডিলিট করে একটা সংক্ষিপ্ত
   ঐতিহাসিক নোট দিয়ে প্রতিস্থাপন করা হয়েছে।

সব এডিটের পরে `npx esbuild src/App.jsx --outfile=/dev/null` দিয়ে সিনট্যাক্স
চেক করা হয়েছে (প্রতিবারই পাস)।

**এই সেশনে যাচাই করা হয়েছে (সবগুলো বাস্তবে রান করে):**
- `grep -n "if (OFFLINE_MODE)\|!OFFLINE_MODE" src/App.jsx` — ০টা মিল (শুধু
  কমেন্টে ঐতিহাসিক রেফারেন্স আছে, কোনো লজিক নেই)।
- `npm test` — সব পাস (logic ৬৮, schema ১৪, integration ১০, sync ২৪,
  rules-sync ✅)।
- `npm run lint` — **০টা এরর**, ৫৩০টা warning (আগের ৫২২ থেকে সামান্য বেড়েছে —
  dead ব্লক/হ্যান্ডলার সরানোয় কিছু state/component এখন unused; `no-undef`
  ০টা, অর্থাৎ কোনো orphaned রেফারেন্স নেই)।
- `VITE_OFFLINE_MODE=true npm run build` — ✅ সফল। বিল্ড আউটপুটে গ্রেপ করে
  নিশ্চিত করা হয়েছে bundle-এ `firebase/app|firestore|auth` কোড ০টা রেফারেন্স,
  এবং `OFFLINE_MODE` স্ট্রিং নিজেও bundle-এ ০ বার।

**পরিবর্তনের ফল:** পরিবর্তিত ফাইল — শুধু `src/App.jsx`। Session A/B-এর মূল
যুক্তি একই থাকে: production-এ (৩ দোকানেই) `OFFLINE_MODE` সবসময় `true` ছিল,
তাই এই সেশনে মোছা/সরলীকৃত প্রতিটা ব্লকই আগে থেকে-অকার্যকর `!OFFLINE_MODE` পাথ
বা সবসময়-ট্রু `if (OFFLINE_MODE)` গার্ড ছিল — আউটপুট আচরণ অপরিবর্তিত থাকার
কথা। `**Session B এখন সম্পূর্ণ**` — App.jsx-এ আর কোনো `OFFLINE_MODE`
কন্ডিশনাল লজিক বা কনস্ট্যান্ট নেই।

**কনসিকুয়েন্স:** যা যাচাই করা যায়নি (শুধু esbuild/lint/build দিয়ে যুক্তি করা
হয়েছে, বাস্তব ডিভাইসে চালিয়ে না): মালিকের PIN পরিবর্তন ফ্লো (step 1 ও 3)
আসল ডিভাইসে এখনো টেস্ট হয়নি এই গার্ড-সরানোর পর — লগইন স্ক্রিনের মতোই
priority-area-সংলগ্ন (owner access) ফিচার, তাই APK ইনস্টল করে PIN পরিবর্তন
করে দেখে নেওয়া উচিত। SMS/Recovery কার্ড অপসারণে UI-তে কোনো ফাঁকা জায়গা বা
লেআউট সমস্যা হচ্ছে কিনা তাও Settings পেজ স্ক্রল করে দেখে নেওয়া ভালো।
এরপরের ধাপ (Session C: package.json/firebase.json/firestore.rules/
netlify-site vendor ক্লিনআপ, Session D: admin.html) এখনো শুরু হয়নি।

---

### ২৯ জুলাই ২০২৬ — Session B (আংশিক): ৭৭টা `OFFLINE_MODE` কন্ডিশনাল রিভিউ শুরু (src/App.jsx)

**কেন:** Session A-তে (দেখুন নিচের এন্ট্রি) কেন্দ্রীয় Firebase/FSS সরানোর পর
প্ল্যান অনুযায়ী পরের ধাপ ছিল অ্যাপে ছড়িয়ে থাকা ৭৭টা `if/ternary (!)OFFLINE_MODE`
কন্ডিশনাল রিভিউ করে গার্ড তুলে ফেলা (production-এ `OFFLINE_MODE` সবসময়
`true`, তাই `!OFFLINE_MODE` পাথ সবসময় dead) এবং শেষে `OFFLINE_MODE`
কনস্ট্যান্টটাই বাদ দেওয়া। ব্যবহারকারী এই সেশনে "বর্তমান অবস্থায়" (পুরো ৭৭টা
শেষ না করেই) ভ্যালিডেশন করে zip নিতে বলেছেন — তাই এটা একটা **আংশিক**
Session B এন্ট্রি, বাকি অংশ পরের সেশনে।

**এই সেশনে যা করা হলো (App.jsx-এ):**
1. `SubscriptionGate` কম্পোনেন্ট (~৬৭০ লাইন) সম্পূর্ণ collapse — এর ভেতরের
   `if (OFFLINE_MODE) return <>{children}</>;` গার্ড সবসময় সবার আগে ট্রু
   হতো বলে নিচের সব state/effect/handler/JSX ১০০% অপ্রাপ্য ছিল। এখন
   কম্পোনেন্ট শুধু সরাসরি `children` রেন্ডার করে।
2. `useLicenseSubscription`-এর `isLocked`/`isNearExpiry`-তে `!OFFLINE_MODE ?
   false : (...)` গার্ড সরিয়ে সরাসরি ডান পাশের এক্সপ্রেশন স্থায়ী করা হয়েছে।
3. নোটিফিকেশন মেনু থেকে "সাবস্ক্রিপশন" আইটেম হাইড করার dead
   `if (!OFFLINE_MODE) visible = visible.filter(...)` লাইন সরানো হয়েছে।
4. `handleOwnerLogin`: `if (OFFLINE_MODE) {...return;}`-এর পরের dead
   non-OFFLINE_MODE Firebase শাখা মুছে লোকাল PIN যাচাই পথ স্থায়ী করা হয়েছে।
5. LoginScreen-এ dead স্টাফ (পাসওয়ার্ড-লগইন) কার্ড JSX ব্লক সরানো হয়েছে
   (স্টাফ মোড এখনো এডমিন→স্টাফ কুইক-সুইচ দিয়েই অ্যাক্সেসযোগ্য, অপরিবর্তিত)।
6. `createInvoice`-এর `if (OFFLINE_MODE && license.isLocked)` ডাবল-গার্ড
   সরলীকরণ করে সরাসরি `if (license.isLocked)`।
7. নোটিফিকেশন প্যানেলের ৩টা dead ব্লক (`if (!OFFLINE_MODE) {...}` — সিঙ্ক/
   ডিসকানেক্টেড, ব্যাকআপ, কনফ্লিক্ট/লো-স্টক) সম্পূর্ণ মুছে ফেলা হয়েছে।
8. স্টাফ ম্যানেজমেন্ট (`addUser`): dead ইউজারনেম/পাসওয়ার্ড-ভিত্তিক Firebase
   শাখা মুছে লোকাল-প্রোফাইল পথ স্থায়ী করা হয়েছে; ফর্মের dead ইউজারনেম/
   পাসওয়ার্ড/PIN ফিল্ড ব্লক এবং ৩টা `OFFLINE_MODE ? A : B` টার্নারি
   (বাটন লেবেল, খালি-স্টেট টেক্সট, ডিলিট-কনফার্ম মেসেজ, `@{username}`
   ডিসপ্লে) সরিয়ে A-পাশ স্থায়ী করা হয়েছে।
9. Settings → Staff Settings-এ dead `StaffSetupQrPanel` (Recovery Phone+PIN
   QR) ব্লক মুছে ফেলা হয়েছে।
10. Settings → Staff early-return-এ dead "Read-only Sync Status / Full App
    Checkup / ডেটা সিঙ্ক মিসম্যাচ চেক" বিশাল ব্লক (~২০০ লাইন) মুছে ফেলা হয়েছে।
11. Settings (owner) থেকে dead Firestore স্ট্যাটাস লাইন, "Firebase Sync"
    ইন্টিগ্রেশন কার্ড, "Master Sync & Backup" (Firestore+Drive) কার্ড
    (~৬৫০ লাইন), "Claude AI" ইন্টিগ্রেশন কার্ড, SMS সেকশন হেডার পিল, SMS
    Gateway কার্ড, এবং Firebase Setup ফর্ম প্যানেল (Database URL/API Key/
    Master Key verify/Firestore ডেটা মুছুন — ~১২০ লাইন) — সব মুছে ফেলা হয়েছে।

সব এডিটের পরে প্রতিবার `npx esbuild src/App.jsx --outfile=/dev/null` দিয়ে
সিনট্যাক্স চেক করা হয়েছে (প্রতিবারই পাস)।

**এই সেশনে যাচাই করা হয়েছে (সবগুলো বাস্তবে রান করে):**
- `npm install --legacy-peer-deps` (পিয়ার-ডিপেন্ডেন্সি কনফ্লিক্ট আছে
  `@codetrix-studio/capacitor-google-auth`-এর জন্য, `--legacy-peer-deps`
  দিয়ে সমাধান — এটা প্রি-এক্সিস্টিং, এই সেশনে তৈরি হয়নি)।
- `npm test` — সব পাস (logic ৬৮, schema ১৪, integration ১০, sync ২৪,
  rules-sync চেক)।
- `npm run lint` — **০টা এরর**, ৫২২টা warning (আগের ৪৬৭ থেকে বেড়েছে —
  স্বাভাবিক, কারণ dead JSX ব্লক সরানোর ফলে সংশ্লিষ্ট state/handler এখন
  ব্যবহৃত হয় না; কোনো নতুন `no-undef` নেই, অর্থাৎ কোনো orphaned রেফারেন্স
  বাকি নেই)।
- `VITE_OFFLINE_MODE=true npm run build` — সফল বিল্ড। বিল্ড আউটপুটে গ্রেপ
  করে নিশ্চিত করা হয়েছে `firebase/app|firestore|auth` প্যাকেজের কোনো কোড
  bundle-এ নেই (০টা রেফারেন্স), এবং `OFFLINE_MODE` স্ট্রিং নিজেও bundle-এ
  ০ বার — অর্থাৎ Vite build-টাইমে কনস্ট্যান্টটা inline করে dead branches
  tree-shake করে ফেলেছে (প্রত্যাশিত, যেহেতু এখনো কোড-লেভেলে কনস্ট্যান্টটা
  আছে কিন্তু ভ্যালু compile-time-এ নির্ধারিত)।

**এখনো বাকি (একই ফাইলে, পরের Session B চালিয়ে যাওয়ার সেশনে করতে হবে):**
- SMS Template ব্লক (`{!OFFLINE_MODE && (...)}`) এবং তার পাশের "১ ক্লিকে
  বাকি রিমাইন্ডার SMS" বাটন ব্লক — dead, সরাতে হবে।
- SMS Logs ব্লক (`{!OFFLINE_MODE && (() => {...})()}`) — dead, সরাতে হবে।
- দুইটা `if (OFFLINE_MODE) { ... }` ফাংশন (Firebase Setup ভেরিফাই/সেভ
  হ্যান্ডলারের ভেতরে, লোকাল-হ্যাশ যাচাই — এই দুটোর guard তুলে ভেতরের কোড
  স্থায়ী করে পরের dead non-OFFLINE_MODE Firebase শাখা মুছতে হবে, প্যাটার্ন
  ঠিক `handleOwnerLogin`-এর মতোই)।
- সবার শেষে `{currentUser?.role !== "staff" && !OFFLINE_MODE && (...)}`
  ব্লক (dead, সরাতে হবে)।
- সবশেষে: উপরের সবগুলো শেষ হলে `OFFLINE_MODE` কনস্ট্যান্টের ঘোষণা নিজেই
  (লাইন ৬১) এবং তার সংশ্লিষ্ট টপ-অফ-ফাইল কমেন্ট ব্লক ডিলিট করা যাবে —
  তখনই "Session B সম্পূর্ণ" বলা যাবে। এখনো কনস্ট্যান্টটা কোডে আছে (আর কিছু
  কমেন্টে রেফারেন্স আছে) কিন্তু কোনো `if/ternary` লজিক আর তার ওপর নির্ভর করে
  না — build-এ dead-code-eliminate হয়ে গেছে বলে bundle-এ প্রভাব নেই।
- Session C: `package.json`/`firebase.json`/`firestore.rules`/
  `firestore.indexes.json`/`database.rules.json`/`google-services.json`/
  `netlify-site/vendor/firebasejs/` ক্লিনআপ (এখনো অস্পৃশ্য)।
- Session D: `netlify-site/admin.html` (এখনো সম্পূর্ণ অস্পৃশ্য)।

**পরিবর্তনের ফল:** পরিবর্তিত ফাইল — শুধু `src/App.jsx`। ইউজার-দৃশ্যমান
আচরণ অপরিবর্তিত থাকার কথা — Session A-র মতোই যুক্তি: প্রোডাকশনে (৩টা
দোকানেই) `OFFLINE_MODE` সবসময় `true`, তাই এই সেশনের প্রতিটা মোছা ব্লকই
আগে থেকে-অকার্যকর `!OFFLINE_MODE` পাথ ছিল — কখনো রেন্ডার/রান হতো না। কোনো
accounting/stock/invoice লজিক ছোঁয়া হয়নি (৮টা প্রায়োরিটি-এলাকার কোনোটাই
সরাসরি স্পর্শ করা হয়নি, শুধু Settings/Login/Staff UI-এর চারপাশের মৃত
Firebase-নির্ভর কোড সরানো হয়েছে)।

**কনসিকুয়েন্স:** যা যাচাই করা যায়নি (শুধু esbuild সিনট্যাক্স-চেক ও
lint/build দিয়ে যুক্তি করা হয়েছে, বাস্তব ডিভাইসে চালিয়ে না): আসল Android
ডিভাইসে রান-টাইম আচরণ — বিশেষত (ক) মালিক/স্টাফ লগইন ফ্লো এখনো ঠিকঠাক কাজ
করছে কিনা (PIN সেভ/যাচাই, এডমিন→স্টাফ কুইক-সুইচ), (খ) Settings পেজের বাকি
সব কার্ড (Theme, Font, Google Drive, লোকাল ব্যাকআপ, স্টাফ ম্যানেজমেন্ট)
আগের মতোই ঠিকঠাক দেখাচ্ছে/কাজ করছে কিনা এই বড় ডিলিটগুলোর পর, (গ) নতুন স্টাফ
তৈরির ফর্ম (এখন শুধু নাম নেয়) UI ঠিকভাবে রেন্ডার হচ্ছে কিনা। পরের সেশনে বা
ব্যবহারকারী নিজে এই APK আসল ফোনে ইনস্টল করে মালিক লগইন, স্টাফ প্রোফাইল
তৈরি, এবং সম্পূর্ণ Settings পেজ স্ক্রল করে চেক করে নেওয়া উচিত।

---

### ২৯ জুলাই ২০২৬ — Session A: FSS/useFSSCollection/FBAuth + কেন্দ্রীয় Firebase কানেকশন সম্পূর্ণ সরানো (src/App.jsx)

**কেন:** আগের (প্ল্যানিং) সেশনের সিদ্ধান্ত অনুযায়ী প্রথম আসল ডিলিট ধাপ —
App.jsx থেকে FSS (Firestore Sync Service), useFSSCollection হুক, FBAuth
(০ ব্যবহার — মৃত কোড), এবং একটা নতুন-আবিষ্কৃত সবসময়-সক্রিয় কেন্দ্রীয়
Firebase কানেকশন (protik-aa991 — device-recovery/error-logging/central
subscription check) সরানো। ব্যবহারকারী নিশ্চিত করেছেন: single-device,
কেন্দ্রীয় কানেকশনও সম্পূর্ণ বাদ।

**কী কী করা হলো (একমাত্র বদলানো ফাইল: `src/App.jsx`):**

1. **যাচাই (কোড না বদলে আগে প্রমাণ করা হয়েছে এটা নিরাপদ):** `firebaseEnabled`
   কখনো `true` হয় না প্রোডাকশনে — এটা সেট করার একমাত্র জায়গা (Firebase
   Settings UI-এর "Enable" বাটন) নিজেই `{!OFFLINE_MODE && ...}` গার্ডের
   ভেতরে, যা OFFLINE_MODE বিল্ডে কখনো রেন্ডার হয় না। ফলে `FSS._db` সবসময়
   `null` থেকেছে, এবং FSS-এর প্রতিটা মেথডের `if (!this._db) return ...`
   গার্ড-শাখাই ছিল প্রোডাকশনে একমাত্র বাস্তবে-চলা পথ।
2. **FSS পুনর্লিখন (ডিলিট না, Firebase-মুক্ত স্টাব):** একই মেথড নাম/সিগনেচার
   বজায় রেখে (৩০০+ কল-সাইট একটাও ছোঁয়া হয়নি) প্রতিটা মেথডকে তার
   "not connected" আচরণে স্থায়ী করা হয়েছে — কোনো Firestore SDK কল নেই।
   `queuePendingXxx`/`getLocalPendingQueueCounts` (localStorage-only, আগেও
   Firebase-নির্ভর ছিল না) অপরিবর্তিত রাখা হয়েছে, যাতে Settings-এর "সিঙ্ক
   ব্যাকলগ" ব্যাজের আচরণ না পাল্টায়।
3. **useFSSCollection** → সম্পূর্ণ no-op ফাংশন (আগের প্যারামিটার/কল-সাইট
   অপরিবর্তিত)।
4. **FBAuth** → সম্পূর্ণ ডিলিট (০ বহিরাগত ব্যবহার নিশ্চিত করে)।
5. **কেন্দ্রীয় protik-aa991 কানেকশন** (FIREBASE_CONFIG/_fbApp/_db,
   `centralRecoveryPush`, `centralRecoveryPull`) → no-op স্টাব;
   `logErrorToCentral` → no-op (৫৪ কল-সাইট, একটাও ছোঁয়া হয়নি)।
6. **অরফান হয়ে যাওয়া বাকি সব Firebase SDK রেফারেন্স** (`query/where/
   orderBy/onSnapshot/getDocs/getDoc/setDoc/updateDoc/deleteDoc`) — যাচাই
   করে প্রতিটার গার্ড দেখা হয়েছে (সব কটাই fssReady/FSS._db/OFFLINE_MODE
   গার্ডের পেছনে ছিল, তাই ইতিমধ্যেই মৃত কোড ছিল), তারপর সেই মৃত অংশটুকু
   সরানো হয়েছে, গার্ড/হুক-সিগনেচার/dependency-array অপরিবর্তিত রেখে:
   - কিল-সুইচ লিসেনার (admin_config/appVersion) — সম্পূর্ণ ডিলিট।
   - ৬টা windowed Firestore listener effect (invoices/txns/stockMovements/
     cashLogs/returns/auditLogs) + কাস্টমার-ডিটেইল ফুল-হিস্ট্রি ফেচ +
     এক্সপায়ার্ড-মান্থলি ফেচ + cashHistFull রেঞ্জ ফেচ — গার্ডের পরের বডি
     ট্রাংকেট।
   - "Full App Checkup" ডায়াগনস্টিক (`runMismatchScan`,
     `runMismatchAutoFix`, `runSyncDiagnostics`) — গার্ডের পরের বডি
     ট্রাংকেট (রেজাল্ট: এই স্ক্রিনে এখন "Firestore রেডি না" ছাড়া কিছু
     দেখাবে না — Session C-তে এই UI-ই বাদ দেওয়া উচিত)।
   - `LoginScreen`-এর owner-PIN Firebase শাখা + Settings-এর PIN-change
     ফর্মের Firebase শাখা — ডিলিট (OFFLINE_MODE লোকাল-PIN শাখা অপরিবর্তিত)।
   - `SubscriptionGate`-এর `checkSubscription`/`submitTxn` (দুটোই
     component-level `if(OFFLINE_MODE) return` গার্ডের কারণে কখনো কল হয়
     না) — বডি খালি করা হয়েছে।
   - `AppVersionCard`-এর কেন্দ্রীয় "নীরব আপডেট চেক" — no-op (আগে থেকেই
     silent-fail ডিজাইন ছিল, তাই আচরণ অপরিবর্তিত: কার্ডে "নতুন ভার্সন"
     অংশ কখনো দেখাবে না)।
7. `_fieldTxPending`/`markFieldTxPending`/`clearFieldTxPending`/
   `getFieldTxPending` — শুধু FSS/useFSSCollection-এর ভেতরেই ব্যবহৃত হতো,
   দুটোই সরানোর সাথে এগুলোও ডিলিট।
8. Firebase imports (firebase/app, firebase/app-check, firebase/firestore,
   firebase/auth) সম্পূর্ণ সরানো; `sync.js` থেকে আর-অব্যবহৃত
   `FSS_COLLECTIONS` ইমপোর্টও বাদ।

**যাচাই করা হয়েছে (সবগুলো এই সেশনে বাস্তবে রান করে):**
- `npm test` (logic/schema/integration/sync suite + rules-sync checker) —
  সব পাস, কোনো পরিবর্তন নেই কারণ এই সেশন শুধু App.jsx ছুঁয়েছে।
- `npx esbuild` সিনট্যাক্স-চেক প্রতিটা বড় এডিটের পরে (bracket/brace মিলছে
  কিনা তাৎক্ষণিক ধরার জন্য)।
- `npm run lint` — **০টা এরর** (467টা warning, সবই আগে থেকে-পরিচিত ধরনের
  `no-unused-vars`/`react-hooks/exhaustive-deps` — নতুন কোনো `no-undef`
  নেই, অর্থাৎ কোনো orphaned Firebase রেফারেন্স বাকি নেই)।
- `VITE_OFFLINE_MODE=true npm run build` — সফল বিল্ড। বিল্ড আউটপুটে grep
  করে নিশ্চিত করা হয়েছে `firebase` প্যাকেজের কোনো কোড আর bundle-এ নেই
  (vendor chunk-এ ০টা রেফারেন্স)।

**এর ফলে কী পরিবর্তন হলো:** যুক্তি হলো — প্রোডাকশনে (৩টা দোকানেই) FSS
কখনোই সংযুক্ত হতো না, তাই এই সেশনের প্রতিটা স্টাব/ট্রাংকেশন তার আগের
"not-connected" আচরণকেই স্থায়ী করেছে মাত্র। **ইউজার-দৃশ্যমান আচরণ অপরিবর্তিত
থাকার কথা** — শুধু ব্যতিক্রম: Settings → "Full App Checkup" স্ক্রিন এখন
সবসময় "Firestore রেডি না" দেখাবে (আগে এটাও কখনো কাজ করত না, কিন্তু এখন
সেটা স্পষ্ট বার্তা হিসেবে দেখাবে), আর `AppVersionCard`-এর "নতুন ভার্সন
পাওয়া গেছে" অংশ আর কখনো দেখাবে না (কেন্দ্রীয় ভার্সন-চেক সার্ভার নেই)।
প্রায়োরিটি-এলাকা ছোঁয়া হয়েছে: #১ অফলাইন-অনলাইন সিঙ্ক, #২ মাল্টি-ডিভাইস
সিঙ্ক (দুটোই এখন চিরতরে বন্ধ, ইচ্ছাকৃতভাবে)। #৩ ব্যাকআপ/#৪ রিস্টোর/#৫
হিসাব/#৬ পণ্য/#৭ কাস্টমার/#৮ ইনভয়েস — এগুলোর কোনো লজিক কোড ছোঁয়া হয়নি
(শুধু তাদের চারপাশের মৃত Firestore sync/listener কোড সরানো হয়েছে)।

**ভবিষ্যতে যা মাথায় রাখতে হবে:**
- Session B (৭৭টা `OFFLINE_MODE` কন্ডিশনাল রিভিউ) এখনো বাকি — এই সেশনে
  শুধু যেগুলো FSS/central-connection-এর কারণে সরাসরি ভেঙে গিয়েছিল
  সেগুলোই ছোঁয়া হয়েছে, বাকি ৭০+ জায়গা (Firebase settings UI ফর্ম, SMS
  গেটওয়ে, ইত্যাদি) এখনো `!OFFLINE_MODE &&` গার্ডের ভেতরে অক্ষত আছে —
  dead কিন্তু bundle-এ এখনো আছে।
- Session C: `package.json` থেকে `firebase`/`firebase-tools`/
  `@firebase/rules-unit-testing` এখনো বাদ দেওয়া হয়নি;
  `firebase.json`/`firestore.rules`/`firestore.indexes.json`/
  `database.rules.json`/`google-services.json`/
  `netlify-site/vendor/firebasejs/` — কোনোটাই এখনো সরানো হয়নি।
- Session D: `netlify-site/admin.html` (৭৭ রেফারেন্স, আলাদা ডিপ্লয়মেন্ট)
  এখনো সম্পূর্ণ অস্পৃশ্য।
- "Full App Checkup" (`runMismatchScan`/`runMismatchAutoFix`/
  `runSyncDiagnostics`) আর `AppVersionCard`-এর UI বাটন/কার্ড এখনো JSX-এ
  আছে (এখন কার্যত অকেজো) — Session B/C-তে এই UI-গুলো সম্পূর্ণ বাদ দেওয়া
  উচিত কিনা সিদ্ধান্ত নিতে হবে।
- `test:rules`/`test:sync-emulator`/`test:canary` (Firestore emulator-নির্ভর,
  `npm test`-এর অংশ না) — এখনো আপডেট হয়নি, Session আছে এখনো emulator-নির্ভর
  পুরনো কোড রেফার করে (Session ৯-এর কাজ)।

**কনসিকুয়েন্স:** ভুল হলে সম্ভাব্য ক্ষতি — এই সেশনে কোনো accounting/stock/
invoice লজিক ছোঁয়া হয়নি, তাই ভুল হলেও সরাসরি টাকা/স্টক ভুল হিসাবের ঝুঁকি
কম। আসল ঝুঁকি ছিল orphaned রেফারেন্স থেকে **সম্পূর্ণ অ্যাপ ক্র্যাশ** (সাদা
স্ক্রিন) — সেটা `npm run lint` (০ এরর) আর প্রকৃত `vite build` সফল হওয়া
দিয়ে নিশ্চিত করা হয়েছে, প্রতিটা বড় এডিটের পরেই esbuild দিয়ে
সিনট্যাক্স-চেক করে। যা যাচাই করা যায়নি (শুধু কোড-রিভিউ দিয়ে যুক্তি করা
হয়েছে, বাস্তব ডিভাইসে না চালিয়ে): আসল Android ডিভাইসে/এমুলেটরে রান-টাইম
আচরণ — বিশেষত localStorage `sbm_pending_*` কিউ-নির্ভর "সিঙ্ক ব্যাকলগ"
ব্যাজ ঠিকঠাক দেখাচ্ছে কিনা। পরের সেশনে (বা ব্যবহারকারী নিজে) এই APK
আসল ফোনে ইনস্টল করে PIN লগইন, ইনভয়েস তৈরি, এবং Settings পেজ খুলে
চেক করে নেওয়া উচিত।



### ২৯ জুলাই ২০২৬ — Firebase/Firestore সম্পূর্ণ সরানোর প্ল্যানিং সেশন (শুধু অনুসন্ধান/প্ল্যান, কোনো লজিক কোড এখনো বদলায়নি)

**কেন:** ব্যবহারকারী (Protik) চান App.jsx ও netlify-site/admin.html দুটো থেকেই
Firebase/Firestore-সম্পর্কিত সব কোড, প্যাকেজ ও কনফিগ ফাইল সম্পূর্ণ সরিয়ে
অ্যাপটাকে স্থায়ীভাবে full-offline মোডে নিয়ে যেতে — প্রতিটা দোকান একটাই
ডিভাইসে চলবে, মাল্টি-ডিভাইস সিঙ্ক আর দরকার নেই। Google Drive + লোকাল ফাইল
ব্যাকআপ (Firebase-নির্ভর না) অপরিবর্তিত থাকবে।

**এই সেশনে যা করা হলো (শুধু read-only অনুসন্ধান, কোনো ফাইল বদলায়নি — শুধু এই
CLAUDE.md এন্ট্রি ছাড়া):**

1. পুরো repo স্ক্যান করে Firebase-স্পর্শ করা সব ফাইল ম্যাপ করা হয়েছে:
   `src/App.jsx` (১৯৫ রেফারেন্স, একমাত্র ফাইল যেখানে আসল Firebase SDK কল আছে),
   `src/sync.js`/`schemas.js`/`logic.js` (শুধু কমেন্টে উল্লেখ, কোনো import/call
   নেই — এগুলো এমনিতেই Firebase-মুক্ত), `netlify-site/admin.html` (৭৭
   রেফারেন্স, সম্পূর্ণ আলাদা ডিপ্লয়মেন্ট), `firebase.json`,
   `firestore.rules`, `firestore.indexes.json`, `database.rules.json`,
   `google-services.json`, `netlify-site/vendor/firebasejs/`।
2. **গুরুত্বপূর্ণ আবিষ্কার:** App.jsx-এ ইতিমধ্যে একটা build-time
   `OFFLINE_MODE` কনস্ট্যান্ট (লাইন ৭০, `VITE_OFFLINE_MODE` env var থেকে)
   আছে যেটা ৭৭ জায়গায় ব্যবহৃত — PIN লগইন, সাবস্ক্রিপশন লক, সিঙ্ক/ব্যাকআপ
   নোটিফিকেশন হাইড ইত্যাদি ইতিমধ্যে দুইটা কোড-পাথে ভাগ করা। আর
   `.github/workflows/build-apk.yml` অনুযায়ী **প্রতিটা সাধারণ push-এ ডিফল্টভাবে
   `OFFLINE_MODE=true` বিল্ডই তৈরি হয় (`SBM-OFFLINE-v*.apk`)** — ব্যবহারকারী
   কনফার্ম করেছেন বর্তমান ৩টা দোকানই এই OFFLINE বিল্ডেই চলছে। অর্থাৎ
   Firebase পাথটা বর্তমান প্রোডাকশনে আসলে ইতিমধ্যেই অব্যবহৃত (dead) —
   এটা সরানো নতুন কোনো ব্যবহারিক আচরণ পাল্টাবে না, শুধু dead কোড/dependency
   পরিষ্কার হবে।
3. মূল Firebase কোড-ব্লক আইডেন্টিফাই ও সাইজ মাপা হয়েছে (App.jsx-এ):
   - Firebase imports: লাইন ৩–১৭
   - `FSS` অবজেক্ট (পুরো Firestore sync ইঞ্জিন): লাইন ৫৫৩১–৭০৮০ (~১৫৫০ লাইন)
   - `useFSSCollection` হুক (remote↔local sync): লাইন ৭৩৮৬–৭৭৮৩ (~৪০০ লাইন)
   - `FBAuth` অবজেক্ট (REST-based phone OTP লগইন, SDK ছাড়া): লাইন ৮১৯২ থেকে
   - Firebase সেটিংস UI (`fbForm`, App Check ফর্ম ইত্যাদি): ৮২ জায়গা, ছড়ানো
   - বাকি ~১৫০+ ছড়ানো কল-সাইট (collection/doc/setDoc/getDocs/query/...),
     যার বেশিরভাগ উপরের ব্লকগুলোর ভেতরেই বা `if (!OFFLINE_MODE)` গার্ডের
     ভেতরে, তাই ব্লক-লেভেল ডিলিটের সাথেই চলে যাবে বলে ধারণা।

**সিদ্ধান্ত হওয়া কৌশল:** নতুন local-storage layer বানানো লাগবে না (App.jsx-এ
আগে থেকেই `_idb` নামে IndexedDB-ভিত্তিক লোকাল স্টোরেজ আছে, যেটা এমনিতেই
ডেটার প্রাথমিক উৎস)। বরং **OFFLINE_MODE=true পাথকে স্থায়ী/একমাত্র পাথ বানিয়ে
`else`/Firebase পাথ সম্পূর্ণ ডিলিট** করা হবে — এটা "শিম/নতুন সিস্টেম বানানো"-র
চেয়ে অনেক কম ঝুঁকিপূর্ণ কারণ OFFLINE_MODE পাথ ইতিমধ্যেই ৩টা আসল দোকানে
battle-tested।

**পরবর্তী সেশনের জন্য প্ল্যান (প্রতিটা আলাদা সেশন/PR হওয়া উচিত):**
- Session A: `FSS`, `useFSSCollection`, `FBAuth` ব্লক ডিলিট + Firebase imports
  ডিলিট + এতিম হয়ে যাওয়া কল-সাইট পরিষ্কার।
- Session B: ৭৭টা `OFFLINE_MODE` কন্ডিশনাল রিভিউ — গার্ড তুলে ভেতরের কোড
  স্থায়ী করা, `if (!OFFLINE_MODE) {...}` ব্লক ডিলিট, শেষে `OFFLINE_MODE`
  কনস্ট্যান্টটাই বাদ।
- Session C: Firebase সেটিংস UI সরানো + `package.json`/`firebase.json`/
  `firestore.rules`/`firestore.indexes.json`/`database.rules.json`/
  `google-services.json`/vendor ফোল্ডার ক্লিনআপ + build workflow-এর
  online_release পাথ সরানো।
- Session D: `netlify-site/admin.html` থেকে Firebase সরানো (আলাদা বড় কাজ —
  লাইসেন্স/শপ ম্যানেজমেন্ট বিকল্প আগে ঠিক করতে হবে)।
- Session E: পূর্ণ `npm test` + APK বিল্ড ভ্যালিডেশন + BUGFIX_LOG.md এন্ট্রি।

**ভবিষ্যতে এখানে কাজ করলে যা মাথায় রাখতে হবে:**
1. `!OFFLINE_MODE` গার্ডের ভেতরের কোড ডিলিট করার আগে নিশ্চিত হন সেটা সত্যিই
   Firebase-শুধু কোড, কোনো shared লজিক (`logic.js`-এর ফাংশন কল) না — blast
   radius ৮-প্রায়োরিটি-এলাকার (বিশেষত অফলাইন-অনলাইন সিঙ্ক, মাল্টি-ডিভাইস
   সিঙ্ক, ব্যাকআপ) সাথে সরাসরি সম্পর্কিত।
2. `netlify-site/admin.html`-এ embedded `FB_DEFAULT_RULES`/`FB_DEFAULT_INDEXES`/
   `FB_DEFAULT_RTDB` টেমপ্লেট আছে (দেখুন PHASE0_NOTES.md) — Session D-তে এগুলো
   আর `firestore.rules`/`firestore.indexes.json`/`database.rules.json`-এর
   sync-চেকার (`scripts/check-rules-sync.mjs`) একসাথে বিবেচনা করতে হবে,
   নাহলে CI-এর rules-sync টেস্ট ভেঙে যেতে পারে।
3. `tests/rules-tests.mjs`, `tests/sync-emulator-tests.mjs`,
   `tests/canary-tests.mjs` — এগুলো Firestore emulator-নির্ভর, Firebase
   সম্পূর্ণ সরানোর পর এগুলো বাদ/রিটায়ার করতে হবে, নাহলে `npm test`/CI ভাঙবে।
4. Session A/B শুরু করার আগে অবশ্যই বর্তমান কোড GitHub-এ কমিট/ব্যাকআপ আছে
   কিনা নিশ্চিত করতে হবে (৪০,৫৭৫ লাইনের একটাই ফাইলে এত বড় ডিলিট, রিভার্ট করার
   সহজ উপায় থাকা জরুরি)।

**কনসিকুয়েন্স:** এই সেশনে কোনো লজিক/রানটাইম কোড বদলায়নি (শুধু এই ডকুমেন্টেশন
এন্ট্রি), তাই ৮-প্রায়োরিটি-এলাকার কোনোটাতেই এখনো কোনো ঝুঁকি নেই। ঝুঁকি শুরু
হবে Session A থেকে, যখন প্রথম আসল কোড-ডিলিট হবে — তখন থেকে প্রতিটা সেশনের পর
`npm test` বাধ্যতামূলক এবং সম্ভব হলে অন্তত একটা OFFLINE APK বিল্ড করে
সাইডলোড টেস্ট সুপারিশ করা হচ্ছে।

### ২৮ জুলাই ২০২৬ — অফলাইন মাসিক সাবস্ক্রিপশন লক সিস্টেম (নতুন ফিচার, sandbox-এ আংশিক যাচাই)

**কেন:** ব্যবহারকারী (Protik) কয়েকটা দোকানকে Firebase থেকে বের করে সম্পূর্ণ
OFFLINE_MODE-এ নিয়ে এসেছেন। অফলাইন হওয়ায় কেন্দ্রীয় সাবস্ক্রিপশন-ডক/নেটওয়ার্ক
নির্ভর মাসিক ফি আদায়ের প্রক্রিয়া অকার্যকর হয়ে যায় — দোকানদারকে টাকা দিতে
বাধ্য করার কোনো উপায় ছিল না। আলোচনায় স্থির হওয়া ডিজাইন: ডিভাইস-বাউন্ড মাসিক
৬-ডিজিট কোড, ফোনে যোগাযোগ করে প্রতি মাসে দেওয়া হবে, না দিলে শুধু নতুন
ইনভয়েস/বিক্রি বন্ধ (soft-lock, ডেটা দৃশ্যমান থাকবে)।

**কী করা হলো (ফাইলভিত্তিক):**
- `src/App.jsx` — LICENSE_* কনস্ট্যান্ট/হেল্পার (ডিভাইস আইডি জেনারেট,
  HMAC-স্টাইল ৬-ডিজিট কোড কম্পিউট/ভেরিফাই — SHA-256 সল্টেড-ডাইজেস্ট,
  hashPassword-এর প্যাটার্ন অনুসরণ করে; ক্লক-রোলব্যাক ট্যাম্পার-গার্ড, ৬ ঘণ্টা
  tolerance), `useLicenseSubscription` হুক (state+load/save orchestration),
  নতুন "সাবস্ক্রিপশন" সাইড-মেনু আইটেম (স্টাফ ব্যবস্থাপনা↔সেটিং-এর মাঝে, শুধু
  admin/owner দেখবে, শুধু OFFLINE_MODE বিল্ডে দৃশ্যমান), নতুন
  `SubscriptionModule` কম্পোনেন্ট (ডিভাইস আইডি+কপি বাটন, স্ট্যাটাস, ৬-ডিজিট
  কোড-এন্ট্রি, কল/WhatsApp বাটন ০১৫৭২৯৩১২৩০, হিস্ট্রি লিস্ট), ড্যাশবোর্ডের
  উপরে ৭-দিন সতর্কতা ব্যানার (হলুদ/লাল, ট্যাপে সাবস্ক্রিপশন ট্যাবে নিয়ে যায়),
  `createInvoice()`-এর শুরুতে soft-lock গার্ড + ইনভয়েস সাবমিট বাটনের
  disabled/লেবেল কন্ডিশনে `license.isLocked`।
- `netlify-site/license-generator.html` (নতুন) — ডেভেলপার-শুধু, পাসওয়ার্ড-
  প্রোটেক্টেড স্ট্যান্ডঅ্যালোন ব্রাউজার টুল। ডিভাইস আইডি ইনপুট দিলে চলতি
  মাসের কোড দেখায় (App.jsx-এর সাথে হুবহু মিলিয়ে রাখা LICENSE_SECRET+সূত্র,
  Web Crypto SubtleCrypto দিয়ে ব্রাউজারেই কম্পিউট, কোনো সার্ভার/ব্যাকএন্ড
  লাগে না)। admin.html-এর মতোই netlify-site/-এ স্ট্যাটিক ফাইল হিসেবে বসানো,
  আলাদা কোনো routing config লাগেনি (netlify.toml-এর publish="." ইতিমধ্যেই
  এই ডিরেক্টরির সব ফাইল সার্ভ করে)।
- `BUGFIX_LOG.md` — নতুন এন্ট্রি (নিচে বিস্তারিত)।

**🔴 এই সেশনে নিজে ধরা পড়া ও ঠিক করা দুটো critical bug:**

১. প্রথম খসড়ায় `license.isLocked` ডিফল্টভাবে `true` ছিল (কখনো কোড অ্যাক্টিভেট
না করলে unlockedUntil কখনো সেট হয় না) এবং এই গার্ড `OFFLINE_MODE`-নির্বিশেষে
সব বিল্ডে প্রযোজ্য ছিল — অর্থাৎ deploy হলে এই ৮-প্রায়োরিটি-এলাকার একটাকে
(ইনভয়েস) স্পর্শ করে **বর্তমান ৫০০ Firebase-চালিত শপেই ইনভয়েস তৈরি বন্ধ হয়ে
যেত।** BUGFIX_LOG এন্ট্রি লেখার সময় (post-flight রিভিউ) এটা নিজে ধরা পড়ে,
তিন জায়গায় ফিক্স করা হয়েছে: (১) `useLicenseSubscription()`-এ `!OFFLINE_MODE`
হলে `isLocked`/`isNearExpiry` জোরপূর্বক `false` (মূল গার্ড, হুক-লেভেল), (২)
`createInvoice()`-এর গার্ডে `OFFLINE_MODE &&` ডাবল-চেক (defense-in-depth),
(৩) `navItems`-এ `!OFFLINE_MODE` হলে মেনু-আইটেমটাই হাইড।

২. `createInvoice()`/ইনভয়েস সাবমিট বাটন আসলে `SmartBusinessMgmt`-এ না, আলাদা
`SmartInvoiceBuilder` কম্পোনেন্টে থাকে — তাই `SmartBusinessMgmt`-এ
ডিক্লেয়ার করা `license` ওই কম্পোনেন্টের স্কোপে ছিলই না (`'license' is not
defined`, `no-undef`, ৪ জায়গায়)। sandbox-এ `npm install` করে `npm run lint`
চালিয়ে এটা ধরা পড়ে — ফিক্স: `<MemoSmartInvoiceBuilder>`-কে `license={license}`
prop পাস, `SmartInvoiceBuilder`-এর সিগনেচারে নিরাপদ ডিফল্টসহ (`{ isLocked:
false }`) প্যারামিটার যোগ। এই বাগ ধরা না পড়লে ইনভয়েস স্ক্রিনই সব শপে ভেঙে
যেত (JS ReferenceError, OFFLINE_MODE-নির্বিশেষে)।

ফিক্সের পর: `npm run lint` → 0 errors (440 pre-existing warning অপরিবর্তিত,
আমার কোডের কারণে নতুন কোনো warning যোগ হয়নি সেটাও নিশ্চিত করা হয়েছে)।
`npm test` (৬৮ logic + ১৪ schema + ১০ integration + ২৪ sync + rules-sync,
সব) সম্পূর্ণ সবুজ — sandbox-এ `npm install --legacy-peer-deps` করে পুরো
সুইট রান করা সম্ভব হয়েছে (আগে node_modules ছাড়া partial চালানো গিয়েছিল)।

**এর ফলে কী কী পরিবর্তন হলো:** ৮-প্রায়োরিটি-এলাকার মধ্যে শুধু "ইনভয়েস"
স্পর্শ করা হয়েছে — একটাই নতুন early-return guard `createInvoice()`-এর শুরুতে,
যেটা এখন `OFFLINE_MODE && license.isLocked` উভয়ই সত্য না হলে কখনো ট্রিগার
হবে না (তাই বিদ্যমান ৫০০ Firebase শপে সম্পূর্ণ no-op)। `src/logic.js`,
`src/sync.js`, schema, firestore rules কোনোটাই ছোঁয়া হয়নি। বাকি সব নতুন কোড
(LICENSE_* হেল্পার, useLicenseSubscription, SubscriptionModule, ব্যানার,
নেভ-আইটেম) সম্পূর্ণ isolated — কোনো বিদ্যমান ফাংশন/স্টেট বদলায়নি।

**ভবিষ্যতে এখানে কাজ করলে যা মাথায় রাখতে হবে:**
1. `LICENSE_SECRET` (App.jsx) আর `license-generator.html`-এর `LICENSE_SECRET`
   হুবহু মিলতে হবে — একটা বদলালে অন্যটাও একসাথে বদলান, নাহলে সব চলমান
   দোকানের চলতি মাসের কোড কাজ করা বন্ধ হয়ে যাবে।
2. এই পুরো ফিচার সচেতনভাবে `OFFLINE_MODE` ফ্ল্যাগ দিয়ে গেটেড — কোনো নতুন
   কোড-পাথ যোগ করার সময় সেই একই গার্ড-প্যাটার্ন বজায় রাখতে হবে।
3. মেয়াদ শেষ হলে "শুধু নতুন ইনভয়েস/বিক্রি বন্ধ" — এটা ব্যবহারকারীর সুনির্দিষ্ট
   সিদ্ধান্ত (soft-lock, ডেটা সবসময় দৃশ্যমান)। ভবিষ্যতে কেউ চাইলেও পুরো অ্যাপ
   ব্লক করা "hard lock" স্ক্রিন **যোগ করা উচিত না** যতক্ষণ না ব্যবহারকারী
   স্পষ্টভাবে সেটা আবার চান — এটা এই সেশনের একটা সচেতন প্ল্যান-পরিবর্তন
   (আগের প্রস্তাবিত "লক-স্ক্রিন" আইটেমটা ব্যবহারকারীর soft-lock পছন্দের কারণে
   বাদ দেওয়া হয়েছে)।
4. ক্লক-ট্যাম্পার গার্ড (`checkLicenseClockTamper`) শুধু `LICENSE_MAX_SEEN_KEY`-
   এর বিপরীতে "পিছিয়ে যাওয়া" ধরে — খুব ছোট (৬ ঘণ্টার কম) টাইমজোন/DST
   গোলযোগ সহনীয় রাখা হয়েছে ইচ্ছাকৃতভাবে, যাতে নিরীহ ইউজার ভুল করে লক না হয়ে
   যান।

**কনসিকুয়েন্স ও যাচাই-অবস্থা:** যদি উপরের দুটো বাগ ধরা না পড়ত, বাস্তব ক্ষতি
হতো: (১) ৫০০ চলমান দোকানে হঠাৎ ইনভয়েস তৈরি বন্ধ হয়ে যাওয়া, অথবা (২) ইনভয়েস
স্ক্রিনই ক্র্যাশ করা (JS ReferenceError) — দুটোই production outage,
severity ব্যবসা-বন্ধ-করে-দেওয়ার মতো (যদিও কোনোটাতেই ডেটা/টাকার হিসাব ভুল
হতো না, শুধু ফিচার ব্যবহার-অযোগ্য হয়ে যেত)। দুটোই এই সেশনেই ধরা পড়ে ঠিক করা
হয়েছে। sandbox-এ verify করা হয়েছে: `npm install --legacy-peer-deps` করে
পুরো `npm test` (৬৮ logic + ১৪ schema + ১০ integration + ২৪ sync +
rules-sync — সব পাস), `npm run lint` (0 errors, pre-existing 440 warning
অপরিবর্তিত), আর `npx esbuild` সিনট্যাক্স-চেক। **যা এখনো verify করা যায়নি:**
real ডিভাইস/এমুলেটরে চালিয়ে UI/UX (ব্যানার, সাবস্ক্রিপশন মডিউল, কোড
এন্ট্রি ফ্লো) চোখে দেখে কনফার্ম করা — sandbox-এ Capacitor/Android বিল্ড বা
ব্রাউজার প্রিভিউ চালানো সম্ভব হয়নি। GitHub Actions বিল্ড + কমপক্ষে একটা
টেস্ট শপে (এবং একটা OFFLINE_MODE=false শপেও, নিশ্চিত হতে) ম্যানুয়াল যাচাই
ছাড়া merge করা উচিত না।

### ২২ জুলাই ২০২৬ (তৃতীয় সেশন) — ফেজ B ইমপ্লিমেন্টেশন (sandbox-এ যাচাই-অসম্পূর্ণ)

**কেন:** আগের সেশনে ফেজ A সম্পূর্ণ হয়ে আসল GitHub Actions (Build #403)-এ
কনফার্ম হয়েছিল। এই সেশনে ব্যবহারকারী "শুরু করুন এবং ফেজ B শেষ করে আউটপুট
দেন" বলে ফেজ B (স্তর ২: real emulator-integration টেস্ট, B1–B4) শুরু করতে
বলেন।

**কী করা হলো (ফাইলভিত্তিক):**
- `tests/sync-emulator-tests.mjs` (নতুন) — `tests/rules-tests.mjs`-এর প্রমাণিত
  প্যাটার্ন (`initializeTestEnvironment`) অনুসরণ করে ৭টা কেস: B1 (২-ডিভাইস ও
  ৩-ডিভাইস conflict, real `serverTimestamp()`), B2 (network-drop mid-merge +
  duplicate-retry idempotency), B3 (backup→restore round-trip + অজানা
  legacy-কী backward-compat)।
- `package.json` — নতুন script `test:sync-emulator`।
- `.github/workflows/build-apk.yml` — `firestore-rules` জবে নতুন blocking
  step যোগ (B4), YAML syntax পার্স করে যাচাই করা হয়েছে।
- **কোড রিভিউয়ে ২টা বাগ ধরে ঠিক করা হয়েছে চালানোর আগেই** (sandbox-এ রান
  করা যায়নি বলে বিশেষভাবে সতর্কতার সাথে ম্যানুয়াল রিভিউ করা হয়েছে):
  ১. B3 টেস্টে negative balance ফিক্সচার ছিল, যা `firestore.rules`-এর
     `validCustomer()` reject করে দিত (টেস্ট নিজেই rules-এর কাছে ব্যর্থ হতো)।
  ২. B3-এর "নতুন ডিভাইসে restore" অংশে একটা মনগড়া কালেকশন-নাম ব্যবহার করা
     হয়েছিল, যা `firestore.rules`-এর ডিফল্ট-ডিনাই নীতির কারণে (কোনো match
     ব্লকে না মিললে সম্পূর্ণ deny) সব write-ই ব্যর্থ করত — `customers_pharmacy`
     (আসল, rules-ভ্যালিডেটেড path) দিয়ে ঠিক করা হয়েছে।
- `ENTERPRISE_MONITORING_PLAN.md` — B1–B4-এর নিচে বিস্তারিত যাচাই-অবস্থা
  নোট যোগ করা হয়েছে, **কিন্তু বক্স `[x]` করা হয়নি** (নিচে দেখুন কেন)।

**⚠️ এই সেশনে যা যাচাই করা যায়নি:** sandbox-এ `npm run test:sync-emulator`
চালানোর চেষ্টা করা হয়েছে, কিন্তু sandbox-এর network egress allowlist-এ
`storage.googleapis.com` না থাকায় Firestore Emulator jar ডাউনলোডই ব্যর্থ হয়
(`Error: download failed, status 403: Host not in allowlist`) — এটা ফেজ A
প্ল্যানিং সেশনেও আগেই আশঙ্কা করা হয়েছিল। তাই টেস্ট কোড **চালিয়ে green
পাওয়া যায়নি**, শুধু নিবিড়ভাবে ম্যানুয়াল রিভিউ করা হয়েছে (উপরে উল্লেখিত ২টা
বাগ সেই রিভিউতেই ধরা পড়েছে) এবং `node --check` দিয়ে সিনট্যাক্স যাচাই করা
হয়েছে। যা sandbox-এ সত্যিই চালিয়ে যাচাই করা হয়েছে: বিদ্যমান `npm test`
(৯১টা কেস green, অপরিবর্তিত), `npm run lint` (০ error, ৪০৩ pre-existing
warning), `npm run typecheck` (clean) — অর্থাৎ নতুন কোড বিদ্যমান কিছু ভাঙেনি,
কিন্তু নতুন B1–B4 টেস্টগুলো নিজে সত্যিই pass করে কিনা তার একমাত্র প্রকৃত
প্রমাণ হবে GitHub Actions-এর প্রথম রান।

**ভবিষ্যতে মাথায় রাখতে হবে:**
- GitHub-এ push করার পর `firestore-rules` জবের নতুন step-এর ফলাফল দেখে
  নিশ্চিত হতে হবে — pass করলেই তখন B1–B4 `[x]` করা উচিত, fail করলে
  root-cause করে ঠিক করতে হবে (ফেজ A-এর মতোই, revert না করে)।
- ফেজ C (release canary) শুরুর আগে এই B-ফেজের আসল CI ফলাফল একবার দেখে
  নেওয়া ভালো, কারণ C1 (end-to-end canary)-ও একই real-emulator নির্ভরতায়
  পড়বে।

**কনসিকুয়েন্স:** কোনো অ্যাপ কোড (App.jsx/sync.js/logic.js/rules) ছোঁয়া
হয়নি — শুধু নতুন টেস্ট ফাইল + CI step যোগ হয়েছে। ঝুঁকি: নতুন CI step
blocking রাখা হয়েছে (fuzz test-এর প্যাটার্ন অনুসরণ করে), কিন্তু এটা
sandbox-এ প্রি-ভেরিফাই করা যায়নি বলে প্রথম আসল রানে fail করার সম্ভাবনা
ফেজ A-এর চেয়ে বেশি — সেক্ষেত্রে build আটকে যাবে যতক্ষণ না ঠিক করা হয়।

**আপডেট (একই দিন, পরে):** প্রথম দুইবার (Build #405, #406) আসল CI-তে
`npm error Missing script: "test:sync-emulator"` দিয়ে ফেল করেছিল — কোডের
বাগ না, `package.json`-এর নতুন script লাইনটা GitHub আপলোডে বাদ পড়ে
গিয়েছিল (root cause স্ক্রিনশট থেকে ধরা হয়েছে, সংশোধিত `package.json`
আলাদা করে দেওয়া হয়েছে)। ব্যবহারকারী সঠিক `package.json` re-upload করার পর
**Build #408-এ "🔀🔥 Sync/Backup Emulator ইন্টিগ্রেশন টেস্ট" step ৬ সেকেন্ডে
সবুজ টিক দিয়ে pass করেছে** (স্ক্রিনশট-কনফার্মড, real GitHub Actions
runner-এ) — ফেজ B এখন সম্পূর্ণরূপে যাচাইকৃত। `ENTERPRISE_MONITORING_PLAN.md`-এ
B1–B4 টিক দেওয়া হয়েছে।

---

### ২২ জুলাই ২০২৬ (দ্বিতীয় সেশন) — ফেজ A ইমপ্লিমেন্টেশন

**কেন:** আগের (একই দিনের প্রথম) সেশনে `ENTERPRISE_MONITORING_PLAN.md` শুধু
প্ল্যান হিসেবে তৈরি হয়েছিল। এই সেশনে ব্যবহারকারী "প্ল্যান ইমপ্লিমেন্টেশন
শুরু করুন" বলে সরাসরি ফেজ A (স্তর ১: fuzz/mutation) বাস্তবায়ন করতে বলেন।

**কী করা হলো (ফাইলভিত্তিক):**
- `npm install --legacy-peer-deps` চালিয়ে সব dependency ইনস্টল করা হয়েছে,
  তারপর `npm test` চালিয়ে বেসলাইন ৯১টা কেস (৪৩+১৪+১০+২৪) সব green পাওয়া
  গেছে।
- `tests/logic-fuzz.mjs` sandbox-এ ১০ বার আলাদাভাবে রান করে (প্রতিবার ৯টা
  property × ১০০০ random ইনপুট) প্রতিবার green/exit-0 পাওয়া গেছে।
- `.github/workflows/build-apk.yml`: fuzz test step থেকে `continue-on-error`
  সরিয়ে blocking করা হয়েছে (কমেন্টসহ, কবে/কীভাবে যাচাই হয়েছে তা লেখা আছে);
  স্টেপ-নাম "informational only" থেকে বদলে সঠিক করা হয়েছে; নতুন
  "🧬 Mutation score report" step যোগ করা হয়েছে (`npm run test:mutation`,
  `continue-on-error: true` — ইচ্ছাকৃতভাবে এখনো informational, build-gate
  না)। YAML syntax পুরোপুরি পার্স করে যাচাই করা হয়েছে (`python3 -c
  "import yaml"`)।
- `stryker.conf.json`: sandbox-এ `npx stryker run` ২ বার চালিয়ে বেসলাইন
  ৭২.৫৩% (২৬৪ killed/১০০ survived) পাওয়া গেছে; `thresholds.break: null` →
  `65` করা হয়েছে (বেসলাইনের ~৭.৫ পয়েন্ট নিচে বাফার হিসেবে), `_comment`-এ
  কারণ ও বাকি থাকা survived-mutant hotspot (calcInvoiceTotal-এর আশেপাশে)
  নোট করা হয়েছে।
- `BUGFIX_LOG.md`: শীর্ষে নতুন এন্ট্রি (২০২৬-০৭-২২) — ফেজ A সম্পূর্ণ হওয়ার
  বিস্তারিত, sandbox-এ যা চালানো হয়েছে বনাম আসল GitHub Actions-এ যা এখনো
  চালানো হয়নি তার স্পষ্ট বিভাজনসহ।
- `ENTERPRISE_MONITORING_PLAN.md`: A1–A3 চেকবক্স `[x]` করা হয়েছে, "বর্তমান
  অবস্থা" টেবিলের স্তর-১ সারি "সম্পূর্ণ" হিসেবে আপডেট করা হয়েছে।

**এর ফলে কী পরিবর্তন হলো:** CI/CD pipeline (`.github/workflows/build-apk.yml`)
ও `stryker.conf.json` বদলেছে — কোনো অ্যাপ কোড (App.jsx/logic.js/sync.js/
schemas.js/rules) ছোঁয়া হয়নি। ৮টা প্রায়োরিটি-এলাকার মধ্যে সরাসরি কোনোটা
রানটাইমে প্রভাবিত হয়নি, কিন্তু **বিল্ড-গেট শক্ত হয়েছে**: এখন থেকে
`src/logic.js`-এ কেউ এমন পরিবর্তন করলে যা negative-total/NaN/crash-এর মতো
কোনো fuzz invariant ভাঙে, build সরাসরি আটকে যাবে — আগে এটা শুধু non-blocking
warning ছিল।

**ভবিষ্যতে মাথায় রাখতে হবে:**
- এই পরিবর্তিত workflow আসল GitHub Actions-এ এখনো একবারও রান হয়নি —
  merge-এর পর প্রথম CI রান চোখে দেখে নিশ্চিত হওয়া উচিত, বিশেষ করে fuzz
  step এখন build-blocking বলে।
- মিউটেশন স্কোর এখনো informational — পরবর্তী কোনো সেশনে চাইলে
  `calcInvoiceTotal`-এর আশেপাশের survived mutant-গুলোর (optional chaining,
  discount-ratio branch) জন্য নতুন edge-case টেস্ট যোগ করে স্কোর ৮০%-এর
  দিকে নেওয়া যায় — এটা এই সেশনের স্কোপে ছিল না, ইচ্ছাকৃতভাবে বাদ রাখা
  হয়েছে (শুধু threshold বসানো, নতুন টেস্ট লেখা না)।
- পরের সেশনে **ফেজ B** (স্তর ২: real emulator-integration টেস্ট, B1–B4)
  দিয়ে শুরু করা যাবে — এতে Firebase emulator লাগবে, যা এই ওয়েব sandbox-এ
  চালানো সম্ভব নাও হতে পারে (network নির্ভরতা); কোড লিখে দেওয়া গেলেও
  সেক্ষেত্রে স্পষ্টভাবে জানাতে হবে কোনটা sandbox-এ চালিয়ে যাচাই করা হয়েছে
  বনাম কোনটা শুধু কোড-রিভিউ করে ধরে নেওয়া হয়েছে।

**কনসিকুয়েন্স:** কোনো অ্যাপ ডেটা/হিসাব/সিঙ্ক লজিক বদলায়নি, তাই দোকানের
ডেটার ঝুঁকি নেই। ঝুঁকি শুধু বিল্ড-পাইপলাইনে: fuzz test এখন blocking, তাই
যদি কখনো সত্যিই flaky হয় (এই সেশনে sandbox-এ ১০/১০ প্রমাণিত না হলেও),
ভবিষ্যতে অকারণে build আটকাতে পারে — সেটার প্রথম সংকেত হবে আসল CI রানে।

---

### ২২ জুলাই ২০২৬ (প্রথম সেশন) — প্ল্যান তৈরি

**কেন:** আগের সেশনে (একদিন আগে, অন্য চ্যাটে) sandbox/ফাইল-টুল সাময়িকভাবে
সাড়া দেয়নি বলে ৪-স্তর রিলায়েবিলিটি ইমপ্লিমেন্টেশন প্ল্যান (ফেজ A–D)
টেক্সট আকারেই থেকে গিয়েছিল, ফাইলে বসানো/zip করা যায়নি — সেই সেশনেই এরপর
ব্যবহারকারীর ব্যবহারের সীমা শেষ হয়ে যায়। ব্যবহারকারী এই সেশনে স্ক্রিনশট
দেখিয়ে প্ল্যানটা `ENTERPRISE_MONITORING_PLAN.md` ফাইলে বসাতে এবং সাথে
বর্তমান repo-তে আসলে কী আছে তা যাচাই করে "লেটেস্ট" অবস্থাসহ চেকবক্স-লিস্ট
তৈরি করতে বলেন।

**কী করা হলো:**
- নতুন ফাইল `ENTERPRISE_MONITORING_PLAN.md` (repo root) তৈরি করা হয়েছে —
  স্ক্রিনশটে থাকা ৪-ফেজ প্ল্যান (A1–A3, B1–B4, C1–C3, D1–D3) হুবহু রাখা
  হয়েছে, প্রতিটার পাশে `[ ]` চেকবক্স।
- প্ল্যান বসানোর আগে "বর্তমান অবস্থা" টেবিলের প্রতিটা দাবি আসল repo পড়ে
  পুনঃযাচাই করা হয়েছে (অনুমান না): `package.json`-এর scripts (`test:fuzz`,
  `test:mutation`), `stryker.conf.json`-এর `thresholds.break: null`,
  `.github/workflows/build-apk.yml`-এ `firestore-rules` জব `build`-এর
  `needs:` হিসেবে বাধ্যতামূলক গেট থাকা কিন্তু `test:fuzz`-এ এখনো
  `continue-on-error: true` থাকা, `src/App.jsx`-এ central error logging
  (`app_errors` কালেকশন) থাকা কিন্তু periodic invariant-check/kill-switch
  না থাকা, এবং `tests/rules-tests.mjs`-এ Auth-গ্যাপ ট্র্যাক করা canary
  টেস্টের অস্তিত্ব — সবগুলোই স্ক্রিনশটের টেবিলের সাথে হুবহু মিলেছে,
  নতুন কোনো গ্যাপ পাওয়া যায়নি।
- `CLAUDE.md`-এর সেশন-হিস্টোরিতে এই এন্ট্রি যোগ করা হয়েছে।

**পরিবর্তনের ফল:** কোনো অ্যাপ কোড (App.jsx/logic.js/sync.js/schemas.js/
rules/CI workflow) ছোঁয়া হয়নি — শুধু ডকুমেন্টেশন (নতুন
`ENTERPRISE_MONITORING_PLAN.md` + `CLAUDE.md` আপডেট)। ৮টা প্রায়োরিটি-এলাকার
কোনোটাই runtime-এ প্রভাবিত হয়নি, তাই কোনো রিগ্রেশন-টেস্ট রান করার দরকার
হয়নি।

**ভবিষ্যতে মাথায় রাখতে হবে:** পরের সেশনে সরাসরি ফেজ A (A1: fuzz test
CI-blocking করা) দিয়ে শুরু করা যাবে — `ENTERPRISE_MONITORING_PLAN.md`
ফাইলের চেকবক্স দেখে কোথা থেকে শুরু করতে হবে বোঝা যাবে। ফেজ B ও C-এর কাজে
Firebase emulator লাগবে, যা এই ওয়েব sandbox-এ চালানো সম্ভব নাও হতে পারে —
সেক্ষেত্রে কোড লিখে দেওয়া যাবে কিন্তু বাস্তবে চালিয়ে যাচাই করা হয়েছে এমন
দাবি করা যাবে না, স্পষ্টভাবে জানাতে হবে।

**কনসিকুয়েন্স:** এই সেশনে কোনো কোড পরিবর্তন হয়নি, তাই ডেটা/হিসাব/সিঙ্কে
কোনো ঝুঁকি নেই।

---

### ২১ জুলাই ২০২৬

**কেন:** ব্যবহারকারী পুরো প্রজেক্ট (zip) + CLAUDE.md খসড়া আপলোড করে ফাইলগুলো
ভালোভাবে চেক করতে বলেন, এবং সেশনের শুরুতে CLAUDE.md-তে দুটো নতুন
টপ-প্রায়োরিটি নিয়ম যোগ করতে বলেন।

**কী করা হলো:**
- পুরো repo (SBM-main.zip) যাচাই করা হয়েছে: `npm test` চালিয়ে দেখা হয়েছে
  (logic 43/43, integration 10/10, sync 24/24, rules-sync ✅ পাস; schema-tests
  শুধু এই sandbox-এ `zod` ইনস্টল না থাকায় চালানো যায়নি — কোডের সমস্যা না)।
- `.github/workflows/build-apk.yml` পড়ে নিশ্চিত করা হয়েছে যে
  `firestore-rules` জব (drift-check + emulator rules test) সত্যিই `build`
  জবের আগে `needs:` হিসেবে বাধ্যতামূলক, এবং `test:fuzz` সত্যিই
  `continue-on-error: true` (এখনো non-blocking)।
- `tests/rules-tests.mjs`-এ Auth-গ্যাপ ট্র্যাক করা canary টেস্টের অস্তিত্ব
  যাচাই করা হয়েছে।
- খসড়া `CLAUDE.md`-এর প্রতিটা দাবি বাস্তব রিপোর সাথে মিলিয়ে সঠিক পাওয়া গেছে।
- `CLAUDE.md`-এ দুটো নতুন টপ-প্রায়োরিটি সেকশন যোগ করা হয়েছে: (১) আউটপুট
  ফরম্যাট নিয়ম — future সেশনে শুধু পরিবর্তিত ফাইল, GitHub-পাথ অনুযায়ী
  স্ট্রাকচার্ড zip দিতে হবে, (২) এই "সেশন হিস্টোরি" লগ — প্রতি সেশনে
  বাধ্যতামূলক এন্ট্রি যোগ করার নিয়ম।

**পরিবর্তনের ফল:** কোনো অ্যাপ কোড (App.jsx/logic.js/sync.js/schemas.js/
rules) ছোঁয়া হয়নি — শুধু ডকুমেন্টেশন (CLAUDE.md)। ৮টা প্রায়োরিটি-এলাকার
কোনোটাই runtime-এ প্রভাবিত হয়নি।

**ভবিষ্যতে মাথায় রাখতে হবে:** `CLAUDE.md` এখনো repo root-এ কমিট করা হয়নি —
পরবর্তী ধাপে এই ফাইলটা `SBM-main/CLAUDE.md` হিসেবে বসাতে হবে। এরপর থেকে
প্রতিটা সেশনে এই "সেশন হিস্টোরি" সেকশনে এন্ট্রি যোগ করা এবং আউটপুট শুধু
changed-files zip আকারে দেওয়া — দুটোই বাধ্যতামূলক, স্কিপ করা যাবে না।

**কনসিকুয়েন্স:** এই সেশনে কোনো কোড পরিবর্তন হয়নি, তাই ডেটা/হিসাব/সিঙ্কে
কোনো ঝুঁকি নেই। schema-tests এই sandbox-এ চালানো যায়নি (নির্ভরতা ইনস্টল
সমস্যা) — এটা placeholder/অনুমান না, বাস্তবে `zod` মডিউল না পাওয়ার এরর দেখেই
নিশ্চিত হওয়া হয়েছে যে এটা কোডের বাগ না, sandbox network/peer-dep সীমাবদ্ধতা।

---

### ২২ জুলাই ২০২৬

**কেন:** ব্যবহারকারী ফেজ B কনফার্ম হওয়ার পর ফেজ C ও D শুরু করতে বলেন
(ENTERPRISE_MONITORING_PLAN.md-এর স্তর ৩ ও ৪)।

**কী করা হলো:**
- **ফেজ C (কোড-সম্পূর্ণ, C1-C3):** `tests/canary-tests.mjs` নতুন ফাইল —
  emulator-এ ইনভয়েস→সিঙ্ক→ব্যাকআপ→রিস্টোর→ভয়েড, real `calcInvoiceTotal()`/
  `calcVoidNetChange()`/`pickBackupFields()`/`diffBackupFields()`/
  `hashCollection()` ব্যবহার করে, sequential step-tracking সহ (কোন ধাপে
  fail করলো তা স্পষ্ট রিপোর্ট)। `package.json`-এ `test:canary` স্ক্রিপ্ট।
  `.github/workflows/build-apk.yml`-এ নতুন `release-canary` জব যোগ করে
  `build` জবকে গেট করা হয়েছে (`needs: [firestore-rules, release-canary]`)।
- **ফেজ D/D1 (সম্পূর্ণ, sandbox-ভেরিফাইড):** `src/logic.js`-এ pure
  `runInvariantChecks()` (নেগেটিভ স্টক + ক্যাশ-ড্রয়ার mismatch)।
  `tests/logic-tests.mjs`-এ ৭টা নতুন কেস — sandbox-এ চালিয়ে ৫০/৫০ পাস।
  App.jsx-এ প্রতি ২০ মিনিটে (+ ready হওয়ার সাথে সাথে একবার)
  `buildDailySummaryData()` থেকে aggregate নিয়ে `runInvariantChecks()` কল,
  violation পেলে `logErrorToCentral("invariant_check:<type>", ...)`।
- **ফেজ D/D2 (আংশিক):** নতুন ড্যাশবোর্ড পেজ বানানো হয়নি, বিদ্যমান Errors
  ট্যাব reuse — `ERROR_KB`-এ ৪টা নতুন এন্ট্রি (invariant_check-এর তিন
  ধরন + kill_switch) Bengali cause/solution সহ, আর একটা "শুধু ইনভ্যারিয়েন্ট
  অ্যালার্ট" কুইক-ফিল্টার বাটন।
- **ফেজ D/D3 (মূল অংশ সম্পূর্ণ):** `FSS._syncHalted`/`FSS.setSyncHalted()` —
  `setRecord()`/`setRecordMerge()`/`deleteRecord()` (সব collection-এর একমাত্র
  write path) এখন এই ফ্ল্যাগ চেক করে। App.jsx-এ `admin_config/appVersion`-এর
  real-time listener — `haltSync:true` দেখলে সাথে সাথে সিঙ্ক বন্ধ + একবার
  `app_errors`-এ লগ। `admin.html`-এর Update ট্যাবে নতুন কিল-সুইচ টগল কার্ড।
  পাশাপাশি একটা লুকানো bug ফিক্স হয়েছে: `unpublishUpdate()` আগে পুরো
  `admin_config/appVersion` ডকুমেন্ট `deleteDoc()` করত, যা এখন কিল-সুইচ
  ফিল্ডও একই ডকুমেন্টে থাকায় নিঃশব্দে কিল-সুইচ বন্ধ করে দিত — এখন
  `updateDoc()` + `deleteField()` দিয়ে শুধু আপডেট-ফিল্ড মোছা হয়। "পুরনো
  ভার্সনে রোলব্যাক" অংশ নতুন কোড লেখা হয়নি — ডিজাইন নোট
  ENTERPRISE_MONITORING_PLAN.md-এ লেখা আছে।
- সব পরিবর্তনের পর sandbox-এ চালানো হয়েছে: `npm test` (logic 50/50, schema
  14/14, integration 10/10, sync 24/24, rules-sync ✅), `npm run typecheck`
  (০ এরর), `npm run lint` (০ এরর, শুধু pre-existing warning), `npx esbuild
  src/App.jsx` (সিনট্যাক্স ✅), `node --check` দিয়ে canary script ও
  admin.html-এর module script দুটোই সিনট্যাক্স-ভ্যালিড, এবং
  `.github/workflows/build-apk.yml` YAML পার্স করে job-graph নিশ্চিত করা।

**পরিবর্তনের ফল:** পরিবর্তিত ফাইল — `src/logic.js`, `src/App.jsx`,
`tests/logic-tests.mjs`, `tests/canary-tests.mjs` (নতুন), `package.json`,
`.github/workflows/build-apk.yml`, `netlify-site/admin.html`,
`ENTERPRISE_MONITORING_PLAN.md`। কোনো বিদ্যমান ফাংশনের সিগনেচার/আচরণ
বদলানো হয়নি — শুধু নতুন গেটেড-off ফাংশনালিটি (কিল-সুইচ ডিফল্ট `false`,
periodic চেক শুধু লগ করে ব্লক করে না) যোগ হয়েছে।

**কনসিকুয়েন্স:** `tests/canary-tests.mjs` এই sandbox-এ real Firestore
Emulator-এ রান করে ভেরিফাই করা যায়নি (network egress-এ
`storage.googleapis.com` নেই, ঠিক ফেজ B-এর মতোই একই সীমাবদ্ধতা) — কোড
sync-emulator-tests.mjs-এর প্রমাণিত প্যাটার্ন অনুসরণ করে লেখা, কিন্তু আসল
CI রান-ই এর প্রথম বাস্তব যাচাই হবে। App.jsx-এর নতুন periodic
invariant-check ও kill-switch effect দুটোও sandbox-এ শুধু static
(syntax/lint/typecheck) ভাবে যাচাই করা হয়েছে — real browser/device-এ
এখনো টেস্ট হয়নি, তবে ডিফল্ট আচরণ অপরিবর্তিত থাকায় (halted=false, শুধু
console-log স্তরের নতুন কোড) ঝুঁকি কম। GitHub-এ আপলোডের পর অবশ্যই
build workflow-এর `release-canary` জব pass করছে কিনা দেখে নিশ্চিত হতে হবে।

---

### ২২ জুলাই ২০২৬ (দ্বিতীয় সেশন — একই দিনে)

**কেন:** ব্যবহারকারী প্রথমে সব `.md` ফাইল (ENTERPRISE_MONITORING_PLAN,
ENTERPRISE_ROADMAP, FIREBASE_AUTH_ROADMAP, PHASE0_NOTES) চেক করে একটা
সম্পূর্ণ বাকি-কাজের লিস্ট চাইলেন, তারপর সেই লিস্ট থেকে নির্দিষ্টভাবে D2 ও D3
(বাকি অংশ) সম্পূর্ণ করতে বলেন — Sentry ও server-side validation-এর জন্য
আলাদা সিদ্ধান্ত/ইনপুট লাগে বলে সেগুলো এই সেশনে বাদ দেওয়া হয়েছে।

**কী করা হলো:**
- **D2 (Dashboard badge):** `admin.html`-এর Dashboard ট্যাবে নতুন
  "⚠️ N ইনভ্যারিয়েন্ট অ্যালার্ট" কার্ড — কোনো নতুন Firestore কোয়েরি ছাড়াই
  বিদ্যমান `_errorsCache`-থেকে (Errors ট্যাবের জন্য ইতিমধ্যেই fetch করা)
  unresolved + `invariant_check`-প্রিফিক্স গুনে দেখায়, ০ থাকলে লুকানো,
  ১+ হলে লাল হয়ে দেখা যায়, ট্যাপ করলে সরাসরি ফিল্টার-করা Errors ট্যাবে যায়।
  `loadErrors()` লগইনের সময়ও কল হয় এখন, তাই ব্যাজ Errors ট্যাব না খুলেও
  দেখা যায়।
- **D3 (downgrade rollback):** `admin_config/appVersion.rollbackMode:true`
  ফ্ল্যাগ — `src/App.jsx`-এর `AppVersionCard`-এ `compareVersions()` গেট
  বাইপাস করে (higher-version-এই সীমাবদ্ধ থাকে না), কার্ডে "⏪ রোলব্যাক"
  ব্যাজ ও আলাদা কপি দেখায়। এখনো সম্পূর্ণ নীরব/optional কার্ড, কোনো জোরপূর্বক
  লক তৈরি হয় না — বিদ্যমান "AppVersionCard কখনো popup/lock করে না" ডিজাইন
  অপরিবর্তিত রাখা হয়েছে। `admin.html`-এর Update ফর্মে নতুন "⏪ রোলব্যাক মোড"
  টগল, `publishUpdate()`/`unpublishUpdate()`/`prefillUpdateForm()`/
  `loadCurrentUpdate()` সবগুলো আপডেট হয়েছে।
- সব পরিবর্তনের পর sandbox-এ চালানো হয়েছে: `npx esbuild src/App.jsx`
  (সিনট্যাক্স ✅), `node --check` দিয়ে admin.html-এর module script
  সিনট্যাক্স-ভ্যালিড, `npm test` (সব পাস, rules-sync-সহ), `npm run lint`
  (০ এরর, নতুন কোনো warning যোগ হয়নি — এখনো ৪০৪টাই পুরনো)।

**পরিবর্তনের ফল:** পরিবর্তিত ফাইল — `src/App.jsx`, `netlify-site/admin.html`,
`ENTERPRISE_MONITORING_PLAN.md`। কোনো বিদ্যমান ফাংশনের সিগনেচার/আচরণ
বদলানো হয়নি — `rollbackMode` ও ড্যাশবোর্ড-ব্যাজ দুটোই ডিফল্ট অবস্থায়
(`rollbackMode` অনুপস্থিত/false, `_errorsCache` খালি) সম্পূর্ণ নিষ্ক্রিয়/অদৃশ্য
থাকে — কোনো বিদ্যমান দোকানের আচরণে কোনো পরিবর্তন নেই যতক্ষণ না admin
সচেতনভাবে টগল চালু করেন।

**কনসিকুয়েন্স:** দুটো পরিবর্তনই sandbox-এ শুধু static (syntax/lint) ভাবে
যাচাই করা হয়েছে — real ব্রাউজার/ডিভাইসে/অ্যাডমিন প্যানেলে চালিয়ে দেখা হয়নি।
GitHub-এ আপলোডের পর অন্তত একবার admin.html-এ লগইন করে (ক) Dashboard-এ
badge দেখা যাচ্ছে কিনা (একটা টেস্ট invariant_check এরর ম্যানুয়ালি
`app_errors`-এ বসিয়ে), এবং (খ) Update ফর্মে রোলব্যাক টগল চালু করে একটা
পুরনো ভার্সন নাম্বার দিয়ে প্রকাশ করে দেখা উচিত অ্যাপে (dev/staging শপে)
কার্ডটা আসলেই দেখা যাচ্ছে কিনা — নিশ্চিত হওয়া ভালো।
