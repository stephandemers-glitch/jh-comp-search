// api/attom.js — Vercel serverless proxy for ATTOM API
// Keeps the API key server-side, avoids CORS issues in the browser.

const ATTOM_KEY = process.env.ATTOM_API_KEY;
const BASE = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!ATTOM_KEY) return res.status(500).json({ error: "ATTOM API key not configured" });

  const { endpoint = "sale/snapshot", ...params } = req.query;
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/${endpoint}${qs ? "?" + qs : ""}`;

  try {
    const r = await fetch(url, {
      headers: {
        "accept": "application/json",
        "apikey": ATTOM_KEY,
      },
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    console.error("ATTOM proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
