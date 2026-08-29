# SBM Instant Boot v3

## লক্ষ্য
অ্যাপ চালু হলে Products, Customers এবং Dashboard-এর UI যেন সর্বশেষ known-good local snapshot থেকে সঙ্গে সঙ্গে render হয়। SQLite/IndexedDB authoritative data background-এ hydrate/revalidate করবে।

## পরিবর্তিত ফাইল
- `src/App.jsx`
  - `sbm_instant_boot_v3` localStorage hot snapshot যোগ করা হয়েছে।
  - Zustand store-এর initial state snapshot থেকে synchronousভাবে hydrate হয়।
  - Products/Customers/Dashboard-সম্পর্কিত সাম্প্রতিক operational data snapshot-এ রাখা হয়।
  - authoritative async boot শেষ না হওয়া পর্যন্ত persistence/SQLite dual-write effect cached snapshot-কে database-এ overwrite করতে পারে না।
  - authoritative boot শেষ হলে snapshot debounce করে refresh হয়।
- `src/db/DataStore.js`
  - `EXPLAIN QUERY PLAN`-কে production critical path থেকে সরানো হয়েছে। এটি এখন explicit diagnostic flag-এর পেছনে।
  - প্রথম Products/Customers query-তে আর diagnostic EXPLAIN round-trip হয় না।

## Boot flow

App open → synchronous hot snapshot → UI paint → SQLite/IndexedDB boot → authoritative state patch → silent UI refresh → hot snapshot update

## গুরুত্বপূর্ণ সীমাবদ্ধতা
প্রথমবার এই build চালানোর সময় যদি `sbm_instant_boot_v3` snapshot না থাকে, পুরনো database boot path একবার চলবে। সেই boot শেষ হলে snapshot তৈরি হবে। পরবর্তী app open-গুলোতে instant boot পাওয়া যাবে।

Snapshot database নয়; SQLite/IndexedDB-ই source of truth। Snapshot quota-safe এবং বড় হলে products/customers-এর cached portion সীমিত করে।
