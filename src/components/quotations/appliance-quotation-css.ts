import { NON_SOLAR_COVER_CSS, QUOTATION_COVER_V9_CSS } from "@/components/quotations/quotation-cover-v9-css";

export const APPLIANCE_QUOTATION_CSS = `
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Outfit:wght@500;600;700;800&display=swap");
@page { size: A4; margin: 0; }

.aq-root {
  margin: 0;
  padding: 0;
  background: #e2e8f0;
  font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.aq-root.aq-preview { padding: 16px; }
.aq-root {
  --aq-primary: #3158a6;
  --aq-accent: #e87a1a;
  --aq-navy: #1e3970;
  --aq-soft: #e8f0fa;
  --aq-ink: #0f172a;
  --aq-muted: #64748b;
  --sp-primary: #3158a6;
  --sp-accent: #e87a1a;
  --sp-navy: #1e3970;
}
.aq-page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto 16px;
  background: #fff;
  position: relative;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12);
  page-break-after: always;
}
.aq-page:last-child { page-break-after: auto; margin-bottom: 0; }
.aq-root .sp-page.sp-cover-v9 {
  margin: 0 auto 16px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12);
  page-break-after: always;
}
.aq-root .sp-page.sp-cover-v9:last-child { margin-bottom: 0; }

${QUOTATION_COVER_V9_CSS}
${NON_SOLAR_COVER_CSS}

/* Offer page */
.aq-chrome {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  background: linear-gradient(90deg, var(--aq-accent), var(--aq-primary));
  z-index: 2;
}
.aq-body {
  padding: 36px 40px 32px;
  min-height: 297mm;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.aq-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e2e8f0;
}
.aq-page-head-left { display: flex; align-items: stretch; gap: 14px; min-width: 0; }
.aq-page-head-rule {
  width: 4px;
  border-radius: 4px;
  background: var(--aq-navy);
  flex-shrink: 0;
}
.aq-page-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aq-accent);
  font-family: Outfit, "DM Sans", sans-serif;
}
.aq-page-title {
  margin: 0;
  font-family: Outfit, "DM Sans", sans-serif;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--aq-navy);
  line-height: 1.05;
}
.aq-page-logo {
  height: 40px;
  width: auto;
  max-width: 140px;
  object-fit: contain;
  object-position: right center;
  opacity: 0.92;
}
.aq-lead {
  margin: 0 0 16px;
  font-size: 12.5px;
  line-height: 1.55;
  color: #475569;
}
.aq-table-wrap {
  border: 1px solid #d0e4f2;
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 18px;
}
.aq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.aq-table th {
  text-align: left;
  padding: 10px 12px;
  background: var(--aq-soft);
  color: var(--aq-navy);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-bottom: 1px solid #d0e4f2;
}
.aq-table th.num,
.aq-table td.num { text-align: right; white-space: nowrap; }
.aq-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e8f0fa;
  vertical-align: middle;
  color: #334155;
}
.aq-table tbody tr:last-child td { border-bottom: none; }
.aq-table tbody tr:nth-child(even) td { background: #fafcff; }
.aq-item-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.aq-item-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid #e2e8f0;
  background: #fff;
  flex-shrink: 0;
}
.aq-item-thumb-placeholder {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  flex-shrink: 0;
}
.aq-item-name {
  font-weight: 700;
  color: var(--aq-ink);
  line-height: 1.35;
}
.aq-item-meta {
  font-size: 9.5px;
  color: var(--aq-muted);
  margin-top: 2px;
  line-height: 1.35;
}
.aq-bottom {
  margin-top: auto;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 14px;
  align-items: start;
}
.aq-panel {
  background: var(--aq-soft);
  border: 1px solid #d0e4f2;
  border-radius: 14px;
  padding: 16px 18px;
}
.aq-subhead {
  margin: 0 0 10px;
  font-family: Outfit, "DM Sans", sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: var(--aq-primary);
  letter-spacing: 0.02em;
}
.aq-panel p,
.aq-panel pre {
  margin: 0;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  color: #334155;
}
.aq-bank-block {
  margin-top: 10px;
  font-size: 11px;
  line-height: 1.55;
  color: #334155;
}
.aq-bank-block strong {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--aq-navy);
}
.aq-payment-assets {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: #334155;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #d0e4f2;
}
.aq-qr {
  width: 88px;
  height: 88px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid #d0e4f2;
  background: #fff;
}
.aq-totals {
  border: 1px solid #d0e4f2;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
}
.aq-totals-head {
  padding: 10px 16px;
  background: var(--aq-navy);
  color: #fff;
  font-family: Outfit, "DM Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.aq-totals-body { padding: 12px 16px 14px; }
.aq-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 12px;
  color: #475569;
}
.aq-row strong { color: var(--aq-ink); font-weight: 700; }
.aq-row.aq-grand {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 2px solid var(--aq-navy);
  font-size: 15px;
  font-weight: 800;
  color: var(--aq-navy);
  font-family: Outfit, "DM Sans", sans-serif;
}
.aq-notes {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
}
.aq-notes h3 {
  margin: 0 0 6px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #b45309;
}
.aq-notes p {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.5;
  color: #92400e;
}
.aq-footer {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
  font-size: 9.5px;
  line-height: 1.5;
  color: var(--aq-muted);
  text-align: center;
}
.aq-footer strong { color: var(--aq-navy); }

@media print {
  .aq-root { background: #fff; }
  .aq-root.aq-preview { padding: 0; }
  .aq-page { box-shadow: none; margin: 0; }
}
`;
