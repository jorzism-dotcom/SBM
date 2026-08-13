// ─── tests/helpers/vite-node-loader.mjs ────────────────────────────────────
// DataStore.js প্রোডাকশন কোড (অপরিবর্তিত) দুইটা Vite/Capacitor-specific জিনিস
// ব্যবহার করে যা plain Node.js বোঝে না:
//   ১. import "@capacitor-community/sqlite"       — native bridge প্লাগইন
//   ২. import "./schema.sql?raw"                   — Vite-এর raw-text import
// এই Node ESM loader hook দুটো জিনিসই resolve/load সময়ে ইন্টারসেপ্ট করে
// রিডাইরেক্ট করে, যাতে DataStore.js-এর আসল সোর্স ফাইলে একটুও পরিবর্তন না করে
// প্লেইন `node` দিয়ে সরাসরি টেস্ট চালানো যায়।
//
// ব্যবহার (কলার ফাইলে, DataStore.js import করার আগেই):
//   import { register } from "node:module";
//   register("./helpers/vite-node-loader.mjs", import.meta.url);

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

const SHIM_URL = new URL("./capacitor-sqlite-shim.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@capacitor-community/sqlite") {
    return { url: SHIM_URL, shortCircuit: true };
  }
  if (specifier.endsWith("?raw")) {
    const bare = specifier.slice(0, -"?raw".length);
    const resolved = await nextResolve(bare, context);
    // আসল ফাইল-পাথ resolve করার পর "?raw" সাফিক্স ফিরিয়ে রাখা হচ্ছে যাতে load()
    // হুক চিনতে পারে এটা raw-text import, সাধারণ JS module না।
    return { ...resolved, url: `${resolved.url}?raw`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith("?raw")) {
    const filePath = fileURLToPath(url.slice(0, -"?raw".length));
    const source = readFileSync(filePath, "utf-8");
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${JSON.stringify(source)};`,
    };
  }
  return nextLoad(url, context);
}
