export const SOLAR_PROPOSAL_CSS = `
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Outfit:wght@500;600;700;800&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;800&text=%E2%82%B9&display=block");
@page { size: A4; margin: 0; }

.sp-root, .sp-root * {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.sp-root {
  width: 210mm;
  color: #1e293b;
  font-family: "DM Sans", "Noto Sans", ui-sans-serif, system-ui, sans-serif;
  --sp-primary: #3158a6;
  --sp-accent: #e87a1a;
  --sp-navy: #1e3970;
  --sp-soft: #e8f0fa;
  --sp-ink: #0f172a;
  --sp-muted: #64748b;
}
.sp-root.sp-preview { width: 100%; max-width: 210mm; }
.sp-page {
  width: 210mm;
  min-height: 297mm;
  height: 297mm;
  background: #fff;
  position: relative;
  page-break-after: always;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(15,23,42,.12);
  margin-bottom: 16px;
}
.sp-page:last-child { page-break-after: auto; margin-bottom: 0; }

/* ── PAGE CHROME ── */
.sp-page-chrome {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 5px;
  background: linear-gradient(90deg, var(--sp-accent), var(--sp-primary));
  z-index: 2;
}
.sp-body {
  padding: 36px 40px 32px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  z-index: 1;
}
.sp-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e2e8f0;
}
.sp-page-head-left { display: flex; align-items: stretch; gap: 14px; min-width: 0; }
.sp-page-head-rule { width: 4px; border-radius: 4px; background: var(--sp-navy); flex-shrink: 0; }
.sp-page-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--sp-accent);
  font-family: Outfit, "DM Sans", "Noto Sans", sans-serif;
}
.sp-page-title {
  margin: 0;
  font-family: Outfit, "DM Sans", "Noto Sans", sans-serif;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -.03em;
  color: var(--sp-navy);
  line-height: 1.05;
}
.sp-page-logo { height: 40px; width: auto; max-width: 140px; object-fit: contain; object-position: right center; opacity: .92; }
.sp-subhead {
  margin: 0 0 10px;
  font-family: Outfit, "DM Sans", "Noto Sans", sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: var(--sp-primary);
  letter-spacing: .02em;
}
.sp-lead { margin: 0 0 16px; font-size: 13px; line-height: 1.55; color: #475569; }
.sp-panel { background: var(--sp-soft); border: 1px solid #d0e4f2; border-radius: 14px; padding: 16px 18px; }

/* ── PAGE 1 COVER ── */
.sp-page.sp-cover-v9 { display: block !important; padding: 0; background: #fff; }
.sp-cover-v9-photo {
  position: absolute !important;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Meet the upper-right accent triangle at the page edge without a white notch. */
  clip-path: polygon(100% 30%, 100% 100%, 70.7% 100%, 29.9% 43.3%);
}
.sp-cover-v9-top-gold {
  position: absolute !important;
  z-index: 1;
  inset: 0;
  background: var(--sp-accent);
  clip-path: polygon(59.4% 0, 100% 0, 100% 30%);
}
.sp-cover-v9-bottom-gold {
  position: absolute !important;
  z-index: 2;
  inset: 0;
  background: var(--sp-accent);
  clip-path: polygon(0 43.3%, 29.9% 43.3%, 70.7% 100%, 0 100%);
}
.sp-cover-v9-logo {
  position: absolute !important;
  z-index: 5;
  left: 5.7%;
  top: 4.3%;
  width: 36.7%;
  height: auto;
  max-height: 12%;
  object-fit: contain;
  object-position: left top;
  display: block;
}
.sp-cover-v9-main {
  position: absolute !important;
  z-index: 6;
  left: 5%;
  top: 18.2%;
  width: 77%;
  color: var(--sp-navy);
}
.sp-cover-v9-kw {
  font-size: calc(43 * 297mm / 1125);
  line-height: 1;
  font-weight: 900;
  letter-spacing: .2px;
  white-space: nowrap;
}
.sp-cover-v9-title {
  margin-top: calc(28 * 297mm / 1125);
  font-size: calc(37 * 297mm / 1125);
  line-height: 1.05;
  font-weight: 900;
  letter-spacing: -.8px;
  white-space: nowrap;
}
.sp-cover-v9-rule { width: 47.2%; height: 2px; background: var(--sp-accent); margin-top: calc(27 * 297mm / 1125); }
.sp-cover-v9-meta {
  margin-top: calc(29 * 297mm / 1125);
  color: #111;
  font-size: calc(15.5 * 297mm / 1125);
  line-height: 1.95;
  font-weight: 500;
}
.sp-cover-v9-details {
  position: absolute !important;
  z-index: 7;
  left: 7.2%;
  top: 63.1%;
  width: 47%;
  font-size: calc(13.7 * 297mm / 1125);
  line-height: 1.38;
  color: #111;
}
.sp-cover-v9-block { margin: 0 0 calc(47 * 297mm / 1125); }
.sp-cover-v9-block:last-child { margin-bottom: 0; }
.sp-cover-v9-block h3 { margin: 0 0 calc(13 * 297mm / 1125); font-size: calc(17 * 297mm / 1125); line-height: 1; font-weight: 800; }
.sp-cover-v9-block span { display: block; font-weight: 500; }
.sp-cover-v9-address { margin-top: calc(10 * 297mm / 1125); display: block; }
.sp-cover-v9-address-line { margin-top: 2px; }

/* ── WELCOME ── */
.sp-welcome-dear { margin: 0 0 14px; font-size: 15px; font-weight: 700; color: var(--sp-accent); font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; }
.sp-welcome-copy { font-size: 13.5px; line-height: 1.7; color: #334155; max-width: 560px; }
.sp-welcome-copy p { margin: 0 0 14px; }
.sp-welcome-sign { margin-top: auto; padding-top: 28px; font-size: 13px; line-height: 1.55; color: #475569; }
.sp-welcome-sign strong { display: block; margin-top: 8px; font-size: 15px; color: var(--sp-navy); font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; }

/* ── INVESTMENT ── */
.sp-price-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 14px; border-radius: 12px; overflow: hidden; }
.sp-price-table th { background: var(--sp-navy); color: #fff; text-align: left; padding: 11px 14px; font-weight: 700; font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; }
.sp-price-table th.amt, .sp-price-table td.amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sp-price-table td { border-bottom: 1px solid #e2e8f0; padding: 10px 14px; color: var(--sp-ink); background: #fff; }
.sp-price-table tbody tr:nth-child(even) td { background: #f8fafc; }
.sp-price-table tr.strong td { font-weight: 800; background: var(--sp-soft) !important; color: var(--sp-navy); }
.sp-invest-split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 8px; }
.sp-pay-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.sp-pay-list li { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.45; color: #1e293b; font-variant-numeric: tabular-nums; }
.sp-pay-text { padding-top: 3px; }
.sp-pay-tag { display: inline-block; margin-right: 6px; padding: 1px 6px; border-radius: 5px; border: 1px solid var(--sp-accent); color: var(--sp-accent); font-size: 10px; font-weight: 800; letter-spacing: .06em; line-height: 1.4; vertical-align: 1px; }
.sp-pay-pct { flex-shrink: 0; min-width: 42px; height: 26px; padding: 0 8px; border-radius: 8px; background: var(--sp-primary); color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; }
.sp-bank-block { font-size: 12px; line-height: 1.65; color: #0f172a; }
.sp-bank-block strong { display: block; margin-bottom: 4px; font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; color: var(--sp-navy); }
.sp-bank-list { display: flex; flex-direction: column; gap: 8px; }
.sp-bank-list-multi { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
.sp-bank-list-multi .sp-bank-block { font-size: 10.5px; line-height: 1.5; overflow-wrap: anywhere; }
.sp-bank-list-multi .sp-bank-block strong { margin-bottom: 2px; font-size: 11px; }
.sp-payment-assets { display: flex; justify-content: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px solid #d0e4f2; }
.sp-qr-reference { display: block; width: 96px; height: 96px; object-fit: contain; background: #fff; }
.sp-qr-figure { margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.sp-qr-upi { font-size: 10.5px; line-height: 1.3; color: #334155; text-align: center; white-space: nowrap; }
.sp-qr-upi strong { color: var(--sp-navy); font-weight: 700; }

/* ── SYSTEM / BOM ── */
.sp-bom-grid-wrap { display: flex; flex-direction: column; gap: 12px; }
.sp-bom-material-inline {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sp-bom-material-inline .sp-subhead { margin: 0; }
.sp-bom-section { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; background: #fff; }
.sp-bom-section h3 { margin: 0 0 10px; font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; font-size: 13px; font-weight: 700; color: var(--sp-accent); letter-spacing: .02em; }
.sp-bom-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 16px; font-size: 12.5px; }
.sp-bom-grid.two { grid-template-columns: 1fr 1fr; }
.sp-page-bom-system {
  height: auto;
  min-height: 297mm;
  overflow: visible;
  page-break-inside: auto;
}
.sp-page-bom-system .sp-body {
  overflow: visible;
  min-height: auto;
  padding: 28px 36px 28px;
  gap: 0;
}
.sp-page-bom-system .sp-bom-grid-wrap { gap: 8px; }
.sp-page-bom-system .sp-bom-section { padding: 10px 12px; }
.sp-page-bom-system .sp-bom-section h3 { margin-bottom: 6px; font-size: 12px; }
.sp-page-bom-system .sp-bom-grid { gap: 6px 12px; font-size: 11.5px; }
.sp-page-bom-system .sp-bom-field strong {
  font-size: 12px;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.sp-page-bom-system .sp-warranty-table { font-size: 11px; }
.sp-page-bom-system .sp-warranty-table td { padding: 3px 0; }
.sp-page-bom-system .sp-warranty-table td.value { white-space: normal; text-align: right; }
.sp-page-bom-system .sp-bom-material-inline .sp-bom-material-table td {
  font-size: 10px;
  padding: 4px 6px;
}
.sp-bos-grid .sp-bom-field strong { min-height: 2.5em; }
.sp-bom-grid.four { grid-template-columns: 1fr 1fr 1fr 1fr; }
.sp-bom-field label { display: block; color: var(--sp-muted); font-size: 10.5px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; }
.sp-bom-field strong { display: block; color: var(--sp-ink); font-size: 13px; font-weight: 700; margin-top: 2px; }
.sp-warranty-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.sp-warranty-table td { padding: 5px 0; border-bottom: 1px solid #eef2f7; vertical-align: middle; }
.sp-warranty-table tr:last-child td { border-bottom: none; }
.sp-warranty-table td.label { color: var(--sp-muted); font-size: 10.5px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; padding-right: 12px; }
.sp-warranty-table td.value { color: var(--sp-ink); font-weight: 700; text-align: right; white-space: nowrap; }
.sp-bom-brand-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.sp-bom-brand-logo {
  height: 28px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
  display: block;
}
.sp-bom-brand { font-size: 11px; font-weight: 700; color: var(--sp-primary); letter-spacing: .06em; text-transform: uppercase; }
.sp-system-hero {
  margin: 0 0 14px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(30, 57, 112, 0.1);
  max-height: 140px;
}
.sp-system-hero img {
  display: block;
  width: 100%;
  height: 140px;
  object-fit: cover;
}
.sp-bom-panel-photo {
  margin: 0 0 10px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(30, 57, 112, 0.1);
  max-width: 160px;
}
.sp-bom-panel-photo img {
  display: block;
  width: 100%;
  height: 72px;
  object-fit: cover;
}

/* ── SCOPE ── */
.sp-scope-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; flex: 1; min-height: 0; }
.sp-scope-col { border-radius: 14px; padding: 16px 18px; border: 1px solid #e2e8f0; }
.sp-scope-col.ours { background: var(--sp-soft); border-color: #c5ddf0; }
.sp-scope-col.yours { background: #fff7ed; border-color: #fed7aa; }
.sp-scope-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.sp-scope-list li { display: grid; grid-template-columns: 18px 1fr; align-items: start; gap: 8px; font-size: 12px; line-height: 18px; color: #1e293b; }
.sp-scope-num { width: 18px; height: 18px; border-radius: 5px; background: var(--sp-navy); color: #fff; font-size: 9.5px; font-weight: 700; line-height: 1; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; }
.sp-scope-col.yours .sp-scope-num { background: var(--sp-accent); color: #0f172a; }

/* ── SAVINGS + CHART ── */
.sp-savings-intro { display: grid; grid-template-columns: 1.2fr .8fr; gap: 18px; align-items: center; margin-bottom: 16px; }
.sp-savings-kw { font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; font-size: 36px; font-weight: 800; color: var(--sp-navy); letter-spacing: -.03em; line-height: 1; }
.sp-savings-blurb { margin: 8px 0 0; font-size: 12.5px; line-height: 1.5; color: #64748b; max-width: 320px; }
.sp-savings-photo { border-radius: 12px; overflow: hidden; height: 110px; border: 1px solid #e2e8f0; }
.sp-savings-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sp-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.sp-kpi-card { text-align: left; background: var(--sp-soft); border: 1px solid #d0e4f2; border-radius: 12px; padding: 12px 12px 10px; }
.sp-kpi-label { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--sp-muted); margin-bottom: 4px; }
.sp-kpi-value { font-variant-numeric: tabular-nums; font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; font-size: 20px; font-weight: 800; color: var(--sp-navy); line-height: 1.1; letter-spacing: -.02em; }
.sp-kpi-unit { margin-top: 2px; font-size: 10px; font-weight: 600; color: var(--sp-primary); }
.sp-chart-block { flex: 0 0 auto; min-height: 0; display: flex; flex-direction: column; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px 10px; background: #fff; }
.sp-chart-sub { margin: 0 0 10px; font-size: 12px; font-weight: 700; color: var(--sp-accent); font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; }
.sp-bar-chart { --sp-y-axis: 40px; display: grid; grid-template-columns: var(--sp-y-axis) minmax(0, 1fr); flex: 0 0 230px; height: 230px; min-height: 140px; }
.sp-bar-y { position: relative; margin-right: 6px; font-size: 8px; line-height: 1; color: var(--sp-muted); font-variant-numeric: tabular-nums; }
.sp-bar-y span { position: absolute; right: 0; transform: translateY(50%); white-space: nowrap; }
.sp-bar-plot { position: relative; border-left: 1px solid #94a3b8; border-bottom: 1px solid #94a3b8; }
.sp-bar-grid { position: absolute; left: 0; right: 0; height: 0; border-top: 1px dashed #dbe3ee; }
.sp-bar-row { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 4px; padding: 0 4px; }
.sp-bar { flex: 1; background: linear-gradient(180deg, var(--sp-primary), var(--sp-navy)); border-radius: 3px 3px 0 0; min-width: 0; }
.sp-bar-x { display: flex; gap: 4px; margin: 4px 0 0 var(--sp-y-axis, 40px); padding: 0 4px; font-size: 8px; line-height: 1; color: var(--sp-muted); font-variant-numeric: tabular-nums; }
.sp-bar-x span { flex: 1; min-width: 0; text-align: center; }
.sp-chart-axis { display: flex; justify-content: space-between; margin-top: 6px; padding: 0 4px 0 40px; font-size: 10px; color: var(--sp-muted); font-weight: 600; }

/* ── MERGED PAGE (scope + savings + chart + docs) ── */
.sp-page-merged .sp-body { padding: 28px 36px 24px; gap: 0; }
.sp-page-merged .sp-page-head { margin-bottom: 14px; padding-bottom: 12px; }
.sp-merged-scope-savings {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 12px;
}

.sp-scope-cols-compact {
  gap: 14px;
  min-height: 0;
  align-items: stretch;
}
.sp-scope-cols-compact .sp-scope-col {
  padding: 14px 16px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.sp-scope-cols-compact .sp-scope-list {
  flex: 1;
  gap: 7px;
}
.sp-scope-cols-compact .sp-scope-list li {
  grid-template-columns: 16px 1fr;
  font-size: 11px;
  gap: 8px;
  line-height: 16px;
}
.sp-scope-cols-compact .sp-scope-num { width: 16px; height: 16px; font-size: 9px; border-radius: 4px; }
.sp-scope-cols-compact .sp-subhead { margin-bottom: 8px; font-size: 12px; }

.sp-kpi-band {
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #c5ddf0;
  background: linear-gradient(135deg, #f0f6fc 0%, #e8f0fa 55%, #fff7ed 100%);
  box-shadow: 0 4px 18px rgba(49, 88, 166, 0.08);
}
.sp-kpi-band-hero {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 16px;
  align-items: center;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(49, 88, 166, 0.12);
}
.sp-kpi-band-label {
  margin: 0;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--sp-accent);
  font-family: Outfit, "DM Sans", "Noto Sans", sans-serif;
}
.sp-kpi-band-kw {
  margin: 4px 0 0;
  font-family: Outfit, "DM Sans", "Noto Sans", sans-serif;
  font-size: 32px;
  font-weight: 800;
  color: var(--sp-navy);
  letter-spacing: -.03em;
  line-height: 1;
}
.sp-kpi-band-blurb {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: #64748b;
  max-width: 420px;
}
.sp-kpi-band-photo {
  height: 96px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #d0e4f2;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}
.sp-kpi-band-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sp-kpi-grid-band {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0;
  margin: 0;
}
.sp-kpi-card-band {
  background: transparent;
  border: none;
  border-right: 1px solid rgba(49, 88, 166, 0.1);
  border-radius: 0;
  padding: 12px 10px 11px;
  text-align: center;
}
.sp-kpi-card-band:last-child { border-right: none; }
.sp-kpi-grid-band .sp-kpi-label { font-size: 9px; margin-bottom: 4px; }
.sp-kpi-grid-band .sp-kpi-value { font-size: 17px; }
.sp-kpi-grid-band .sp-kpi-unit { font-size: 9px; }

.sp-merged-chart-docs {
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  gap: 14px;
  min-height: 0;
  align-items: stretch;
}
.sp-merged-chart-docs-inline {
  border-top: none;
  padding-top: 0;
  min-height: 0;
  height: 100%;
}
.sp-chart-block-compact {
  box-sizing: border-box;
  padding: 12px 14px 10px;
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
}
.sp-chart-block-compact .sp-chart-sub { margin-bottom: 8px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
.sp-bar-chart-compact {
  flex: 1;
  min-height: 0;
  height: auto;
}
.sp-docs-stack {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
  min-height: 0;
  height: 100%;
}
.sp-docs-panel {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fff;
  min-height: 0;
}
.sp-docs-panel-title { margin-bottom: 4px; }
.sp-docs-intro.sp-docs-intro-compact { margin-bottom: 6px; font-size: 10px; line-height: 1.35; }
.sp-docs-table.sp-docs-table-compact td, .sp-docs-table.sp-docs-table-compact th { padding: 4px 8px; font-size: 10px; line-height: 1.3; vertical-align: middle; }
.sp-docs-table.sp-docs-table-compact th:first-child, .sp-docs-table.sp-docs-table-compact td.sr { width: 28px; text-align: center; font-variant-numeric: tabular-nums; }
.sp-docs-terms-compact {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #f8fafc;
}
.sp-docs-terms-compact ol {
  flex: 1;
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
}
.sp-docs-terms-compact li { font-size: 9px; line-height: 1.3; }
.sp-docs-terms-compact .sp-subhead { margin-bottom: 6px; font-size: 12px; }

/* ── DOCUMENTS + THANK YOU ── */
.sp-docs-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; min-height: 0; }
.sp-docs-intro { margin: 0 0 10px; font-size: 12px; color: #64748b; line-height: 1.45; }
.sp-docs-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.sp-docs-table th { background: var(--sp-navy); color: #fff; padding: 8px 10px; font-weight: 700; text-align: left; font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; }
.sp-docs-table td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
.sp-docs-table td.sr { text-align: center; width: 44px; font-weight: 700; color: var(--sp-primary); }
.sp-docs-terms { min-height: 0; }
.sp-docs-terms ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 5px; }
.sp-docs-terms li { font-size: 10px; line-height: 1.32; color: #334155; }
.sp-thanks-page { padding-bottom: 16px; display: flex; flex-direction: column; }
.sp-thanks-msg { flex: 1; display: flex; align-items: center; justify-content: center; font-family: Outfit, "DM Sans", "Noto Sans", sans-serif; font-size: 48px; font-weight: 800; color: var(--sp-navy); letter-spacing: -.02em; }
.sp-thanks-contact-card {
  margin-top: 8px;
  padding: 18px 20px 16px;
  border: 1.5px solid #dbe3f0;
  border-radius: 14px;
  background: #fff;
  color: var(--sp-navy);
}
.sp-thanks-company {
  margin: 0 0 14px;
  text-align: center;
  font-family: Outfit, "DM Sans", "Noto Sans", sans-serif;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: .02em;
  text-transform: uppercase;
  color: var(--sp-navy);
}
.sp-thanks-contact-grid {
  display: grid;
  grid-template-columns: 1.15fr 12px 1fr;
  gap: 12px 0;
  align-items: start;
  margin-bottom: 14px;
}
.sp-thanks-address {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.4;
  padding-right: 14px;
  border-right: 1.5px solid #1e293b;
}
.sp-thanks-contact-cols {
  grid-column: 3;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-left: 14px;
}
.sp-thanks-line {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
}
.sp-thanks-ico {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sp-accent);
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}
.sp-thanks-pill {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  text-align: center;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.3;
}
.sp-thanks-pill-care {
  background: var(--sp-accent);
  color: #111827;
}
.sp-thanks-pill-branches {
  background: var(--sp-navy);
  color: #fff;
}

.sp-thanks-band { margin: 0 -40px; background: var(--sp-accent); padding: 32px 40px 40px; color: var(--sp-navy); }
.sp-thanks-band h2 { margin: 0 0 16px; text-align: center; font-size: 22px; font-weight: 800; }
.sp-contact-list {
  max-width: 420px;
  margin: 0 auto 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
}
.sp-contact-row { display: flex; align-items: center; justify-content: center; gap: 12px; text-align: left; }
.sp-contact-label {
  flex-shrink: 0;
  min-width: 48px;
  font-weight: 800;
  color: var(--sp-navy);
  font-size: 10px;
  letter-spacing: .06em;
  text-transform: uppercase;
}
.sp-contact-value { font-weight: 600; line-height: 1.35; }

.sp-company-stamp {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: center;
  margin: 0 auto 10px;
}
.sp-company-stamp img {
  display: block;
  width: 220px;
  height: auto;
  max-height: 200px;
  object-fit: contain;
}

.sp-branches-section { margin-top: 16px; }
.sp-branches-heading {
  margin: 0 0 12px;
  text-align: center;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: rgba(30, 57, 112, 0.75);
}
.sp-branch-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.sp-branch-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(30, 57, 112, 0.12);
  border-radius: 10px;
  padding: 12px 12px 11px;
  box-shadow: 0 2px 8px rgba(30, 57, 112, 0.08);
  min-height: 0;
}
.sp-branch-index {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--sp-navy);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  line-height: 22px;
  text-align: center;
}
.sp-branch-body { flex: 1; min-width: 0; display: block; }
.sp-branch-name {
  display: block;
  margin-bottom: 5px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--sp-navy);
  line-height: 1.25;
}
.sp-branch-address {
  display: block;
  font-size: 10.5px;
  line-height: 1.45;
  font-weight: 500;
  color: #334155;
}

/* Tier BOM material pages (Phase 3) */
.sp-page-bom-material .sp-body {
  display: flex;
  flex-direction: column;
  padding: 22px 32px 18px;
  min-height: 0;
}
.sp-page-bom-material .sp-page-head {
  margin-bottom: 12px;
  padding-bottom: 10px;
  flex: 0 0 auto;
}
.sp-bom-table-fill {
  flex: 0 0 auto;
}
.sp-page-bom-material .sp-bom-table-fill .sp-bom-material-table {
  width: 100%;
  height: auto;
  margin-top: 0;
}
.sp-page-bom-material .sp-bom-table-fill td {
  padding: 14px 8px;
}
.sp-page-bom-material .sp-bom-table-fill td.sp-bom-mat-num {
  text-align: left;
  padding-left: 2px;
  padding-right: 4px;
}
.sp-page-bom-material .sp-bom-table-fill .sp-bom-mat-img-cell {
  width: 82px;
  padding-left: 14px;
  padding-right: 0;
  text-align: left;
  vertical-align: middle;
}
.sp-page-bom-material .sp-bom-table-fill .sp-bom-mat-img {
  width: 68px;
  height: 68px;
  margin: 0;
  object-position: left center;
}
.sp-page-bom-material .sp-bom-table-fill td.sp-bom-mat-name-cell {
  text-align: center;
  padding-left: 8px;
  padding-right: 8px;
}
.sp-bom-material-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
  font-size: 12px;
  flex: 0 0 auto;
  table-layout: fixed;
}
.sp-bom-material-table th {
  text-align: left;
  padding: 8px 10px;
  background: rgba(30, 57, 112, 0.06);
  color: var(--sp-navy);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
  border-bottom: 2px solid rgba(30, 57, 112, 0.12);
}
.sp-bom-material-table th:last-child { text-align: right; width: 80px; }
.sp-bom-material-table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(30, 57, 112, 0.08);
  vertical-align: middle;
}
.sp-bom-material-table th:first-child,
.sp-bom-material-table td.sp-bom-mat-num {
  text-align: left;
  padding-left: 4px;
  padding-right: 4px;
  width: 28px;
}
.sp-bom-material-table th:nth-child(2) {
  text-align: left;
  padding-left: 14px;
  padding-right: 0;
  width: 82px;
}
.sp-bom-mat-num {
  width: 28px;
  font-weight: 700;
  color: var(--sp-navy);
  text-align: left;
  font-size: 12px;
}
.sp-bom-mat-img-cell { width: 82px; padding-left: 14px; padding-right: 0; text-align: left; }
.sp-bom-mat-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
  object-position: left center;
  display: block;
  margin: 0;
}
.sp-bom-material-table th:nth-child(3),
.sp-bom-material-table td.sp-bom-mat-name-cell {
  text-align: center;
}
.sp-bom-mat-name { font-weight: 700; color: #0f172a; line-height: 1.35; font-size: 12px; }
.sp-bom-mat-meta { font-size: 10px; color: #64748b; margin-top: 2px; line-height: 1.3; }
.sp-bom-mat-qty {
  text-align: right;
  font-weight: 700;
  white-space: nowrap;
  color: var(--sp-navy);
  font-size: 12px;
}
.sp-bom-material-note {
  margin-top: 10px;
  flex: 0 0 auto;
  padding-top: 0;
  font-size: 9.5px;
  line-height: 1.45;
  color: #64748b;
}

/* Portfolio gallery (component list / summary page) */
.sp-portfolio-section {
  margin: 18px 0 0;
  padding: 10px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(30, 57, 112, 0.1);
  flex: 0 0 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sp-page-bom-material .sp-portfolio-section {
  flex: 1 1 auto;
}
.sp-page-portfolio .sp-body {
  display: flex;
  flex-direction: column;
  padding: 18px 20px 14px;
  min-height: 0;
}
.sp-page-portfolio .sp-page-head {
  margin-bottom: 12px;
  padding-bottom: 8px;
}
.sp-page-portfolio .sp-portfolio-section--catalog {
  flex: 1 1 auto;
  margin: 0;
  padding: 0;
  min-height: 0;
  background: transparent;
  border: none;
  border-radius: 0;
}
.sp-portfolio-catalog {
  display: none;
}
.sp-other-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
}
.sp-other-row {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.15fr);
  gap: 12px 14px;
  align-items: center;
  flex: 1 1 auto;
  min-height: 0;
  padding: 6px 0;
  border-bottom: 1px solid rgba(30, 57, 112, 0.08);
}
.sp-other-row:last-child { border-bottom: none; }
.sp-other-row--flip {
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.95fr);
}
.sp-other-row--flip .sp-other-media { order: 2; }
.sp-other-row--flip .sp-other-copy {
  order: 1;
  padding-left: 24px;
}
.sp-other-media {
  position: relative;
  height: 100%;
  min-height: 0;
  background: #fff;
  overflow: hidden;
}
.sp-other-media img {
  width: 100%;
  height: 100%;
  max-height: 58mm;
  object-fit: contain;
  object-position: center;
  display: block;
}
.sp-other-copy {
  min-width: 0;
  padding: 2px 2px 2px 4px;
}
.sp-other-kicker {
  margin: 0 0 2px;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sp-accent);
}
.sp-other-title {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--sp-navy);
  line-height: 1.15;
}
.sp-other-tag {
  margin: 0 0 5px;
  font-size: 8.5px;
  font-weight: 600;
  color: #64748b;
  line-height: 1.3;
}
.sp-other-features {
  margin: 0;
  padding: 0;
  list-style: none;
}
.sp-other-features li {
  position: relative;
  padding: 1.5px 0 1.5px 12px;
  font-size: 8.5px;
  line-height: 1.35;
  color: #1e293b;
  font-weight: 500;
}
.sp-other-features li::before {
  content: "\\25A0";
  position: absolute;
  left: 0;
  top: 1.5px;
  font-size: 7px;
  line-height: 11.5px;
  color: var(--sp-navy);
}
.sp-other-note {
  margin: 5px 0 0;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sp-navy);
}
.sp-portfolio-heading {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--sp-navy);
  flex: 0 0 auto;
}
.sp-portfolio-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
  align-items: stretch;
}
.sp-portfolio-card {
  margin: 0;
  min-height: 0;
  height: 100%;
}
.sp-portfolio-square {
  position: relative;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(30, 57, 112, 0.08);
  background: #fff;
}
.sp-portfolio-square img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
}
.sp-portfolio-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 6px 6px 5px;
  font-size: 8px;
  line-height: 1.3;
  color: #fff;
  text-align: center;
  background: linear-gradient(transparent, rgba(15, 23, 42, 0.72));
}

@media print {
  html, body {
    margin: 0;
    padding: 0;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .qp-toolbar { display: none !important; }
  .sp-page { box-shadow: none; margin: 0; }
  .sp-page-bom-system {
    height: auto !important;
    overflow: visible !important;
    page-break-inside: auto;
  }
  .sp-page-bom-system .sp-body { overflow: visible !important; }
  .sp-page-bom-system .sp-system-hero { max-height: 90px; }
  .sp-page-bom-system .sp-system-hero img { height: 90px; }
  .sp-page-bom-system .sp-bom-section { padding: 8px 10px; break-inside: avoid; }
  .sp-page-bom-system .sp-bom-grid-wrap { gap: 8px; }
  .sp-page-bom-system .sp-bom-section-bos { break-inside: avoid; }
}
`;
