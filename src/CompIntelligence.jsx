import { useState, useRef } from "react";

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#0F1117", surface: "#181B24", card: "#1E2130",
  border: "#2A2E3E", borderHi: "#3D4258",
  text: "#E8E6E0", muted: "#7A7F94",
  accent: "#C8A96E", accentDim: "#8A6E3E",
  green: "#4CAF7D", greenDim: "#2A5E40",
  red: "#E05A5A", amber: "#E0A030",
  mono: "'IBM Plex Mono', monospace", sans: "'Inter', sans-serif",
};

// ── Submarket search definitions ─────────────────────────────────────────────
const SUBMARKETS = [
  { id: "jackson",      label: "Jackson Core",       lat: 43.4799, lng: -110.7624, radius: 8 },
  { id: "wilson",       label: "Wilson / Westbank",  lat: 43.5108, lng: -110.8819, radius: 8 },
  { id: "teton_village",label: "Teton Village",      lat: 43.5874, lng: -110.8277, radius: 5 },
  { id: "south_jackson",label: "South Jackson",      lat: 43.3800, lng: -110.7600, radius: 8 },
  { id: "alta",         label: "Alta WY",            lat: 43.7500, lng: -110.9300, radius: 5 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => n != null && !isNaN(n) && n !== "" ? "$" + Math.round(Number(n)).toLocaleString() : "—";
const fmtN = (n) => n != null && n !== "" ? Number(n).toLocaleString() : "—";
const fmtDate = (s) => s ? String(s).split("T")[0] : "—";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SHEET_ID = "1CKKjAgCJnivBasZXeS3oBVBM_taVWz2S-4Loxcm-ZpU";

// ── API helpers ──────────────────────────────────────────────────────────────
async function attom(endpoint, params) {
  const q = new URLSearchParams({ endpoint, ...params });
  const r = await fetch(`/api/attom?${q}`);
  if (!r.ok) throw new Error(`ATTOM ${endpoint} → ${r.status}`);
  return r.json();
}

// Parse sale/snapshot results into base comps
function parseSnapshot(data, submarket) {
  if (!data?.property) return [];
  return data.property.map(p => {
    const sale = p.sale || {};
    const amt = sale.amount || {};
    const sqft = p.building?.size?.universalsize || p.building?.size?.livingsize || null;
    return {
      attomId:      String(p.identifier?.attomId || ""),
      fips:         p.identifier?.fips || "",
      apn:          p.identifier?.apn || "",
      address:      p.address?.oneLine || p.address?.line1 || "",
      city:         p.address?.locality || "",
      state:        p.address?.countrySubd || "",
      zip:          p.address?.postal1 || "",
      latitude:     p.location?.latitude || "",
      longitude:    p.location?.longitude || "",
      submarket,
      saleDate:     fmtDate(sale.salesSearchDate || amt.salerecdate || ""),
      saleAmt:      amt.saleamt || null,
      saleType:     amt.saletranstype || "",
      disclosureType: amt.saledisclosuretype != null ? String(amt.saledisclosuretype) : "",
      docNum:       amt.saledocnum || "",
      pricePerSqft: sqft && amt.saleamt ? Math.round(amt.saleamt / sqft) : null,
      pricePerBed:  p.building?.rooms?.beds && amt.saleamt ? Math.round(amt.saleamt / p.building.rooms.beds) : null,
      sqft:         sqft ? Number(sqft) : null,
      beds:         p.building?.rooms?.beds || null,
      baths:        p.building?.rooms?.bathstotal || null,
      halfBaths:    null, stories: null, construction: "",
      roofType: "", roofMaterial: "", basement: "", basementSqft: null,
      garageType: "", garageSpaces: null, pool: null, fireplace: null,
      heating: "", cooling: "", propType: p.summary?.proptype || "",
      propSubtype: p.summary?.propsubtype || "",
      lotAcres: p.lot?.lotsize1 || (p.lot?.lotsize2 ? +(p.lot.lotsize2/43560).toFixed(4) : null),
      yearBuilt: p.summary?.yearbuilt || null,
      assessedTotal: null, landValue: null, improvementValue: null,
      taxAmount: null, taxYear: null, exemptions: "",
      avmValue: null, avmLow: null, avmHigh: null, avmConfidence: null, avmDate: "",
      _enriched: false,
    };
  });
}

// Enrich a single comp with detail, avm, assessment, saleshistory
async function enrichComp(comp) {
  const id = comp.attomId;
  const enriched = { ...comp };
  const results = await Promise.allSettled([
    attom("property/detail", { attomid: id }),
    attom("attomavm/detail", { attomid: id }),
    attom("assessment/detail", { attomid: id }),
    attom("saleshistory/detail", { attomid: id }),
  ]);

  // property/detail
  if (results[0].status === "fulfilled") {
    const p = results[0].value?.property?.[0];
    if (p) {
      const b = p.building || {};
      enriched.halfBaths    = b.rooms?.bathshalf || null;
      enriched.stories      = b.summary?.levels || null;
      enriched.construction = b.construction?.constructiontype || b.construction?.bldgconstruction || "";
      enriched.roofType     = b.construction?.rooftype || b.construction?.roofcover || "";
      enriched.roofMaterial = b.construction?.roofingtypematerial || "";
      enriched.basement     = b.interior?.bsmttype || b.interior?.basement || "";
      enriched.basementSqft = b.interior?.bsmtsize || null;
      enriched.garageType   = b.parking?.garagetype || "";
      enriched.garageSpaces = b.parking?.garagespaces || b.parking?.prkgSpaces || null;
      enriched.pool         = b.amenities?.pool || b.amenities?.poolind || null;
      enriched.fireplace    = b.interior?.fplctype || b.interior?.fireplacenumber || null;
      enriched.heating      = b.utilities?.heatingtype || b.utilities?.heattype || "";
      enriched.cooling      = b.utilities?.coolingtype || b.utilities?.aircondtype || "";
      if (b.size?.universalsize) enriched.sqft = Number(b.size.universalsize);
      if (p.summary?.yearbuilt) enriched.yearBuilt = p.summary.yearbuilt;
    }
  }

  // attomavm/detail
  if (results[1].status === "fulfilled") {
    const a = results[1].value?.property?.[0]?.avm;
    if (a) {
      enriched.avmValue      = a.amount?.value || null;
      enriched.avmLow        = a.amount?.low || null;
      enriched.avmHigh       = a.amount?.high || null;
      enriched.avmConfidence = a.amount?.scr || null;
      enriched.avmDate       = fmtDate(a.eventdate || "");
    }
  }

  // assessment/detail
  if (results[2].status === "fulfilled") {
    const a = results[2].value?.property?.[0]?.assessment;
    if (a) {
      enriched.assessedTotal    = a.assessed?.assdttlvalue || null;
      enriched.landValue        = a.assessed?.assdlandvalue || null;
      enriched.improvementValue = a.assessed?.assdimprvalue || null;
      enriched.taxAmount        = a.tax?.taxamt || null;
      enriched.taxYear          = a.tax?.taxyear || null;
      enriched.exemptions       = a.mortgage?.FHAind || "";
    }
  }

  // saleshistory/detail — return history rows separately
  let historyRows = [];
  if (results[3].status === "fulfilled") {
    const hist = results[3].value?.property?.[0]?.salehistory;
    if (Array.isArray(hist)) {
      historyRows = hist.map(h => [
        comp.attomId, comp.address,
        fmtDate(h.saleTransDate || h.salesearchdate || ""),
        h.amount?.saleamt || "",
        h.amount?.saletranstype || "",
        h.amount?.saledisclosuretype != null ? String(h.amount.saledisclosuretype) : "",
        h.amount?.saledocnum || "",
        h.calculation?.pricepersizeunit || "",
      ]);
    }
  }

  enriched._enriched = true;
  return { comp: enriched, historyRows };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CompIntelligence() {
  const [phase, setPhase] = useState("config"); // config | discovery | enriching | review | exporting | done
  const [config, setConfig] = useState({
    startDate: "2020-01-01", endDate: "2025-12-31",
    minPrice: "500000", maxPrice: "",
    minSqft: "", propType: "SFR", pagesize: "500",
    submarkets: SUBMARKETS.map(s => s.id),
  });
  const [log, setLog] = useState([]);
  const [comps, setComps] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [enrichedComps, setEnrichedComps] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [exportStatus, setExportStatus] = useState("");
  const [sortKey, setSortKey] = useState("saleDate");
  const [sortDir, setSortDir] = useState("desc");
  const abortRef = useRef(false);

  const addLog = (msg, type = "info") => setLog(l => [...l, { msg, type, ts: new Date().toLocaleTimeString() }]);

  // ── Phase 1: Discovery ───────────────────────────────────────────────────
  const runDiscovery = async () => {
    setPhase("discovery");
    setLog([]);
    setComps([]);
    abortRef.current = false;
    const seen = new Set();
    const all = [];
    const activeSubmarkets = SUBMARKETS.filter(s => config.submarkets.includes(s.id));

    for (const sm of activeSubmarkets) {
      if (abortRef.current) break;
      addLog(`Searching ${sm.label}...`);
      let page = 1;
      let total = null;
      while (true) {
        if (abortRef.current) break;
        try {
          const params = {
            latitude: sm.lat, longitude: sm.lng, radius: sm.radius,
            propertytype: config.propType || "SFR",
            startSaleSearchDate: config.startDate.replace(/-/g, "/"),
            endSaleSearchDate: config.endDate.replace(/-/g, "/"),
            pagesize: config.pagesize, page,
          };
          if (config.minPrice) params.minSaleAmt = config.minPrice;
          if (config.maxPrice) params.maxSaleAmt = config.maxPrice;
          if (config.minSqft) params.minUniversalSize = config.minSqft;

          const data = await attom("sale/snapshot", params);
          if (!data?.property?.length) break;
          if (total === null) total = data.status?.total || 0;

          const parsed = parseSnapshot(data, sm.label);
          let added = 0;
          for (const c of parsed) {
            if (!seen.has(c.attomId)) { seen.add(c.attomId); all.push(c); added++; }
          }
          addLog(`  Page ${page}: ${parsed.length} results, ${added} new (${all.length} total unique)`);
          if (parsed.length < Number(config.pagesize)) break;
          page++;
          await sleep(300);
        } catch (e) {
          addLog(`  Error: ${e.message}`, "error");
          break;
        }
      }
      addLog(`${sm.label} complete — ${all.filter(c=>c.submarket===sm.label).length} unique comps`, "success");
      await sleep(500);
    }

    addLog(`Discovery complete — ${all.length} unique properties across ${activeSubmarkets.length} submarkets`, "success");
    setComps(all);
    setSelected(new Set(all.map(c => c.attomId)));
    setPhase("review");
  };

  // ── Phase 2: Enrichment ──────────────────────────────────────────────────
  const runEnrichment = async () => {
    const toEnrich = comps.filter(c => selected.has(c.attomId));
    setPhase("enriching");
    setEnrichProgress({ done: 0, total: toEnrich.length, errors: 0 });
    const enriched = [];
    const history = [];
    let errors = 0;
    abortRef.current = false;

    for (let i = 0; i < toEnrich.length; i++) {
      if (abortRef.current) break;
      const comp = toEnrich[i];
      try {
        const result = await enrichComp(comp);
        enriched.push(result.comp);
        history.push(...result.historyRows);
      } catch (e) {
        errors++;
        enriched.push({ ...comp, _enriched: false });
      }
      setEnrichProgress({ done: i + 1, total: toEnrich.length, errors });
      // Throttle: 200ms between properties = ~5/sec, well within limits
      await sleep(200);
    }

    setEnrichedComps(enriched);
    setHistoryRows(history);
    setPhase("review");
    addLog(`Enrichment complete — ${enriched.length} comps, ${history.length} history rows, ${errors} errors`, errors > 0 ? "warn" : "success");
  };

  // ── Phase 3: Export ──────────────────────────────────────────────────────
  const runExport = async () => {
    setPhase("exporting");
    setExportStatus("Sending to Google Sheets...");
    try {
      const payload = enrichedComps.length > 0 ? enrichedComps : comps.filter(c => selected.has(c.attomId));
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comps: payload, historyRows }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setExportStatus(`✓ ${d.compsWritten} comps + ${d.historyWritten} history rows exported`);
      setPhase("done");
    } catch (e) {
      setExportStatus(`✗ Export failed: ${e.message}`);
      setPhase("review");
    }
  };

  // ── Sort & select helpers ────────────────────────────────────────────────
  const setSort = k => { if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("desc"); } };
  const toggleAll = () => selected.size === comps.length ? setSelected(new Set()) : setSelected(new Set(comps.map(c => c.attomId)));
  const toggle = id => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };

  const displayComps = [...(enrichedComps.length > 0 ? enrichedComps : comps)].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (av == null) return 1; if (bv == null) return -1;
    return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const pct = enrichProgress.total ? Math.round((enrichProgress.done / enrichProgress.total) * 100) : 0;
  const enrichedCount = enrichedComps.length;
  const isEnriched = enrichedCount > 0;

  // ── UI helpers ────────────────────────────────────────────────────────────
  const s = {
    app: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans },
    header: { borderBottom: `1px solid ${C.border}`, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" },
    logo: { fontFamily: C.mono, fontSize: 13, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase" },
    sub: { fontFamily: C.mono, fontSize: 10, color: C.muted, marginTop: 2 },
    main: { maxWidth: 1300, margin: "0 auto", padding: "24px 28px" },
    panel: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 22px", marginBottom: 16 },
    panelTitle: { fontFamily: C.mono, fontSize: 10, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 },
    field: { marginBottom: 12 },
    label: { fontSize: 10, color: C.muted, display: "block", marginBottom: 4, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.06em" },
    input: { width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 9px", color: C.text, fontFamily: C.mono, fontSize: 12, outline: "none" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    grid3: { display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" },
    btn: (bg, fg="#0F1117") => ({ padding: "9px 18px", borderRadius: 6, border: "none", fontFamily: C.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", background: bg, color: fg }),
    th: { textAlign: "left", padding: "7px 10px", fontFamily: C.mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", cursor: "pointer" },
    td: { padding: "7px 10px", borderBottom: `1px solid ${C.border}30`, fontFamily: C.mono, fontSize: 11, whiteSpace: "nowrap" },
  };

  const statBox = (val, label, sub) => (
    <div style={{ textAlign: "center", padding: "10px 0" }}>
      <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 500, color: C.accent }}>{val}</div>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontFamily: C.mono, fontSize: 9, color: C.border, marginTop: 1 }}>{sub}</div>}
    </div>
  );

  const prices = displayComps.map(c => c.saleAmt).filter(Boolean).sort((a,b)=>a-b);
  const ppsf = displayComps.map(c => c.pricePerSqft).filter(Boolean);
  const avg = arr => arr.length ? Math.round(arr.reduce((s,v)=>s+v,0)/arr.length) : null;
  const median = arr => { if (!arr.length) return null; const m=Math.floor(arr.length/2); return arr.length%2?arr[m]:Math.round((arr[m-1]+arr[m])/2); };

  return (
    <div style={s.app}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.logo}>JH Property Intelligence</div>
          <div style={s.sub}>ATTOM · Full Valley Comp Pull · Teton County WY</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {comps.length > 0 && (
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>
              {comps.length} unique · {selected.size} selected {isEnriched ? `· ${enrichedCount} enriched` : ""}
            </span>
          )}
          {phase === "review" && comps.length > 0 && !isEnriched && (
            <button style={s.btn(C.accent)} onClick={runEnrichment}>
              Enrich {selected.size} selected →
            </button>
          )}
          {phase === "review" && (comps.length > 0) && (
            <button style={s.btn(C.green)} onClick={runExport}>
              Export to Sheets →
            </button>
          )}
        </div>
      </div>

      <div style={s.main}>
        {/* ── Config phase ── */}
        {phase === "config" && (
          <div style={s.grid3}>
            <div>
              <div style={s.panel}>
                <div style={s.panelTitle}>Search configuration</div>
                <div style={s.grid2}>
                  <div style={s.field}><label style={s.label}>Start date</label><input style={s.input} type="date" value={config.startDate} onChange={e=>setConfig(c=>({...c,startDate:e.target.value}))} /></div>
                  <div style={s.field}><label style={s.label}>End date</label><input style={s.input} type="date" value={config.endDate} onChange={e=>setConfig(c=>({...c,endDate:e.target.value}))} /></div>
                </div>
                <div style={s.grid2}>
                  <div style={s.field}><label style={s.label}>Min price ($)</label><input style={s.input} type="number" value={config.minPrice} onChange={e=>setConfig(c=>({...c,minPrice:e.target.value}))} /></div>
                  <div style={s.field}><label style={s.label}>Max price ($)</label><input style={s.input} type="number" value={config.maxPrice} onChange={e=>setConfig(c=>({...c,maxPrice:e.target.value}))} placeholder="none" /></div>
                </div>
                <div style={s.grid2}>
                  <div style={s.field}><label style={s.label}>Min sqft</label><input style={s.input} type="number" value={config.minSqft} onChange={e=>setConfig(c=>({...c,minSqft:e.target.value}))} placeholder="none" /></div>
                  <div style={s.field}><label style={s.label}>Prop type</label>
                    <select style={s.input} value={config.propType} onChange={e=>setConfig(c=>({...c,propType:e.target.value}))}>
                      <option value="SFR">Single family</option>
                      <option value="CONDO">Condo</option>
                      <option value="">All types</option>
                    </select>
                  </div>
                </div>
                <div style={s.field}><label style={s.label}>Max results per submarket page</label>
                  <select style={s.input} value={config.pagesize} onChange={e=>setConfig(c=>({...c,pagesize:e.target.value}))}>
                    <option value="100">100</option>
                    <option value="500">500</option>
                  </select>
                </div>
                <div style={{ height: 1, background: C.border, margin: "14px 0" }} />
                <div style={s.panelTitle}>Submarkets</div>
                {SUBMARKETS.map(sm => (
                  <label key={sm.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={config.submarkets.includes(sm.id)}
                      onChange={e => setConfig(c => ({ ...c, submarkets: e.target.checked ? [...c.submarkets, sm.id] : c.submarkets.filter(s=>s!==sm.id) }))} />
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{sm.label}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>{sm.radius}mi radius</span>
                  </label>
                ))}
                <button style={{ ...s.btn(C.accent), width: "100%", marginTop: 12 }} onClick={runDiscovery}>
                  Run discovery →
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div style={{ ...s.panel, padding: "28px 32px" }}>
              <div style={s.panelTitle}>How this works</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                {[
                  { step: "01", title: "Discovery", body: "Searches all selected submarkets via ATTOM sale/snapshot. Deduplicates by ATTOM ID across overlapping radii. Returns up to 500 results per submarket page." },
                  { step: "02", title: "Enrichment", body: "For each selected comp, fires 4 parallel ATTOM calls: property/detail, attomavm/detail, assessment/detail, saleshistory/detail. Throttled at 200ms per property." },
                  { step: "03", title: "Export", body: "Writes to 3 Google Sheet tabs: Comps (one row per property, all fields), History (one row per historical sale), Summary (auto-calculated stats)." },
                ].map(({step, title, body}) => (
                  <div key={step}>
                    <div style={{ fontFamily: C.mono, fontSize: 28, color: C.border, marginBottom: 8 }}>{step}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 12, color: C.accent, marginBottom: 8 }}>{title}</div>
                    <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{body}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 24, padding: "14px 16px", background: C.card, borderRadius: 8, fontFamily: C.mono, fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
                <span style={{ color: C.accent }}>API budget estimate:</span> Discovery ~5 calls · Enrichment ~4 calls/property · 500 comps ≈ 2,005 total calls · Well within 70k limit
              </div>
            </div>
          </div>
        )}

        {/* ── Discovery / enriching phase ── */}
        {(phase === "discovery" || phase === "enriching") && (
          <div style={s.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={s.panelTitle}>{phase === "discovery" ? "Discovering comps..." : "Enriching comps..."}</div>
              <button style={s.btn(C.red, C.text)} onClick={() => abortRef.current = true}>Abort</button>
            </div>
            {phase === "enriching" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{enrichProgress.done} / {enrichProgress.total} enriched</span>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.accent }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: C.card, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: C.accent, borderRadius: 3, transition: "width 0.3s" }} />
                </div>
                {enrichProgress.errors > 0 && (
                  <div style={{ marginTop: 6, fontFamily: C.mono, fontSize: 10, color: C.amber }}>{enrichProgress.errors} errors (properties skipped)</div>
                )}
              </div>
            )}
            <div style={{ maxHeight: 400, overflowY: "auto", fontFamily: C.mono, fontSize: 11, lineHeight: 1.8 }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.type === "error" ? C.red : l.type === "success" ? C.green : l.type === "warn" ? C.amber : C.muted }}>
                  <span style={{ color: C.border, marginRight: 8 }}>{l.ts}</span>{l.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Review / done phase ── */}
        {(phase === "review" || phase === "done" || phase === "exporting") && comps.length > 0 && (
          <>
            {/* Stats bar */}
            <div style={{ ...s.panel, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0, padding: "4px 0" }}>
              {[
                [comps.length, "Total comps"],
                [selected.size, "Selected"],
                [fmt(median(prices)), "Median price"],
                [fmt(avg(prices)), "Avg price"],
                [avg(ppsf) ? "$"+avg(ppsf) : "—", "Avg $/sqft"],
                [isEnriched ? enrichedCount : "—", "Enriched"],
              ].map(([v, l], i) => (
                <div key={i} style={{ ...{ textAlign:"center", padding:"10px 0" }, ...(i < 5 ? { borderRight: `1px solid ${C.border}` } : {}) }}>
                  {statBox(v, l)}
                </div>
              ))}
            </div>

            {exportStatus && (
              <div style={{ ...s.panel, fontFamily: C.mono, fontSize: 12, color: exportStatus.startsWith("✓") ? C.green : C.red, padding: "12px 16px" }}>
                {exportStatus}
              </div>
            )}

            {log.length > 0 && (
              <div style={{ ...s.panel, padding: "12px 16px", maxHeight: 120, overflowY: "auto" }}>
                {log.slice(-5).map((l, i) => (
                  <div key={i} style={{ fontFamily: C.mono, fontSize: 10, color: l.type === "success" ? C.green : l.type === "error" ? C.red : C.muted }}>
                    {l.msg}
                  </div>
                ))}
              </div>
            )}

            {/* Table */}
            <div style={{ ...s.panel, padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, width: 32 }}>
                      <input type="checkbox" checked={selected.size === comps.length} onChange={toggleAll} />
                    </th>
                    {[
                      ["address","Address"],["submarket","Submarket"],["saleDate","Sale date"],
                      ["saleAmt","Sale price"],["pricePerSqft","$/sqft"],["sqft","Sqft"],
                      ["beds","Beds"],["baths","Baths"],["lotAcres","Acres"],["yearBuilt","Built"],
                      ...(isEnriched ? [
                        ["avmValue","AVM"],["avmConfidence","AVM score"],
                        ["assessedTotal","Assessed"],["taxAmount","Tax"],
                        ["construction","Construction"],["roofType","Roof"],
                        ["pool","Pool"],["garageSpaces","Garage"],
                        ["heating","Heat"],["saleType","Sale type"],["disclosureType","Disclosure"],
                      ] : [["saleType","Sale type"],["disclosureType","Disclosure"]]),
                    ].map(([key, label]) => (
                      <th key={key} style={s.th} onClick={() => setSort(key)}>
                        {label}{sortKey===key ? (sortDir==="asc"?" ↑":" ↓") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayComps.map((c, i) => (
                    <tr key={c.attomId} style={{ background: i%2===0?"transparent":`${C.card}50` }}>
                      <td style={s.td}>
                        <input type="checkbox" checked={selected.has(c.attomId)} onChange={() => toggle(c.attomId)} />
                      </td>
                      <td style={{ ...s.td, color: C.text, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{c.address}</td>
                      <td style={{ ...s.td, color: C.muted }}>{c.submarket}</td>
                      <td style={{ ...s.td, color: C.muted }}>{c.saleDate}</td>
                      <td style={{ ...s.td, color: C.accent }}>{fmt(c.saleAmt)}</td>
                      <td style={{ ...s.td, color: C.muted }}>{c.pricePerSqft ? "$"+c.pricePerSqft : "—"}</td>
                      <td style={{ ...s.td, color: C.muted }}>{fmtN(c.sqft)}</td>
                      <td style={{ ...s.td, color: C.muted }}>{c.beds||"—"}</td>
                      <td style={{ ...s.td, color: C.muted }}>{c.baths||"—"}</td>
                      <td style={{ ...s.td, color: C.muted }}>{c.lotAcres ? Number(c.lotAcres).toFixed(2) : "—"}</td>
                      <td style={{ ...s.td, color: C.muted }}>{c.yearBuilt||"—"}</td>
                      {isEnriched && <>
                        <td style={{ ...s.td, color: c.avmValue ? C.green : C.muted }}>{fmt(c.avmValue)}</td>
                        <td style={{ ...s.td, color: C.muted }}>{c.avmConfidence||"—"}</td>
                        <td style={{ ...s.td, color: C.muted }}>{fmt(c.assessedTotal)}</td>
                        <td style={{ ...s.td, color: C.muted }}>{fmt(c.taxAmount)}</td>
                        <td style={{ ...s.td, color: C.muted }}>{c.construction||"—"}</td>
                        <td style={{ ...s.td, color: C.muted }}>{c.roofType||"—"}</td>
                        <td style={{ ...s.td, color: C.muted }}>{c.pool!=null?String(c.pool):"—"}</td>
                        <td style={{ ...s.td, color: C.muted }}>{c.garageSpaces||"—"}</td>
                        <td style={{ ...s.td, color: C.muted }}>{c.heating||"—"}</td>
                      </>}
                      <td style={{ ...s.td, color: C.muted }}>{c.saleType||"—"}</td>
                      <td style={{ ...s.td, color: C.muted }}>{c.disclosureType||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {phase === "review" && !isEnriched && (
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button style={s.btn(C.accent)} onClick={runEnrichment} disabled={selected.size === 0}>
                  Enrich {selected.size} selected ({selected.size * 4} API calls) →
                </button>
                <button style={s.btn(C.surface, C.muted)} onClick={() => { setPhase("config"); setComps([]); setSelected(new Set()); setLog([]); }}>
                  ← New search
                </button>
              </div>
            )}
            {phase === "review" && isEnriched && (
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button style={s.btn(C.green)} onClick={runExport}>
                  Export {enrichedCount} enriched comps + {historyRows.length} history rows →
                </button>
                <button style={s.btn(C.surface, C.muted)} onClick={() => { setPhase("config"); setComps([]); setEnrichedComps([]); setSelected(new Set()); setLog([]); setHistoryRows([]); }}>
                  ← New search
                </button>
              </div>
            )}
          </>
        )}

        {phase === "exporting" && (
          <div style={{ ...s.panel, textAlign: "center", padding: 40 }}>
            <div style={{ fontFamily: C.mono, fontSize: 13, color: C.accent, marginBottom: 8 }}>Exporting to Google Sheets...</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{exportStatus || "Writing Comps, History, and Summary tabs..."}</div>
          </div>
        )}
      </div>
    </div>
  );
}
