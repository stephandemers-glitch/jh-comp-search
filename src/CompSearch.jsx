import { useState } from "react";

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       "#0F1117",
  surface:  "#181B24",
  card:     "#1E2130",
  border:   "#2A2E3E",
  borderHi: "#3D4258",
  text:     "#E8E6E0",
  muted:    "#7A7F94",
  accent:   "#C8A96E",   // Teton gold
  accentDim:"#8A6E3E",
  green:    "#4CAF7D",
  red:      "#E05A5A",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'Inter', sans-serif",
};

const css = {
  app: {
    minHeight: "100vh", background: C.bg, color: C.text,
    fontFamily: C.sans, padding: "0 0 80px",
  },
  header: {
    borderBottom: `1px solid ${C.border}`,
    padding: "20px 32px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  logo: {
    fontFamily: C.mono, fontSize: 13, color: C.accent,
    letterSpacing: "0.12em", textTransform: "uppercase",
  },
  logoSub: { color: C.muted, fontSize: 11, marginTop: 2, fontFamily: C.mono },
  main: { maxWidth: 1100, margin: "0 auto", padding: "32px 32px 0" },
  grid: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" },
  panel: {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: "20px 20px",
  },
  panelTitle: {
    fontFamily: C.mono, fontSize: 11, color: C.accent,
    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16,
  },
  field: { marginBottom: 14 },
  label: { fontSize: 11, color: C.muted, display: "block", marginBottom: 5, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.06em" },
  input: {
    width: "100%", background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "8px 10px", color: C.text,
    fontFamily: C.mono, fontSize: 13, outline: "none",
  },
  select: {
    width: "100%", background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "8px 10px", color: C.text,
    fontFamily: C.mono, fontSize: 13, outline: "none",
  },
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  btn: {
    width: "100%", padding: "10px 0", borderRadius: 7,
    border: "none", fontFamily: C.mono, fontSize: 12,
    letterSpacing: "0.08em", textTransform: "uppercase",
    cursor: "pointer", marginTop: 6,
  },
  divider: { height: 1, background: C.border, margin: "16px 0" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left", padding: "8px 10px", fontFamily: C.mono,
    fontSize: 10, color: C.muted, textTransform: "uppercase",
    letterSpacing: "0.08em", borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
  },
  td: {
    padding: "9px 10px", borderBottom: `1px solid ${C.border}`,
    fontFamily: C.mono, fontSize: 12, color: C.text, whiteSpace: "nowrap",
  },
  badge: {
    display: "inline-block", padding: "2px 8px", borderRadius: 4,
    fontFamily: C.mono, fontSize: 10, fontWeight: 500,
  },
  stat: { textAlign: "center", padding: "12px 0" },
  statVal: { fontFamily: C.mono, fontSize: 22, fontWeight: 500, color: C.accent },
  statLbl: { fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 },
};

const fmt = (n) => n != null && !isNaN(n) ? "$" + Math.round(n).toLocaleString() : "—";
const fmtDate = (s) => s ? s.split("T")[0] : "—";
const fmtNum = (n) => n != null && !isNaN(n) ? Number(n).toLocaleString() : "—";

// ── Default search centered on Jackson WY ───────────────────────────────────
const DEFAULTS = {
  latitude: "43.4799",
  longitude: "-110.7624",
  radius: "15",
  startDate: "2020-01-01",
  endDate: "2025-12-31",
  minPrice: "500000",
  maxPrice: "",
  minSqft: "",
  maxSqft: "",
  minBeds: "",
  propType: "SFR",
  pagesize: "100",
};

const COLS = [
  { key: "address",      label: "Address",       fmt: v => v },
  { key: "saleDate",     label: "Sale date",      fmt: fmtDate },
  { key: "saleAmt",      label: "Sale price",     fmt: fmt },
  { key: "sqft",         label: "Sqft",           fmt: fmtNum },
  { key: "pricePerSqft", label: "$/sqft",         fmt: v => v ? "$" + Math.round(v) : "—" },
  { key: "beds",         label: "Beds",           fmt: v => v || "—" },
  { key: "baths",        label: "Baths",          fmt: v => v || "—" },
  { key: "lotAcres",     label: "Acres",          fmt: v => v ? Number(v).toFixed(2) : "—" },
  { key: "yearBuilt",    label: "Built",          fmt: v => v || "—" },
  { key: "saleType",     label: "Sale type",      fmt: v => v || "—" },
  { key: "city",         label: "City",           fmt: v => v },
  { key: "zip",          label: "Zip",            fmt: v => v },
];

function parseComps(data) {
  if (!data?.property) return [];
  return data.property.map(p => {
    const sale = p.sale || {};
    const amount = sale.amount || {};
    const sqft = p.building?.size?.universalsize || p.building?.size?.livingsize || null;
    const lotSqft = p.lot?.lotsize1 ? p.lot.lotsize1 * 43560 : (p.lot?.lotsize2 || null);
    const lotAcres = p.lot?.lotsize1 || (lotSqft ? lotSqft / 43560 : null);
    return {
      attomId:      p.identifier?.attomId,
      fips:         p.identifier?.fips,
      apn:          p.identifier?.apn,
      address:      p.address?.oneLine || p.address?.line1 || "",
      city:         p.address?.locality || "",
      state:        p.address?.countrySubd || "",
      zip:          p.address?.postal1 || "",
      latitude:     p.location?.latitude,
      longitude:    p.location?.longitude,
      saleDate:     sale.salesSearchDate || amount.salerecdate || "",
      saleAmt:      amount.saleamt || null,
      sqft:         sqft ? Number(sqft) : null,
      pricePerSqft: sqft && amount.saleamt ? Math.round(amount.saleamt / sqft) : null,
      beds:         p.building?.rooms?.beds || null,
      baths:        p.building?.rooms?.bathstotal || null,
      lotAcres:     lotAcres ? parseFloat(lotAcres.toFixed(4)) : null,
      yearBuilt:    p.summary?.yearbuilt || null,
      propType:     p.summary?.proptype || "",
      saleType:     amount.saletranstype || "",
    };
  });
}

// ── Main component ───────────────────────────────────────────────────────────
export default function CompSearch() {
  const [params, setParams] = useState(DEFAULTS);
  const [comps, setComps] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [sortKey, setSortKey] = useState("saleDate");
  const [sortDir, setSortDir] = useState("desc");
  const [sheetId, setSheetId] = useState("");
  const [page, setPage] = useState(1);

  const up = (k, v) => setParams(p => ({ ...p, [k]: v }));

  const search = async (pg = 1) => {
    setLoading(true);
    setError("");
    setExportMsg("");
    setPage(pg);
    try {
      const q = new URLSearchParams({
        endpoint: "sale/snapshot",
        latitude: params.latitude,
        longitude: params.longitude,
        radius: params.radius,
        propertytype: params.propType || "SFR",
        startSaleSearchDate: params.startDate.replace(/-/g, "/"),
        endSaleSearchDate: params.endDate.replace(/-/g, "/"),
        pagesize: params.pagesize,
        page: pg,
      });
      if (params.minPrice) q.set("minSaleAmt", params.minPrice);
      if (params.maxPrice) q.set("maxSaleAmt", params.maxPrice);
      if (params.minSqft) q.set("minUniversalSize", params.minSqft);
      if (params.maxSqft) q.set("maxUniversalSize", params.maxSqft);
      if (params.minBeds) q.set("minBeds", params.minBeds);

      const r = await fetch(`/api/attom?${q}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.status?.msg || `Error ${r.status}`);
      const parsed = parseComps(data);
      setComps(parsed);
      setTotal(data.status?.total || parsed.length);
    } catch (e) {
      setError(e.message);
      setComps([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  };

  const exportToSheets = async () => {
    if (!sheetId.trim()) { setExportMsg("⚠ Paste a Sheet ID first."); return; }
    if (comps.length === 0) { setExportMsg("⚠ No comps to export."); return; }
    setExporting(true);
    setExportMsg("");
    try {
      const exportedAt = new Date().toISOString().split("T")[0];
      const rows = comps.map(c => [
        c.address, c.city, c.state, c.zip,
        fmtDate(c.saleDate), c.saleAmt || "", c.sqft || "",
        c.beds || "", c.baths || "", c.lotAcres || "",
        c.yearBuilt || "", c.pricePerSqft || "",
        c.propType, c.saleType,
        c.attomId || "", c.fips || "", c.apn || "",
        c.latitude || "", c.longitude || "", exportedAt,
      ]);
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, sheetId: sheetId.trim(), sheetName: "Comps" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Export failed");
      setExportMsg(`✓ ${d.rowsWritten} rows exported to Google Sheets`);
    } catch (e) {
      setExportMsg(`✗ ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const sorted = [...comps].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const setSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const avgPrice = comps.length ? Math.round(comps.reduce((s, c) => s + (c.saleAmt || 0), 0) / comps.filter(c => c.saleAmt).length) : null;
  const avgPpsf = comps.length ? Math.round(comps.reduce((s, c) => s + (c.pricePerSqft || 0), 0) / comps.filter(c => c.pricePerSqft).length) : null;
  const medPrice = (() => {
    const vals = comps.map(c => c.saleAmt).filter(Boolean).sort((a, b) => a - b);
    if (!vals.length) return null;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : Math.round((vals[m-1] + vals[m]) / 2);
  })();

  return (
    <div style={css.app}>
      {/* Header */}
      <div style={css.header}>
        <div>
          <div style={css.logo}>JH Comp Search</div>
          <div style={css.logoSub}>ATTOM · Teton County Market Intelligence</div>
        </div>
        {total != null && (
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>
            {comps.length} of <span style={{ color: C.accent }}>{total.toLocaleString()}</span> matching sales
          </div>
        )}
      </div>

      <div style={css.main}>
        <div style={css.grid}>

          {/* ── Left panel: search controls ── */}
          <div>
            <div style={css.panel}>
              <div style={css.panelTitle}>Search parameters</div>

              <div style={css.row2}>
                <div style={css.field}>
                  <label style={css.label}>Latitude</label>
                  <input style={css.input} value={params.latitude} onChange={e => up("latitude", e.target.value)} />
                </div>
                <div style={css.field}>
                  <label style={css.label}>Longitude</label>
                  <input style={css.input} value={params.longitude} onChange={e => up("longitude", e.target.value)} />
                </div>
              </div>

              <div style={css.field}>
                <label style={css.label}>Radius (miles)</label>
                <input style={css.input} type="number" value={params.radius} onChange={e => up("radius", e.target.value)} />
              </div>

              <div style={css.row2}>
                <div style={css.field}>
                  <label style={css.label}>Sale date from</label>
                  <input style={css.input} type="date" value={params.startDate} onChange={e => up("startDate", e.target.value)} />
                </div>
                <div style={css.field}>
                  <label style={css.label}>Sale date to</label>
                  <input style={css.input} type="date" value={params.endDate} onChange={e => up("endDate", e.target.value)} />
                </div>
              </div>

              <div style={css.divider} />

              <div style={css.row2}>
                <div style={css.field}>
                  <label style={css.label}>Min price ($)</label>
                  <input style={css.input} type="number" value={params.minPrice} onChange={e => up("minPrice", e.target.value)} placeholder="500000" />
                </div>
                <div style={css.field}>
                  <label style={css.label}>Max price ($)</label>
                  <input style={css.input} type="number" value={params.maxPrice} onChange={e => up("maxPrice", e.target.value)} placeholder="any" />
                </div>
              </div>

              <div style={css.row2}>
                <div style={css.field}>
                  <label style={css.label}>Min sqft</label>
                  <input style={css.input} type="number" value={params.minSqft} onChange={e => up("minSqft", e.target.value)} placeholder="any" />
                </div>
                <div style={css.field}>
                  <label style={css.label}>Min beds</label>
                  <input style={css.input} type="number" value={params.minBeds} onChange={e => up("minBeds", e.target.value)} placeholder="any" />
                </div>
              </div>

              <div style={css.field}>
                <label style={css.label}>Property type</label>
                <select style={css.select} value={params.propType} onChange={e => up("propType", e.target.value)}>
                  <option value="SFR">Single family</option>
                  <option value="CONDO">Condo</option>
                  <option value="">All types</option>
                </select>
              </div>

              <div style={css.field}>
                <label style={css.label}>Results per page</label>
                <select style={css.select} value={params.pagesize} onChange={e => up("pagesize", e.target.value)}>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="500">500</option>
                </select>
              </div>

              <button
                style={{ ...css.btn, background: loading ? C.accentDim : C.accent, color: "#0F1117" }}
                onClick={() => search(1)}
                disabled={loading}
              >
                {loading ? "Searching..." : "Search comps →"}
              </button>
            </div>

            {/* Export panel */}
            <div style={{ ...css.panel, marginTop: 16 }}>
              <div style={css.panelTitle}>Export to Google Sheets</div>
              <div style={css.field}>
                <label style={css.label}>Sheet ID</label>
                <input
                  style={css.input}
                  value={sheetId}
                  onChange={e => setSheetId(e.target.value)}
                  placeholder="Paste Google Sheet ID"
                />
              </div>
              <button
                style={{ ...css.btn, background: comps.length && sheetId ? C.green : C.border, color: comps.length && sheetId ? "#0F1117" : C.muted }}
                onClick={exportToSheets}
                disabled={exporting || !comps.length}
              >
                {exporting ? "Exporting..." : `Export ${comps.length} rows →`}
              </button>
              {exportMsg && (
                <div style={{ marginTop: 10, fontFamily: C.mono, fontSize: 11, color: exportMsg.startsWith("✓") ? C.green : C.red }}>
                  {exportMsg}
                </div>
              )}
              <div style={{ marginTop: 10, fontFamily: C.mono, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                Exports to a "Comps" tab. Sheet must be shared with the service account. 20 fields including address, sale price, sqft, $/sqft, lot, beds, baths, year built, lat/lng, ATTOM ID.
              </div>
            </div>
          </div>

          {/* ── Right panel: results ── */}
          <div>
            {error && (
              <div style={{ background: "#2A1414", border: `1px solid ${C.red}40`, borderRadius: 8, padding: "12px 16px", fontFamily: C.mono, fontSize: 12, color: C.red, marginBottom: 16 }}>
                {error}
              </div>
            )}

            {comps.length > 0 && (
              <>
                {/* Stats bar */}
                <div style={{ ...css.panel, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 0 }}>
                  {[
                    { val: comps.length, lbl: "Comps returned" },
                    { val: fmt(medPrice), lbl: "Median sale price" },
                    { val: fmt(avgPrice), lbl: "Avg sale price" },
                    { val: avgPpsf ? "$" + avgPpsf : "—", lbl: "Avg $/sqft" },
                  ].map((s, i) => (
                    <div key={i} style={{ ...css.stat, borderRight: i < 3 ? `1px solid ${C.border}` : "none" }}>
                      <div style={css.statVal}>{s.val}</div>
                      <div style={css.statLbl}>{s.lbl}</div>
                    </div>
                  ))}
                </div>

                {/* Table */}
                <div style={{ ...css.panel, overflowX: "auto", padding: 0 }}>
                  <table style={css.table}>
                    <thead>
                      <tr>
                        {COLS.map(c => (
                          <th key={c.key} style={css.th} onClick={() => setSort(c.key)}>
                            {c.label} {sortKey === c.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((comp, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : `${C.card}60` }}>
                          {COLS.map(c => (
                            <td key={c.key} style={{
                              ...css.td,
                              color: c.key === "saleAmt" ? C.accent : c.key === "address" ? C.text : C.muted,
                              maxWidth: c.key === "address" ? 260 : undefined,
                              overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {c.fmt(comp[c.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {total > comps.length && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
                    {page > 1 && (
                      <button onClick={() => search(page - 1)} style={{ ...css.btn, width: "auto", padding: "8px 20px", background: C.card, color: C.text, border: `1px solid ${C.border}` }}>
                        ← Prev
                      </button>
                    )}
                    <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, alignSelf: "center" }}>
                      Page {page} · {((page-1)*Number(params.pagesize)+1)}–{Math.min(page*Number(params.pagesize), total)} of {total.toLocaleString()}
                    </span>
                    {page * Number(params.pagesize) < total && (
                      <button onClick={() => search(page + 1)} style={{ ...css.btn, width: "auto", padding: "8px 20px", background: C.card, color: C.text, border: `1px solid ${C.border}` }}>
                        Next →
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {!loading && comps.length === 0 && !error && (
              <div style={{ ...css.panel, textAlign: "center", padding: "60px 40px" }}>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
                  No results yet
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 12, color: C.border }}>
                  Centered on Jackson WY · 15-mile radius · SFR · $500k+ · 2020–2025
                </div>
                <div style={{ marginTop: 20, fontFamily: C.mono, fontSize: 11, color: C.accentDim }}>
                  Adjust filters and click Search comps →
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
