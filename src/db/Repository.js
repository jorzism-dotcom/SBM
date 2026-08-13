// ─── src/db/Repository.js ───────────────────────────────────────────────────
// SBM Repository লেয়ার (Phase ২, PHASE_3_4_5_FINAL_PLAN_v2.md)।
//
// উদ্দেশ্য (Strangler Fig প্যাটার্ন): App.jsx-এর কল-সাইটগুলো সরাসরি
// `products.find(...)`/`customers.find(...)` না করে এই মডিউলের ফাংশন কল করবে।
// এতে ভবিষ্যতে ডেটা-সোর্স (array → SQLite) বদলাতে হলে শুধু এই ফাইলের ভেতরটা
// বদলালেই হবে — App.jsx-এর বাকি ৪০ হাজার লাইন স্পর্শ করা লাগবে না।
//
// ⚠️ এই মুহূর্তে (Phase ২) সব ফাংশন ভেতরে এখনো plain array-ই ব্যবহার করে —
// আচরণ ১০০% অপরিবর্তিত, শুধু ইন্টারফেস প্রস্তুত করা হচ্ছে। SQLite দিয়ে ভেতরটা
// বদলানো হবে পরের ধাপগুলোয় (হাইব্রিড সার্চ, write-through Map, ইত্যাদি) — প্ল্যান
// অনুযায়ী প্রতিটা category (pure-display lookup → transaction-critical lookup →
// list/pagination → dashboard) আলাদা ধাপে, ঝুঁকি অনুযায়ী ক্রমানুসারে।
//
// এই ফাইল framework-agnostic (কোনো React import নেই) — DataStore.js-এর মতোই।

/**
 * id দিয়ে একটা কাস্টমার খোঁজে — pure-display লুকআপ (কাস্টমার ডিটেইল স্ক্রিন)।
 * প্রথম Repository-ওয়্যার্ড কল-সাইট (App.jsx-এর detailCust)।
 * @param {Array} customers
 * @param {string} id
 * @returns {object|null}
 */
export function getCustomerById(customers, id) {
  if (!id || !Array.isArray(customers)) return null;
  return customers.find((c) => c.id === id) || null;
}

/**
 * id দিয়ে একটা প্রোডাক্ট খোঁজে — pure-display লুকআপ।
 * @param {Array} products
 * @param {string} id
 * @returns {object|null}
 */
export function getProductById(products, id) {
  if (!id || !Array.isArray(products)) return null;
  return products.find((p) => p.id === id) || null;
}

/**
 * id দিয়ে একটা ইনভয়েস খোঁজে — pure-display লুকআপ (প্রিন্ট/ডিটেইল ভিউ)।
 * ⚠️ transaction-critical জায়গায় (useAppStore.getState().invoices.find(...)
 * প্যাটার্নের কল-সাইট, race-condition-স্পর্শকাতর) এই ফাংশন ব্যবহার করবেন না —
 * সেগুলো Phase ৫ (write-through Map)-এর জন্য আলাদা রাখা, দেখুন প্ল্যান ডক।
 * @param {Array} invoices
 * @param {string} id
 * @returns {object|null}
 */
export function getInvoiceById(invoices, id) {
  if (!id || !Array.isArray(invoices)) return null;
  return invoices.find((i) => i.id === id) || null;
}

// ── ভবিষ্যতের জন্য প্লেসহোল্ডার (পরের ধাপে ইমপ্লিমেন্ট হবে) ──────────────────
// export async function searchProducts(businessType, products, query) { ... } — ধাপ ৪ (হাইব্রিড FTS5+score)
// export function listInvoicesPage(businessType, opts) { ... }             — ধাপ ৬ (SQLite queryPage)
