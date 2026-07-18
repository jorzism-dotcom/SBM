// netlify-site/api/refresh-token.js
// Google OAuth2 token refresh — client_secret সুরক্ষিত রাখে server-side-এ
// Vercel serverless function (Node runtime, /api ফোল্ডার auto-detect হয়)

module.exports = async (req, res) => {
  // APK (Capacitor) থেকে আসা request-এর origin আলাদা হয়
  const ALLOWED_ORIGINS = [
    "https://sbm-admin-mocha.vercel.app",
    "capacitor://localhost",   // Capacitor Android/iOS WebView
    "http://localhost",        // Capacitor dev / some Android WebViews
    "https://localhost",
  ];

  const origin = req.headers?.origin || req.headers?.Origin || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : "https://sbm-admin-mocha.vercel.app"; // fallback

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    // Vercel সাধারণত JSON body auto-parse করে (req.body), কিন্তু raw string হলেও হ্যান্ডেল করি
    let payload = req.body;
    if (typeof payload === "string") {
      payload = JSON.parse(payload || "{}");
    }
    payload = payload || {};

    const { refresh_token, grant_type, code, redirect_uri } = payload;

    const CLIENT_ID = "359825185312-7ka6g11l93vb4l6r4cafs8kl9850tt54.apps.googleusercontent.com";
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET; // Vercel env variable

    if (!CLIENT_SECRET) {
      res.status(500).json({ error: "Server config error" });
      return;
    }

    let body;

    if (grant_type === "authorization_code" && code) {
      // প্রথমবার login — code → access_token + refresh_token
      body = new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirect_uri || "https://sbm-admin-mocha.vercel.app/oauth.html",
        grant_type: "authorization_code",
      });
    } else if (refresh_token) {
      // Background refresh — refresh_token → নতুন access_token
      body = new URLSearchParams({
        refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
      });
    } else {
      res.status(400).json({ error: "refresh_token বা code দরকার" });
      return;
    }

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await resp.json();

    if (!resp.ok) {
      res.status(resp.status).json(data);
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
