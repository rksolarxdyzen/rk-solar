/** Shared v9 quotation cover layout (solar + non-solar). Requires --sp-accent, --sp-navy, --sp-primary on root. */
export const QUOTATION_COVER_V9_CSS = `
.sp-page.sp-cover-v9 {
  display: block !important;
  padding: 0;
  background: #fff;
  width: 210mm;
  min-height: 297mm;
  height: 297mm;
  position: relative;
  overflow: hidden;
}
.sp-cover-v9-photo {
  position: absolute !important;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  font-family: Outfit, "DM Sans", sans-serif;
  font-size: calc(43 * 297mm / 1125);
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.sp-cover-v9-title {
  margin-top: calc(28 * 297mm / 1125);
  font-family: Outfit, "DM Sans", sans-serif;
  font-size: calc(37 * 297mm / 1125);
  line-height: 1.05;
  font-weight: 900;
  letter-spacing: -0.8px;
  white-space: nowrap;
}
.sp-cover-v9-rule {
  width: 47.2%;
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--sp-accent), var(--sp-primary));
  margin-top: calc(27 * 297mm / 1125);
}
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
.sp-cover-v9-block h3 {
  margin: 0 0 calc(13 * 297mm / 1125);
  font-size: calc(17 * 297mm / 1125);
  line-height: 1;
  font-weight: 800;
  color: var(--sp-navy);
  font-family: Outfit, "DM Sans", sans-serif;
  letter-spacing: 0.04em;
}
.sp-cover-v9-block span { display: block; font-weight: 500; }
.sp-cover-v9-address { margin-top: calc(10 * 297mm / 1125); display: block; }
.sp-cover-v9-address-line { margin-top: 2px; }
`;

export const NON_SOLAR_COVER_CSS = `
.ns-cover-title-only {
  margin-top: 0 !important;
  font-size: calc(43 * 297mm / 1125) !important;
  letter-spacing: -0.02em;
}
.ns-cover-tagline {
  margin-top: calc(14 * 297mm / 1125);
  max-width: 88%;
  font-size: calc(13.5 * 297mm / 1125);
  line-height: 1.45;
  font-weight: 600;
  color: var(--sp-primary);
  letter-spacing: 0.01em;
}
.ns-cover .sp-cover-v9-photo {
  object-position: 72% 42%;
}
.ns-cover-details-card {
  padding: calc(14 * 297mm / 1125) calc(16 * 297mm / 1125);
  border-radius: calc(12 * 297mm / 1125);
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(30, 57, 112, 0.1);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
`;
