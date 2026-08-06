// ─── src/sync.js ─────────────────────────────────────────────────────────────
// #৮ (অটো বাগ ডিটেকশন)-এর এন্টারপ্রাইজ ধাপ: সিঙ্ক ও ব্যাকআপের "pure" লজিক
// (যেখানে React state/hooks/Firebase SDK সরাসরি জড়িত না) App.jsx থেকে এখানে
// আলাদা করা হলো — src/logic.js যেমন বিজনেস-ফর্মুলার জন্য করা হয়েছিল, ঠিক
// একই প্যাটার্নে। কারণ: App.jsx-এর ভেতরে থাকলে tests/logic-tests.mjs,
// tests/logic-fuzz.mjs, @ts-check — কোনোটাই এই কোড ছুঁতে পারত না, তাই
// সিঙ্ক/ব্যাকআপ-এডিট করলে অন্য কোথাও ভাঙল কিনা ধরার কোনো অটোমেটেড উপায় ছিল না।
//
// এই ফাইলে যা আছে তার প্রতিটাই App.jsx-এর হুবহু আগের লজিক (আচরণ বদলানো হয়নি,
// শুধু জায়গা বদলেছে) — ব্যতিক্রম শুধু mergeCollection(), যেটা আগে
// performMasterSync()-এর ভেতরে inline লেখা ছিল, এখানে একটা আলাদা pure
// ফাংশন হিসেবে বের করা হলো যাতে মাল্টি-ডিভাইস conflict-resolution নীতি
// (last-write-wins + tombstone) সরাসরি টেস্ট করা যায়।
//
// App.jsx এই ফাইল থেকেই import করে (ডুপ্লিকেট সংজ্ঞা নেই) — তাই এখানে বাগ
// ফিক্স করলে App.jsx-এও সাথে সাথে প্রতিফলিত হয়, এবং tests/sync-tests.mjs
// প্রতিটা পুশে (CI) এই ফাইলটাই সরাসরি টেস্ট করে।

// ── কেন্দ্রীয় ব্যাকআপ ফিল্ড-রেজিস্ট্রি (v6) ─────────────────────────────────
export const FSS_COLLECTIONS = [
  "customers", "products", "invoices", "txns", "smsLog", "suppliers",
  "purchaseOrders", "stockMovements", "cashLogs", "paymentInvoices",
  "expenses", "returns", "auditLogs", "quotations", "supplierPayments",
  "deletedProducts", "deletedCustomers", "staffLedger", "serialQueue",
];
export const BACKUP_FIELDS = [...FSS_COLLECTIONS, "users"];

export const BACKUP_FIELD_LABELS_BN = {
  customers: "কাস্টমার", products: "পণ্য", invoices: "ইনভয়েস", txns: "লেনদেন",
  smsLog: "SMS লগ", suppliers: "সাপ্লায়ার", purchaseOrders: "ক্রয় অর্ডার",
  stockMovements: "স্টক মুভমেন্ট", cashLogs: "ক্যাশ লগ", paymentInvoices: "পেমেন্ট ইনভয়েস",
  expenses: "খরচ", returns: "রিটার্ন", auditLogs: "অডিট লগ", quotations: "কোটেশন",
  supplierPayments: "সাপ্লায়ার পেমেন্ট", deletedProducts: "মোছা পণ্য",
  deletedCustomers: "মোছা কাস্টমার", users: "ইউজার", staffLedger: "স্টাফ লেজার",
  serialQueue: "টোকেন কিউ",
};

// ── ব্যাকআপ পেলোড থেকে শুধু রেজিস্ট্রিতে-থাকা ফিল্ড বাছাই ─────────────────────
export function pickBackupFields(data) {
  const out = {};
  BACKUP_FIELDS.forEach(f => { if (data && data[f] !== undefined) out[f] = data[f]; });
  return out;
}

// ── (২ আগস্ট ২০২৬) খালি-ব্যাকআপ গার্ড ────────────────────────────────────────
// মূল বাগ: অটো ব্যাকআপ সাইকেল (Drive/local file/IndexedDB snapshot) React
// state থেকেই payload বানায় — আর boot/প্রথম Firestore-sync এখনো শেষ না হলে
// (বিশেষত `loaded`/`settingsLoaded` লোকাল-বুট গার্ড true হয়ে গেলেও Firestore
// listener-এর প্রথম ডেটা তখনো না আসলে) customers/products ইত্যাদি সাময়িকভাবে
// খালি অ্যারে থাকে। এই মুহূর্তে অটো-সাইকেল চলে গেলে আসল ব্যাকআপের জায়গায় একটা
// সম্পূর্ণ খালি স্ন্যাপশট লেখা/আপলোড হয়ে যায় (single-slot/rotating-slot ওভাররাইট),
// আর পরে "রিস্টোর" করলে সেই খালি ব্যাকআপ থেকেই রিস্টোর হয় — RestoreSelfTest.evaluate()
// একই সিগন্যাল (totalRecords === 0) ব্যবহার করে শুধু *ধরে* (health card-এ লাল ব্যাজ),
// কিন্তু লেখা *আটকায়* না। এই হেল্পার সেই একই চেক — write-করার আগেই কল করে অটো-সাইকেল
// স্কিপ করানোর জন্য (ম্যানুয়াল বাটন ইচ্ছাকৃতভাবে ব্লক করা হয়নি — ইউজারের স্পষ্ট ক্লিক)।
export function hasAnyBackupRecords(payload) {
  return BACKUP_FIELDS.some(f => Array.isArray(payload?.[f]) && payload[f].length > 0);
}

// ── রিস্টোর-গার্ড টাইমআউট (রেকর্ড-সংখ্যা অনুযায়ী adaptive, ৫s–৩০s) ──────────
export function computeRestoreGuardMs(payload) {
  const totalRecords = BACKUP_FIELDS.reduce(
    (s, f) => s + (Array.isArray(payload?.[f]) ? payload[f].length : 0), 0
  );
  return Math.min(30000, 5000 + totalRecords * 10);
}

// ── রিস্টোর প্রিভিউ (dry-run) — বর্তমান বনাম ব্যাকআপ ফাইলের ডেটা তুলনা ─────────
export function diffBackupFields(currentData, incomingData) {
  if (!incomingData) return { rows: [], totalAdded: 0, totalRemoved: 0, totalChanged: 0 };
  const rows = [];
  let totalAdded = 0, totalRemoved = 0, totalChanged = 0;
  BACKUP_FIELDS.forEach(f => {
    if (incomingData[f] === undefined) return;
    const curArr = Array.isArray(currentData?.[f]) ? currentData[f] : [];
    const newArr = Array.isArray(incomingData[f]) ? incomingData[f] : [];
    const curMap = {}; curArr.forEach(r => { if (r?.id != null) curMap[r.id] = r; });
    const newIds = new Set();
    let added = 0, changed = 0;
    newArr.forEach(r => {
      if (r?.id == null) return;
      newIds.add(r.id);
      const prev = curMap[r.id];
      if (!prev) { added++; return; }
      try { if (JSON.stringify(prev) !== JSON.stringify(r)) changed++; } catch {}
    });
    let removed = 0;
    curArr.forEach(r => { if (r?.id != null && !newIds.has(r.id)) removed++; });
    if (curArr.length || newArr.length) {
      rows.push({ field: f, label: BACKUP_FIELD_LABELS_BN[f] || f, curCount: curArr.length, newCount: newArr.length, added, removed, changed });
      totalAdded += added; totalRemoved += removed; totalChanged += changed;
    }
  });
  return { rows, totalAdded, totalRemoved, totalChanged };
}

// ── প্রতি-রেকর্ড content-hash (FNV-1a, XOR-combined — অর্ডার-নিরপেক্ষ) ──────
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export function hashRecord(rec) {
  if (!rec || typeof rec !== "object") return 0;
  try {
    const keys = Object.keys(rec).sort();
    let stable = "";
    for (const k of keys) stable += k + ":" + JSON.stringify(rec[k]) + "|";
    return hashString(stable);
  } catch { return 0; }
}
export function hashCollection(arr) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  let h = 0;
  for (const rec of arr) h ^= hashRecord(rec);
  return (h >>> 0).toString(36);
}
export function buildContentHashes(payload) {
  const out = {};
  BACKUP_FIELDS.forEach(f => { out[f] = hashCollection(payload[f]); });
  return out;
}

// ── ইনক্রিমেন্টাল/ডেল্টা সিঙ্ক — checkpoint hash অপরিবর্তিত থাকলে write স্কিপ ──
export function diffChangedFields(newHashes, prevHashes) {
  if (!prevHashes || typeof prevHashes !== "object") return { changed: true, fields: [...BACKUP_FIELDS] };
  const fields = BACKUP_FIELDS.filter(f => (newHashes[f] || 0) !== (prevHashes[f] || 0));
  return { changed: fields.length > 0, fields };
}

// ── কনফ্লিক্ট-রেজোলিউশন নীতি: রেকর্ডের "কার্যকর সময়" ──────────────────────────
// _serverTs (Firestore server timestamp) থাকলে সেটাই প্রাধান্য পায় (device
// clock স্ক্রু হলেও ঠিক থাকে); না থাকলে client-লিখিত _updatedAt fallback।
export const effectiveTs = (rec) => (rec?._serverTs != null ? rec._serverTs : (rec?._updatedAt || 0));

// ── মাল্টি-ডিভাইস মার্জ — Master Sync-এর মূল কনফ্লিক্ট-রেজোলিউশন নীতি ─────────
// নীতি (last-write-wins by effectiveTs + tombstone protection):
//   ১. local ও remote (Drive) দুটোতেই থাকা রেকর্ড: যেটার effectiveTs বেশি সেটা জেতে।
//   ২. শুধু remote-এ থাকা রেকর্ড: যোগ হয় — *যদি* tombstoneIds (ইচ্ছাকৃতভাবে
//      মোছা/রিসাইকেল বিনে পাঠানো id-সেট)-এ না থাকে। tombstone-এ থাকলে বাদ —
//      এটাই "মুছে ফেলা রেকর্ড যেন remote ব্যাকআপ থেকে ভূতের মতো ফিরে না আসে"
//      (data-resurrection bug fix) নীতির মূল প্রয়োগস্থল।
//   ৩. শুধু local-এ থাকা রেকর্ড: অপরিবর্তিত থাকে (merge কখনো local-only ডেটা মোছে না)।
//   ৪. remoteArr খালি হলে localArr অপরিবর্তিত ফেরত — কোনো অহেতুক write/change flag না।
// রিটার্ন করে { merged, changed } — changed=true মানে caller-কে setter কল +
// Firestore push (write) করতে হবে; false মানে সম্পূর্ণ স্কিপযোগ্য।
export function mergeCollection(localArr, remoteArr, tombstoneIds) {
  const local = Array.isArray(localArr) ? localArr : [];
  const remote = Array.isArray(remoteArr) ? remoteArr : [];
  if (!remote.length) return { merged: local, changed: false };

  const tombstones = tombstoneIds instanceof Set ? tombstoneIds : new Set(tombstoneIds || []);
  let changed = false;
  const merged = new Map();
  local.forEach(r => { if (r?.id != null) merged.set(String(r.id), r); });

  remote.forEach(dr => {
    if (dr?.id == null) return;
    const key = String(dr.id);
    if (tombstones.has(key)) return; // ইচ্ছাকৃতভাবে মোছা — resurrect করা যাবে না
    const existing = merged.get(key);
    if (!existing || effectiveTs(dr) > effectiveTs(existing)) {
      merged.set(key, dr);
      changed = true;
    }
  });

  const mergedArr = Array.from(merged.values());
  if (mergedArr.length !== local.length) changed = true;
  return { merged: mergedArr, changed };
}

// ── সব BACKUP_FIELDS collection-এর জন্য mergeCollection() একসাথে চালানো ─────
// localState: { colName: array }, remoteState: { colName: array } (শুধু যেসব
// কী merge-যোগ্য — users/deletedProducts/deletedCustomers এখানে থাকে না,
// কারণ এগুলো সবসময় সরাসরি local state থেকে নেওয়া হয়, merge হয় না)।
// deletedIdSets: { customers: Set, products: Set } — recycle-bin tombstone।
export function mergeAllCollections(localState, remoteState, deletedIdSets = {}) {
  const result = {}; // colName -> { merged, changed }
  Object.keys(localState).forEach(colName => {
    const tombstones = deletedIdSets[colName];
    result[colName] = mergeCollection(localState[colName], remoteState?.[colName], tombstones);
  });
  return result;
}
