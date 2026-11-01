export const BOM_QUOTATION_CSS = `
:root {
  --bq-page-w: 210mm;
  --bq-page-h: 297mm;
  --bq-font: "Segoe UI", system-ui, -apple-system, sans-serif;
}

.bq-root {
  font-family: var(--bq-font);
  color: #1e293b;
  background: #e2e8f0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.bq-root.bq-premium {
  --bq-accent: #e87a1a;
  --bq-accent-deep: #c98700;
  --bq-accent-soft: #fff4d6;
  --bq-ink: #1e3970;
  --bq-panel: #1e3970;
}

.bq-root.bq-regular {
  --bq-accent: #3158a6;
  --bq-accent-soft: #e8f0fa;
  --bq-ink: #1e3970;
  --bq-panel: #3158a6;
}

.bq-page {
  width: var(--bq-page-w);
  min-height: var(--bq-page-h);
  margin: 0 auto 16px;
  background: #fff;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.12);
  overflow: hidden;
  position: relative;
  page-break-after: always;
}

.bq-page:last-child { page-break-after: auto; }

/* ── Premium cover (compact split layout) ── */
.bq-premium .bq-cover {
  min-height: var(--bq-page-h);
  display: flex;
  flex-direction: column;
  background: #fff;
}

.bq-premium .bq-cover-bar {
  height: 5px;
  background: linear-gradient(90deg, var(--bq-accent) 0%, #ffd36a 50%, var(--bq-accent) 100%);
}

.bq-premium .bq-cover-header {
  background: var(--bq-panel);
  color: #fff;
  padding: 10mm 16mm 9mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.bq-premium .bq-cover-header-left { display: flex; align-items: center; gap: 14px; }
.bq-premium .bq-cover-logo { width: 130px; height: auto; }
.bq-premium .bq-cover-header-meta { text-align: right; font-size: 10px; line-height: 1.5; color: #cbd5e1; }
.bq-premium .bq-cover-header-meta strong { display: block; color: #fff; font-size: 12px; margin-top: 2px; }

.bq-premium .bq-badge {
  display: inline-block;
  background: var(--bq-accent);
  color: var(--bq-panel);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 3px;
}

.bq-premium .bq-cover-main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 68mm;
  gap: 0;
  min-height: 0;
}

.bq-premium .bq-cover-content {
  padding: 12mm 16mm 10mm;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bq-premium .bq-cover-title {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  color: var(--bq-ink);
  line-height: 1.15;
}

.bq-premium .bq-cover-sub {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.bq-premium .bq-cover-highlights {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 4px;
}

.bq-premium .bq-cover-pill {
  background: var(--bq-accent-soft);
  border: 1px solid #fde68a;
  border-left: 3px solid var(--bq-accent);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 10px;
  font-weight: 700;
  color: var(--bq-ink);
  line-height: 1.35;
}

.bq-premium .bq-cover-customer {
  margin-top: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.bq-premium .bq-cover-customer-head {
  background: #f1f5f9;
  padding: 7px 12px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--bq-ink);
}

.bq-premium .bq-cover-customer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

.bq-premium .bq-cover-field {
  padding: 9px 12px;
  border-top: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  font-size: 11px;
}

.bq-premium .bq-cover-field:nth-child(2n) { border-right: none; }
.bq-premium .bq-cover-field label {
  display: block;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 3px;
}

.bq-premium .bq-cover-field strong { color: #0f172a; font-weight: 700; }

.bq-premium .bq-cover-photo-wrap {
  position: relative;
  background: #0f172a;
  overflow: hidden;
}

.bq-premium .bq-cover-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.92;
}

.bq-premium .bq-cover-photo-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 40%, rgba(30, 57, 112, 0.85) 100%);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 14px;
  color: #fff;
}

.bq-premium .bq-cover-photo-overlay strong {
  font-size: 13px;
  color: var(--bq-accent);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.bq-premium .bq-cover-photo-overlay span { font-size: 11px; margin-top: 4px; line-height: 1.4; }

.bq-premium .bq-cover-footer {
  padding: 8mm 16mm;
  background: var(--bq-panel);
  color: #cbd5e1;
  font-size: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.bq-premium .bq-cover-footer strong { color: #fff; }

/* Premium BOM table (dense) */
.bq-premium .bq-body { padding: 12mm 14mm 14mm; display: flex; flex-direction: column; gap: 8px; }

.bq-premium .bq-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 3px solid var(--bq-accent);
}

.bq-premium .bq-head-left h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--bq-ink);
}

.bq-premium .bq-head-kicker {
  margin: 0 0 2px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--bq-accent-deep);
}

.bq-premium .bq-head-logo { width: 72px; height: auto; }

.bq-premium .bq-prem-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}

.bq-premium .bq-prem-table thead th {
  background: var(--bq-panel);
  color: #fff;
  text-align: left;
  padding: 7px 8px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.bq-premium .bq-prem-table tbody td {
  padding: 6px 8px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: middle;
}

.bq-premium .bq-prem-table tbody tr:nth-child(even) td { background: #f8fafc; }

.bq-premium .bq-prem-num {
  width: 26px;
  font-weight: 800;
  color: var(--bq-accent-deep);
  text-align: center;
}

.bq-premium .bq-prem-img-cell { width: 44px; }
.bq-premium .bq-prem-img {
  width: 38px;
  height: 38px;
  object-fit: contain;
  border-radius: 5px;
  background: #fff;
  border: 1px solid #e2e8f0;
  padding: 2px;
}

.bq-premium .bq-prem-name { font-weight: 700; color: #0f172a; line-height: 1.3; }
.bq-premium .bq-prem-meta { font-size: 9px; color: #64748b; margin-top: 2px; }
.bq-premium .bq-prem-qty { width: 56px; text-align: right; font-weight: 600; white-space: nowrap; }

.bq-premium .bq-page-note {
  margin-top: auto;
  padding-top: 8px;
  font-size: 8px;
  color: #94a3b8;
  border-top: 1px dashed #e2e8f0;
}

/* Premium commercial (compact) */
.bq-premium .bq-commercial-wrap {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
}

.bq-premium .bq-summary {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  height: fit-content;
}

.bq-premium .bq-summary-head {
  background: var(--bq-panel);
  color: #fff;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 11px;
}

.bq-premium .bq-summary-body { padding: 10px 12px; }

.bq-premium .bq-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  font-size: 10px;
  border-bottom: 1px dashed #e2e8f0;
}

.bq-premium .bq-row:last-child { border-bottom: none; }
.bq-premium .bq-row.bq-grand {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 2px solid var(--bq-accent);
  border-bottom: none;
  font-size: 12px;
  font-weight: 800;
  color: var(--bq-ink);
}

.bq-premium .bq-payment {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 9px;
  line-height: 1.45;
  height: fit-content;
}

.bq-premium .bq-payment h3 { margin: 0 0 6px; font-size: 11px; color: var(--bq-ink); }
.bq-premium .bq-bank-line { margin: 2px 0; }
.bq-premium .bq-pay-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.bq-premium .bq-qr { width: 80px; height: 80px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 6px; padding: 3px; background: #fff; }

.bq-premium .bq-terms-block {
  grid-column: 1 / -1;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 8px;
  color: #64748b;
  line-height: 1.45;
  white-space: pre-wrap;
}

.bq-premium .bq-footer {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  font-size: 8px;
  color: #94a3b8;
  text-align: center;
}

/* ── Regular cover ── */
.bq-regular .bq-cover {
  min-height: var(--bq-page-h);
  background: #fff;
  display: flex;
  flex-direction: column;
}

.bq-regular .bq-cover-top {
  background: var(--bq-panel);
  color: #fff;
  padding: 16mm 20mm 14mm;
}

.bq-regular .bq-cover-top-inner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.bq-regular .bq-badge {
  background: #fff;
  color: var(--bq-panel);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 5px 12px;
  border-radius: 999px;
}

.bq-regular .bq-cover-logo { width: 160px; filter: brightness(0) invert(1); }
.bq-regular .bq-cover-body { padding: 18mm 20mm; flex: 1; display: flex; flex-direction: column; }

.bq-regular .bq-cover-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--bq-ink);
  line-height: 1.2;
}

.bq-regular .bq-cover-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.bq-regular .bq-cover-band {
  margin-top: 16mm;
  background: var(--bq-accent-soft);
  border-left: 4px solid var(--bq-accent);
  padding: 14px 16px;
  border-radius: 0 8px 8px 0;
}

.bq-regular .bq-cover-meta {
  margin-top: auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 20px;
  font-size: 12px;
}

.bq-regular .bq-cover-meta label {
  display: block;
  color: #64748b;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 3px;
}

.bq-regular .bq-cover-meta strong { color: #0f172a; font-size: 13px; }

/* Regular inner pages */
.bq-regular .bq-body { padding: 16mm 18mm 18mm; min-height: calc(var(--bq-page-h) - 2mm); display: flex; flex-direction: column; }

.bq-regular .bq-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--bq-accent);
  margin-bottom: 14px;
}

.bq-regular .bq-head-left h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--bq-ink);
  line-height: 1.1;
}

.bq-regular .bq-head-kicker {
  margin: 0 0 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--bq-accent);
}

.bq-regular .bq-head-logo { width: 88px; height: auto; }

.bq-regular .bq-highlights {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.bq-regular .bq-highlight {
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.35;
  background: var(--bq-accent-soft);
  color: var(--bq-ink);
  border: 1px solid #cbd5e1;
}

.bq-regular .bq-table { width: 100%; border-collapse: collapse; font-size: 11px; flex: 1; }
.bq-regular .bq-table th {
  background: var(--bq-panel);
  color: #fff;
  text-align: left;
  padding: 8px 10px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.bq-regular .bq-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
}

.bq-regular .bq-table tr:nth-child(even) td { background: #f8fafc; }
.bq-regular .bq-td-num { width: 28px; color: var(--bq-accent); font-weight: 800; }

.bq-regular .bq-commercial { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; flex: 1; }

.bq-regular .bq-summary {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}

.bq-regular .bq-summary-head { background: var(--bq-panel); color: #fff; padding: 10px 14px; font-weight: 700; font-size: 12px; }
.bq-regular .bq-summary-body { padding: 12px 14px; }

.bq-regular .bq-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 11px;
  border-bottom: 1px dashed #e2e8f0;
}

.bq-regular .bq-row:last-child { border-bottom: none; }
.bq-regular .bq-row strong { font-weight: 700; }
.bq-regular .bq-row.bq-grand { margin-top: 6px; padding-top: 8px; border-top: 2px solid var(--bq-accent); border-bottom: none; font-size: 13px; }

.bq-regular .bq-payment {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 10px;
  line-height: 1.5;
}

.bq-regular .bq-payment h3 { margin: 0 0 8px; font-size: 12px; color: var(--bq-ink); }
.bq-regular .bq-bank-line { margin: 3px 0; }
.bq-regular .bq-qr-wrap { margin-top: 10px; display: flex; justify-content: flex-end; }
.bq-regular .bq-qr { width: 96px; height: 96px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px; background: #fff; }

.bq-regular .bq-terms {
  margin-top: 12px;
  font-size: 9px;
  color: #64748b;
  line-height: 1.45;
  white-space: pre-wrap;
}

.bq-regular .bq-footer {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  font-size: 9px;
  color: #94a3b8;
  text-align: center;
}

@media print {
  body { background: #fff; margin: 0; }
  .bq-root { background: #fff; }
  .bq-page { margin: 0; box-shadow: none; width: 100%; min-height: 100vh; }
}
`;
