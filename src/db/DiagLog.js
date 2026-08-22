// ─── src/db/DiagLog.js ───────────────────────────────────────────────────
// এন্ট্রি ১০৩ — ব্যবহারকারী রিপোর্ট করলেন এন্ট্রি ১০২-এর টাইমিং ডায়াগনস্টিক
// (console.log) ফোনে "চোখেই পড়েনি" — কারণ ব্যবহারকারী শুধু মোবাইল থেকেই কাজ
// করেন, PC/adb/Chrome remote-debugging নেই। console.log আসলে ঠিকভাবেই লেখা
// হচ্ছিল, কিন্তু সেটা দেখার কোনো উপায় ছিল না।
//
// এই মডিউল একটা ছোট in-memory + localStorage-persisted লগ রাখে, যাতে
// টাইমিং লাইনগুলো অ্যাপের ভেতরেই (সেটিংস → dev প্যানেল) দেখা যায়, কোনো
// PC/USB/adb ছাড়াই। console.log-ও এখনো হয় (যাদের remote-debug আছে তাদের
// জন্য) — শুধু অতিরিক্ত হিসেবে এই স্টোরেও যোগ হচ্ছে।

const MAX_ENTRIES = 60;
const STORAGE_KEY = "sbm_diag_log_v1";

let _entries = [];

function _safeLocalStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch (_) {
    return null;
  }
}

(function _load() {
  const ls = _safeLocalStorage();
  if (!ls) return;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (raw) _entries = JSON.parse(raw) || [];
  } catch (_) {
    _entries = [];
  }
})();

function _persist() {
  const ls = _safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(_entries));
  } catch (_) {
    /* কোটা/প্রাইভেট-মোড হলে নিরাপদে স্কিপ — in-memory স্টেট এখনো কাজ করবে */
  }
}

function _stamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// এন্ট্রি ১০৫ — index.html-এ একদম শুরুতে বসানো window.__appBootT0 থেকে
// "অ্যাপ চালু করা থেকে এই মুহূর্ত পর্যন্ত" সময় বের করে। এটাই "original time"
// (মোট সময়, কোনো একটা ধাপের আলাদা duration না) — প্রতিটা লগ লাইনে এই একই
// রেফারেন্স পয়েন্ট থাকলে সব লাইন একে অপরের সাথে তুলনাযোগ্য হয়।
export function bootElapsedMs() {
  const t0 = (typeof window !== "undefined" && window.__appBootT0) || null;
  return t0 ? Date.now() - t0 : null;
}

/**
 * একটা টাইমিং/ডায়াগনস্টিক লাইন লগ করে — console.log-এও যায় (remote-debug
 * ব্যবহারকারীদের জন্য), আর in-app প্যানেলের জন্য memory+localStorage-এও থাকে।
 * প্রতিটা লাইনের শেষে স্বয়ংক্রিয়ভাবে "boot+Xms" (অ্যাপ চালু করা থেকে মোট
 * সময়) জুড়ে দেওয়া হয় — আলাদা করে প্রতিটা কল-সাইটে হিসাব করা লাগে না।
 * @param {string} line
 */
export function logDiag(line) {
  const elapsed = bootElapsedMs();
  const full = elapsed !== null ? `${line} [boot+${elapsed}ms]` : line;
  console.log(full);
  const entry = `[${_stamp()}] ${full}`;
  _entries.unshift(entry);
  if (_entries.length > MAX_ENTRIES) _entries.length = MAX_ENTRIES;
  _persist();
}

/** @returns {string[]} সবচেয়ে নতুন এন্ট্রি প্রথমে */
export function getDiagLog() {
  return _entries.slice();
}

export function clearDiagLog() {
  _entries = [];
  _persist();
}
