// ─── tests/helpers/capacitor-sqlite-shim.mjs ───────────────────────────────
// @capacitor-community/sqlite-এর একটা মিনিমাল Node-only fake, শুধু DataStore.js
// যতটুকু API সারফেস আসলে ব্যবহার করে ততটুকুই কভার করে (query/execute/run/
// executeSet/open + connection lifecycle)। আসল Capacitor প্লাগইন native bridge-
// নির্ভর, তাই plain Node-এ import/চালানো যায় না — এই শিম দিয়ে DataStore.js-এর
// আসল (অপরিবর্তিত) কোড এই sandbox-এ টেস্ট করা সম্ভব হচ্ছে, Node-এর বিল্ট-ইন
// node:sqlite (v22+, experimental) ব্যবহার করে। bench script
// (scripts/generate-synthetic-dataset.mjs)-ও একই node:sqlite মডিউল ব্যবহার
// করে, তাই SQL সিমান্টিক্স real device-এর সাথে সামঞ্জস্যপূর্ণ থাকে।
//
// ⚠️ শুধু tests/-এর জন্য। কোনো production কোড থেকে import হয় না।

import { DatabaseSync } from "node:sqlite";

class FakeSQLiteDBConnection {
  constructor(dbPath) {
    this._db = new DatabaseSync(dbPath);
  }

  async open() {
    // node:sqlite constructor-এই db খুলে ফেলে, এখানে করার কিছু নেই।
  }

  // DataStore.js এটা দুইভাবে ব্যবহার করে: (ক) PRAGMA লাইন (কোনো params না,
  // রিটার্ন-ভ্যালু ব্যবহার হয় না), (খ) আসল SELECT (params সহ, res.values পড়া হয়)।
  async query(sql, params = []) {
    const trimmed = sql.trim();
    if (/^PRAGMA\b/i.test(trimmed)) {
      try {
        this._db.exec(trimmed);
      } catch {
        // PRAGMA journal_mode=WAL ইন-মেমরি DB-তে silently no-op — বাস্তব Android
        // ডিভাইসে ফাইল-ব্যাকড DB-তে আসল WAL হয়, লজিক টেস্টের জন্য এটা অপ্রাসঙ্গিক।
      }
      return { values: [] };
    }
    const stmt = this._db.prepare(sql);
    const rows = stmt.all(...params);
    return { values: rows };
  }

  // মাল্টি-স্টেটমেন্ট DDL/DML (schema.sql বুটস্ট্র্যাপ) — params নেই।
  async execute(sql) {
    this._db.exec(sql);
  }

  // সিঙ্গেল পরামিটারাইজড স্টেটমেন্ট (upsert/remove/FTS sync ইত্যাদি)।
  async run(sql, params = []) {
    const stmt = this._db.prepare(sql);
    stmt.run(...params);
  }

  // একটা transaction-এ একাধিক statement (upsertMany ব্যাচ)।
  async executeSet(set) {
    this._db.exec("BEGIN");
    try {
      for (const { statement, values } of set) {
        const stmt = this._db.prepare(statement);
        stmt.run(...(values || []));
      }
      this._db.exec("COMMIT");
    } catch (e) {
      try {
        this._db.exec("ROLLBACK");
      } catch {}
      throw e;
    }
  }

  close() {
    try {
      this._db.close();
    } catch {}
  }
}

const _conns = new Map(); // dbName -> FakeSQLiteDBConnection

export class SQLiteConnection {
  // real ctor signature নেয় (sqliteImpl) — আমাদের দরকার নেই, ignore।
  constructor(_sqliteImpl) {}

  async isConnection(dbName, _readonly) {
    return { result: _conns.has(dbName) };
  }

  async checkConnectionsConsistency() {
    return { result: true };
  }

  async retrieveConnection(dbName, _readonly) {
    const conn = _conns.get(dbName);
    if (!conn) throw new Error(`retrieveConnection(): "${dbName}" কানেকশন পাওয়া যায়নি`);
    return conn;
  }

  async createConnection(dbName, _encrypted, _mode, _version, _readonly) {
    // প্রতিটা businessType-এর জন্য আলাদা, স্বতন্ত্র in-memory DB — টেস্টে একে
    // অন্যের সাথে ডেটা মিশবে না, আর ফাইল-সিস্টেম ক্লিনআপেরও দরকার নেই।
    const conn = new FakeSQLiteDBConnection(":memory:");
    _conns.set(dbName, conn);
    return conn;
  }

  async closeConnection(dbName, _readonly) {
    const conn = _conns.get(dbName);
    if (conn) conn.close();
    _conns.delete(dbName);
  }
}

export const CapacitorSQLite = {};

// টেস্ট-শুধু হেল্পার: পুরো শিম রিসেট (একটা টেস্ট ফাইলের সব কেসের মধ্যে ক্রস-
// কন্টামিনেশন এড়াতে, DataStore.js-এর closeDb() না ডেকেও ব্যবহার করা যায়)।
export function __resetAllConnectionsForTests() {
  for (const conn of _conns.values()) conn.close();
  _conns.clear();
}
