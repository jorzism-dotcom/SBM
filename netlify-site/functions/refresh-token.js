// netlify/functions/refresh-token.js
// Google OAuth2 token refresh — client_secret সুরক্ষিত রাখে server-side-এ
// Deploy: Turjo repo-তে এই path-এ রাখুন, Netlify auto-deploy করবে

exports.handler = async (event) => {
  // APK (Capacitor) থেকে আসা request-এর origin আলাদা হয়
  const ALLOWED_ORIGINS = [
    "https://melodious-axolotl-00b2e7.netlify.app",
    "capacitor://localhost",   // Capacitor Android/iOS WebView
    "http://localhost",        // Capacitor dev / some Android WebViews
    "https://localhost",
  ];

  const origin = event.headers?.origin || event.headers?.Origin || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : "https://melodious-axolotl-00b2e7.netlify.app"; // fallback

  const CORS = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: "Method Not Allowed" };
  }

  try {
    const { refresh_token, grant_type, code, redirect_uri } = JSON.parse(event.body || "{}");

    const CLIENT_ID = "359825185312-7ka6g11l93vb4l6r4cafs8kl9850tt54.apps.googleusercontent.com";
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET; // Netlify env variable

    if (!CLIENT_SECRET) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Server config error" }) };
    }

    let body;

    if (grant_type === "authorization_code" && code) {
      // প্রথমবার login — code → access_token + refresh_token
      body = new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirect_uri || "https://melodious-axolotl-00b2e7.netlify.app/oauth.html",
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
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "refresh_token বা code দরকার" }) };
    }

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return { statusCode: resp.status, headers: CORS, body: JSON.stringify(data) };
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
