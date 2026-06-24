// api/export.js — Writes enriched comp data to Google Sheets
// Creates/updates three tabs: Comps, History, Summary

const SHEET_ID = process.env.COMP_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

async function getToken() {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: SA_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now,
  })}`;
  const key = await crypto.subtle.importKey("pkcs8",
    Buffer.from(PRIVATE_KEY.replace(/-----.*?-----|\s/g, ""), "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, Buffer.from(unsigned));
  const jwt = `${unsigned}.${Buffer.from(sig).toString("base64url")}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Auth failed: " + JSON.stringify(d));
  return d.access_token;
}

async function ensureTab(base, headers, meta, title, headerRow) {
  const exists = meta.sheets?.some(s => s.properties.title === title);
  if (!exists) {
    await fetch(`${base}:batchUpdate`, {
      method: "POST", headers,
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    });
    await fetch(`${base}/values/${encodeURIComponent(title)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST", headers,
      body: JSON.stringify({ values: [headerRow] }),
    });
  }
}

async function appendRows(base, headers, tabName, rows) {
  if (!rows.length) return;
  await fetch(`${base}/values/${encodeURIComponent(tabName)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST", headers,
    body: JSON.stringify({ values: rows }),
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { comps, historyRows } = req.body;
    if (!comps?.length) return res.status(400).json({ error: "comps array required" });

    const token = await getToken();
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
    const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const metaRes = await fetch(`${base}?fields=sheets.properties`, { headers: h });
    const meta = await metaRes.json();
    const exportedAt = new Date().toISOString().split("T")[0];

    // ── Comps tab ────────────────────────────────────────────────────────────
    const COMP_HEADERS = [
      // Identity
      "attomId","fips","apn","address","city","state","zip","latitude","longitude","submarket",
      // Sale
      "saleDate","saleAmt","saleType","disclosureType","docNum","pricePerSqft","pricePer Bed",
      // Property
      "sqft","beds","baths","halfBaths","lotAcres","yearBuilt","stories","construction",
      "roofType","roofMaterial","basement","basementSqft","garageType","garageSpaces",
      "pool","fireplace","heating","cooling","propType","propSubtype",
      // Assessment
      "assessedTotal","landValue","improvementValue","taxAmount","taxYear","exemptions",
      // AVM
      "avmValue","avmLow","avmHigh","avmConfidence","avmDate",
      // Meta
      "exportedAt"
    ];

    await ensureTab(base, h, meta, "Comps", COMP_HEADERS);

    const compRows = comps.map(c => [
      c.attomId, c.fips, c.apn, c.address, c.city, c.state, c.zip, c.latitude, c.longitude, c.submarket,
      c.saleDate, c.saleAmt, c.saleType, c.disclosureType, c.docNum, c.pricePerSqft, c.pricePerBed,
      c.sqft, c.beds, c.baths, c.halfBaths, c.lotAcres, c.yearBuilt, c.stories, c.construction,
      c.roofType, c.roofMaterial, c.basement, c.basementSqft, c.garageType, c.garageSpaces,
      c.pool, c.fireplace, c.heating, c.cooling, c.propType, c.propSubtype,
      c.assessedTotal, c.landValue, c.improvementValue, c.taxAmount, c.taxYear, c.exemptions,
      c.avmValue, c.avmLow, c.avmHigh, c.avmConfidence, c.avmDate,
      exportedAt,
    ]);
    await appendRows(base, h, "Comps", compRows);

    // ── History tab ──────────────────────────────────────────────────────────
    if (historyRows?.length) {
      const HIST_HEADERS = ["attomId","address","saleDate","saleAmt","saleType","disclosureType","docNum","pricePerSqft","exportedAt"];
      await ensureTab(base, h, meta, "History", HIST_HEADERS);
      const hRows = historyRows.map(r => [...r, exportedAt]);
      await appendRows(base, h, "History", hRows);
    }

    // ── Summary tab ──────────────────────────────────────────────────────────
    const SUM_HEADERS = ["metric","value","note"];
    await ensureTab(base, h, meta, "Summary", SUM_HEADERS);

    const prices = comps.map(c => c.saleAmt).filter(Boolean).sort((a,b) => a-b);
    const ppsf = comps.map(c => c.pricePerSqft).filter(Boolean);
    const avm = comps.map(c => c.avmValue).filter(Boolean);
    const median = arr => { if (!arr.length) return null; const m = Math.floor(arr.length/2); return arr.length%2 ? arr[m] : Math.round((arr[m-1]+arr[m])/2); };
    const avg = arr => arr.length ? Math.round(arr.reduce((s,v)=>s+v,0)/arr.length) : null;
    const avmDelta = comps.filter(c=>c.avmValue&&c.saleAmt).map(c=>c.avmValue-c.saleAmt);

    const summaryRows = [
      ["Run date", exportedAt, ""],
      ["Total comps exported", comps.length, ""],
      ["Date range", `${comps.map(c=>c.saleDate).filter(Boolean).sort()[0]} → ${comps.map(c=>c.saleDate).filter(Boolean).sort().slice(-1)[0]}`, ""],
      ["Median sale price", median(prices), "USD"],
      ["Avg sale price", avg(prices), "USD"],
      ["Min sale price", prices[0], "USD"],
      ["Max sale price", prices[prices.length-1], "USD"],
      ["Avg $/sqft", avg(ppsf), "USD"],
      ["Median $/sqft", median([...ppsf].sort((a,b)=>a-b)), "USD"],
      ["Comps with AVM", avm.length, ""],
      ["Avg AVM", avg(avm), "USD"],
      ["Avg AVM vs sale delta", avg(avmDelta), "Positive = AVM above sale price"],
      ["Comps with disclosure", comps.filter(c=>c.disclosureType==="FullDisclosure"||c.disclosureType==="0").length, ""],
      ["Comps with pool", comps.filter(c=>c.pool).length, ""],
      ["Submarkets", [...new Set(comps.map(c=>c.submarket))].join(", "), ""],
    ];
    await appendRows(base, h, "Summary", summaryRows);

    return res.status(200).json({ ok: true, compsWritten: comps.length, historyWritten: historyRows?.length || 0 });
  } catch (err) {
    console.error("Export error:", err);
    return res.status(500).json({ error: err.message });
  }
}
