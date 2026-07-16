// ─── src/schemas.js ──────────────────────────────────────────────────────────
// প্রতিটা Firestore write-এর আগে ডেটার shape যাচাই (zod দিয়ে) — উদ্দেশ্য শুধু
// এইটুকু ধরা: টাকা-সংক্রান্ত ফিল্ড (total, qty, price, balance ইত্যাদি) কোথাও
// ভুলে NaN বা undefined হয়ে ঢুকে যাচ্ছে কিনা। ডেটা করাপশন প্রায়ই এখান থেকেই
// শুরু হয় (লজিক থেকে না) — একটা NaN একবার Firestore-এ লিখে ফেললে পরে সেটা
// থেকে হিসাব করা সবকিছুই নষ্ট হয়ে যায়।
//
// ⚠️ ডিজাইন সিদ্ধান্ত (ইচ্ছাকৃত, গুরুত্বপূর্ণ): এই স্কিমাগুলো "loose/passthrough"
// — অচেনা/অতিরিক্ত ফিল্ড থাকলে reject করে না, শুধু critical numeric ফিল্ড
// (NaN/undefined না হওয়া) আর মূল shape যাচাই করে। App.jsx-এ ৫০০+ জায়গায়
// ছড়িয়ে থাকা রেকর্ড শেপের সাথে ১০০% মিল নিশ্চিত করা এই মুহূর্তে সম্ভব না
// (রিয়েল ডিভাইসে টেস্ট ছাড়া), তাই কড়া/strict schema বসালে সচল, লাইভ দোকানে
// হঠাৎ ভ্যালিড কিন্তু "নতুন শেপের" write ব্লক হয়ে যাওয়ার ঝুঁকি থাকত।
//
// ⚠️ আরেকটা ইচ্ছাকৃত সিদ্ধান্ত: validateRecord() ব্যর্থ হলে write আটকায় না
// (soft/shadow mode) — শুধু console.warn + logErrorToCentral()-এ লগ হয়। এতে
// ভুল করে নতুন কোনো বৈধ শেপ ব্লক হয়ে ইনভয়েস/বিক্রি আটকে যাওয়ার ঝুঁকি নেই, কিন্তু
// সমস্যা হলে ধরা পড়বে এবং BUGFIX_LOG-এ ট্র্যাক করা যাবে। কিছুদিন লগ পর্যবেক্ষণ
// করে নিশ্চিত হলে (কোনো false-positive নেই), setRecord()-এ hard-reject মোডে
// পাল্টানো যায় — সেটা একটা আলাদা, সচেতন পরবর্তী ধাপ হওয়া উচিত।

import { z } from "zod";

// একটা সংখ্যা ফিল্ড যেটা undefined/null হলে ঠিক আছে (optional), কিন্তু present
// থাকলে অবশ্যই একটা finite সংখ্যা হতে হবে — NaN বা Infinity হলে ধরা পড়বে।
const finiteNum = () => z.number().finite().optional().nullable();
const finiteNumRequired = () => z.number().finite();

export const invoiceSchema = z.object({
  id: z.string().min(1),
  total: finiteNumRequired(),
  discount: finiteNum(),
  extraCharge: finiteNum(),
  bakiAmount: finiteNum(),
  overpayAmount: finiteNum(),
  payType: z.string().optional().nullable(),
  items: z.array(z.object({
    productId: z.union([z.string(), z.number()]).optional().nullable(),
    price: finiteNum(),
    qty: finiteNum(),
    costPrice: finiteNum(),
    itemDiscount: finiteNum(),
  }).passthrough()).optional(),
}).passthrough();

export const productSchema = z.object({
  id: z.union([z.string(), z.number()]),
  stock: finiteNum(),
  costPrice: finiteNum(),
  price: finiteNum(),
  batches: z.array(z.object({
    batchNo: z.string().optional().nullable(),
    qty: finiteNum(),
    costPrice: finiteNum(),
  }).passthrough()).optional(),
}).passthrough();

export const purchaseOrderSchema = z.object({
  id: z.string().min(1),
  items: z.array(z.object({
    productId: z.union([z.string(), z.number()]).optional().nullable(),
    qty: finiteNum(),
    costPrice: finiteNum(),
    price: finiteNum(),
  }).passthrough()).optional(),
}).passthrough();

export const cashLogSchema = z.object({
  id: z.string().min(1),
  amount: finiteNum(),
}).passthrough();

export const supplierPaymentSchema = z.object({
  id: z.string().min(1),
  amount: finiteNum(),
  supplierName: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
}).passthrough();

export const customerSchema = z.object({
  id: z.union([z.string(), z.number()]),
  balance: finiteNum(),
}).passthrough();

// coll (Firestore collection নাম) অনুযায়ী কোন schema ব্যবহার হবে তার ম্যাপ।
// যে collection এখানে নেই (settings, users, meta, stats, txns ইত্যাদি), সেগুলোর
// জন্য কোনো schema-validation চলে না (validateRecord সবসময় { valid: true } দেয়) —
// ইচ্ছাকৃত: শুধু টাকা-সংক্রান্ত/স্টক-সংক্রান্ত কালেকশনগুলোতেই এই মুহূর্তে ফোকাস।
const SCHEMA_MAP = {
  invoices: invoiceSchema,
  products: productSchema,
  purchaseOrders: purchaseOrderSchema,
  cashLogs: cashLogSchema,
  supplierPayments: supplierPaymentSchema,
  customers: customerSchema,
};

// validateRecord(coll, data) → { valid: boolean, errors?: string[] }
// কখনো throw করে না — কলিং কোডে try/catch লাগবে না।
export function validateRecord(coll, data) {
  const schema = SCHEMA_MAP[coll];
  if (!schema) return { valid: true }; // এই কালেকশনের জন্য কোনো schema নেই — pass
  try {
    const result = schema.safeParse(data);
    if (result.success) return { valid: true };
    const errors = result.error.issues.map(
      (iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`
    );
    return { valid: false, errors };
  } catch (e) {
    // schema নিজেই ভেঙে গেলেও validation ব্যর্থতা কখনো আসল write আটকাবে না
    return { valid: false, errors: [e?.message || "schema validation crashed"] };
  }
}
