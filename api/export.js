// api/export.js — Appends comp rows to a Google Sheet
// Uses the same service account as the takeoff tool.

const SHEET_ID = process.env.COMP_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

async function getAccessToken() {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${encode(header)}.${encode(claim)}`;
  const keyData = PRIVATE_KEY
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", Buffer.from(keyData, "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, Buffer.from(unsigned));
  const jwt = `${unsigned}.${Buffer.from(sig).toString("base64url")}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Token error");
  return d.access_token;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { rows, sheetName = "Comps" } = req.body;
    if (!rows || !Array.isArray(rows)) return res.status(400).json({ error: "rows array required" });

    const token = await getAccessToken();
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Ensure sheet tab exists — try to read it first
    const metaRes = await fetch(`${base}?fields=sheets.properties`, { headers });
    const meta = await metaRes.json();
    const exists = meta.sheets?.some(s => s.properties.title === sheetName);

    if (!exists) {
      // Create the sheet tab
      await fetch(`${base}:batchUpdate`, {
        method: "POST", headers,
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
      });
      // Write header row
      const headerRow = [["address", "city", "state", "zip", "saleDate", "saleAmt", "sqft", "beds", "baths", "lotAcres", "yearBuilt", "pricePerSqft", "propType", "saleType", "attomId", "fips", "apn", "latitude", "longitude", "exportedAt"]];
      await fetch(`${base}/values/${sheetName}!A1:T1?valueInputOption=RAW`, {
        method: "PUT", headers,
        body: JSON.stringify({ values: headerRow }),
      });
    }

    // Append rows
    await fetch(`${base}/values/${sheetName}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST", headers,
      body: JSON.stringify({ values: rows }),
    });

    return res.status(200).json({ ok: true, rowsWritten: rows.length });
  } catch (err) {
    console.error("Export error:", err);
    return res.status(500).json({ error: err.message });
  }
}
