// ─────────────────────────────────────────────────────────────
// SBM Web Worker — src/worker.js
// Main thread থেকে ভারী calculation এখানে চলবে
// UI freeze বন্ধ হবে
// ─────────────────────────────────────────────────────────────

self.onmessage = ({ data }) => {

  // ── ১. Dashboard Stats ────────────────────────────────────
  if (data.type === "CALC_DASHBOARD") {
    const { invoices, products, customers, txns, today } = data.payload;

    const prodMap = new Map(products.map(p => [p.id, p]));

    // আজকের invoices
    const todayInvs = invoices.filter(i => i.dateKey === today);

    // আজকের বিক্রয় ও লাভ
    let todaySales = 0, todayProfit = 0, todayCash = 0, todayBaki = 0;
    todayInvs.forEach(inv => {
      const total = inv.total || 0;
      todaySales += total;
      if (inv.payType === "cash") todayCash += total;
      else if (inv.payType === "baki") todayBaki += total;
      else if (inv.payType === "partial") {
        todayCash += inv.paid || 0;
        todayBaki += inv.due || 0;
      }
      // লাভ হিসাব
      (inv.items || []).forEach(it => {
        const p = prodMap.get(it.productId);
        const cost = (p?.costPrice || 0) * (it.qty || 1);
        const sell = (it.price || 0) * (it.qty || 1);
        todayProfit += sell - cost;
      });
    });

    // মোট বাকি
    const totalDue = customers.reduce((s, c) => s + (c.balance || 0), 0);

    // কম স্টক
    const lowStock = products.filter(p =>
      (p.stock || 0) > 0 && (p.stock || 0) <= (p.minStockAlert || 5)
    ).length;

    // মেয়াদোত্তীর্ণ ব্যাচ
    const today_ = new Date();
    let expiredBatches = 0;
    products.forEach(p => {
      (p.batches || []).forEach(b => {
        if (b.expiryDate && new Date(b.expiryDate) < today_ && (b.qty || 0) > 0)
          expiredBatches++;
      });
    });

    // এই মাসের বিক্রয়
    const thisMonth = today.slice(0, 7); // "2026-06"
    const monthSales = invoices
      .filter(i => (i.dateKey || "").startsWith(thisMonth))
      .reduce((s, i) => s + (i.total || 0), 0);

    self.postMessage({
      type: "DASHBOARD_RESULT",
      payload: {
        todaySales, todayProfit, todayCash, todayBaki,
        totalDue, lowStock, expiredBatches, monthSales,
        todayCount: todayInvs.length,
      }
    });
  }

  // ── ২. Stock Prediction (Reorder Alerts) ──────────────────
  if (data.type === "PREDICT_REORDER") {
    const { products, invoices } = data.payload;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;

    // শেষ ৩০ দিনের প্রতিটি পণ্যের বিক্রয় সংখ্যা বের করি
    const salesMap = {};
    invoices.forEach(inv => {
      const invDate = new Date(inv.createdAt || inv.dateKey || 0).getTime();
      if (invDate < thirtyDaysAgo) return;
      (inv.items || []).forEach(it => {
        salesMap[it.productId] = (salesMap[it.productId] || 0) + (it.qty || 1);
      });
    });

    const alerts = [];
    products.forEach(p => {
      if ((p.stock || 0) <= 0) return; // আউট অফ স্টক আলাদা
      const sold30 = salesMap[p.id] || 0;
      if (sold30 === 0) return; // বিক্রি হয়নি, আলার্ট নেই
      const avgDaily = sold30 / 30;
      const daysLeft = Math.round(p.stock / avgDaily);
      if (daysLeft > 30) return; // ৩০ দিনের বেশি আছে, alert নেই

      alerts.push({
        id: p.id,
        name: p.name,
        stock: p.stock,
        daysLeft,
        avgDaily: Math.round(avgDaily * 10) / 10,
        suggestedQty: Math.ceil(avgDaily * 30), // ১ মাসের জন্য
        status: daysLeft <= 7 ? "red" : daysLeft <= 14 ? "yellow" : "green",
      });
    });

    // সবচেয়ে জরুরি আগে
    alerts.sort((a, b) => a.daysLeft - b.daysLeft);

    self.postMessage({ type: "REORDER_ALERTS", payload: alerts });
  }

  // ── ৩. ABC Product Analysis ───────────────────────────────
  if (data.type === "ABC_ANALYSIS") {
    const { products, invoices } = data.payload;

    const prodMap = new Map(products.map(p => [p.id, p]));
    const revenueMap = {};

    invoices.forEach(inv => {
      (inv.items || []).forEach(it => {
        const id = it.productId;
        if (!id) return;
        revenueMap[id] = (revenueMap[id] || 0) + (it.qty || 1) * (it.price || 0);
      });
    });

    const sorted = Object.entries(revenueMap)
      .sort((a, b) => b[1] - a[1]);

    const totalRev = sorted.reduce((s, [, v]) => s + v, 0);
    let cumulative = 0;

    const result = sorted.map(([id, revenue]) => {
      cumulative += revenue;
      const cumPct = totalRev > 0 ? cumulative / totalRev : 0;
      const p = prodMap.get(id);
      return {
        id,
        name: p?.name || id,
        revenue,
        stock: p?.stock || 0,
        category: cumPct <= 0.8 ? "A" : cumPct <= 0.95 ? "B" : "C",
      };
    });

    self.postMessage({ type: "ABC_RESULT", payload: result });
  }

  // ── ৪. Dead Stock Detection ───────────────────────────────
  if (data.type === "DEAD_STOCK") {
    const { products, invoices, thresholdDays = 90 } = data.payload;

    const lastSaleMap = {};
    invoices.forEach(inv => {
      const d = new Date(inv.createdAt || inv.dateKey || 0);
      (inv.items || []).forEach(it => {
        if (!lastSaleMap[it.productId] || d > lastSaleMap[it.productId])
          lastSaleMap[it.productId] = d;
      });
    });

    const now = Date.now();
    const dead = products
      .filter(p => (p.stock || 0) > 0)
      .filter(p => {
        const last = lastSaleMap[p.id];
        if (!last) return true; // কখনো বিক্রি হয়নি
        return (now - last.getTime()) / 86400000 > thresholdDays;
      })
      .map(p => ({
        id: p.id,
        name: p.name,
        stock: p.stock || 0,
        costPrice: p.costPrice || 0,
        stockValue: (p.stock || 0) * (p.costPrice || p.price || 0),
        daysSinceLastSale: lastSaleMap[p.id]
          ? Math.round((now - lastSaleMap[p.id].getTime()) / 86400000)
          : 9999,
      }))
      .sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);

    self.postMessage({ type: "DEAD_STOCK_RESULT", payload: dead });
  }

  // ── ৫. P&L Calculation (ভারী) ─────────────────────────────
  if (data.type === "CALC_PNL") {
    const { invoices, products, expenses = [], dateRange } = data.payload;

    const prodMap = new Map(products.map(p => [p.id, p]));

    const filtered = dateRange
      ? invoices.filter(i => {
          const d = i.dateKey || "";
          return d >= dateRange.from && d <= dateRange.to;
        })
      : invoices;

    let revenue = 0, cogs = 0;
    filtered.forEach(inv => {
      revenue += inv.total || 0;
      (inv.items || []).forEach(it => {
        const p = prodMap.get(it.productId);
        cogs += (p?.costPrice || 0) * (it.qty || 1);
      });
    });

    const filteredExpenses = dateRange
      ? expenses.filter(e => e.dateKey >= dateRange.from && e.dateKey <= dateRange.to)
      : expenses;
    const totalExpense = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - totalExpense;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    self.postMessage({
      type: "PNL_RESULT",
      payload: {
        revenue, cogs, grossProfit, totalExpense, netProfit,
        grossMargin: Math.round(grossMargin * 10) / 10,
        netMargin: Math.round(netMargin * 10) / 10,
        invoiceCount: filtered.length,
      }
    });
  }

  // ── ৬. Cash Flow Forecast — আগামী ৭ দিনের আনুমানিক ─────────────────────
  // 🔴 ফিক্স (ESLint no-undef দিয়ে ধরা পড়া বাগ): এই ব্লকটা আগে ভুলবশত উপরের
  // self.onmessage হ্যান্ডলারের বন্ধনী `};`-এর বাইরে বসানো ছিল — ফলে `data`
  // undefined ছিল, worker load হওয়ার সময়েই ReferenceError থ্রো করত, আর পুরো
  // "Cash Flow Forecast" ফিচারটা (App.jsx থেকে CASH_FLOW_FORECAST পাঠানো ও
  // CASH_FLOW_RESULT-এর অপেক্ষা করা) কখনো কোনো ফলাফল পেত না — সম্পূর্ণ নিরব
  // ব্যর্থতা, কোনো error UI-তে দেখা যেত না। এখন হ্যান্ডলারের ভেতরে আনা হলো।
  if (data.type === "CASH_FLOW_FORECAST") {
    const { invoices, customers, txns, expenses, purchaseOrders } = data.payload;
    const now = Date.now();
    const todayKey = new Date().toISOString().split("T")[0];

    // শেষ ৩০ দিনের দৈনিক গড় বিক্রয়
    const d30 = new Date(now - 30 * 86400000).toISOString().split("T")[0];
    const recent = invoices.filter(i => (i.dateKey || "") >= d30);
    const avgDailySales = recent.reduce((s, i) => s + (i.total || 0), 0) / 30;

    // শেষ ৩০ দিনের দৈনিক গড় খরচ
    const recentExp = (expenses || []).filter(e => (e.dateKey || "") >= d30);
    const avgDailyExpense = recentExp.reduce((s, e) => s + (e.amount || 0), 0) / 30;

    // বাকি collection forecast — overdue customers (৭+ দিন)
    const overdueCustomers = customers.filter(c => (c.balance || 0) > 0);
    const expectedCollection = overdueCustomers.reduce((s, c) => {
      // rough: assume 20% of outstanding collected per week
      return s + (c.balance || 0) * 0.2 / 7;
    }, 0);

    // আগামী ৭ দিনের forecast
    const forecast = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(now + (idx + 1) * 86400000);
      const dateKey = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
      const isWeekend = d.getDay() === 5 || d.getDay() === 6; // শুক্র-শনি কম বিক্রয়
      const salesFactor = isWeekend ? 0.7 : 1.0;

      // PO-র due date check
      const duePO = (purchaseOrders || []).filter(po => po.dueDate === dateKey);
      const poPayment = duePO.reduce((s, po) =>
        s + (po.items || []).reduce((c, it) => c + (it.qty || 0) * (it.costPrice || 0), 0), 0);

      const inflow  = Math.round(avgDailySales * salesFactor + expectedCollection);
      const outflow = Math.round(avgDailyExpense + poPayment);
      const net     = inflow - outflow;

      return { dateKey, dayLabel, inflow, outflow, net, poPayment: Math.round(poPayment), isWeekend };
    });

    // Summary stats
    const totalInflow  = forecast.reduce((s, d) => s + d.inflow, 0);
    const totalOutflow = forecast.reduce((s, d) => s + d.outflow, 0);
    const totalNet     = totalInflow - totalOutflow;
    const overdueTotal = overdueCustomers.reduce((s, c) => s + (c.balance || 0), 0);

    self.postMessage({
      type: "CASH_FLOW_RESULT",
      payload: { forecast, totalInflow, totalOutflow, totalNet, overdueTotal, avgDailySales: Math.round(avgDailySales) }
    });
  }

};
