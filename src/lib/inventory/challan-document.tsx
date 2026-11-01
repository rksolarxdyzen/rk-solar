import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { BRAND } from "@/lib/quotations/brand";

const NAVY = BRAND.colors.navy;
const ORANGE = BRAND.colors.orange;

const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontSize: 9, fontFamily: "Helvetica", color: "#1f1f1f" },
  hdr: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2pt solid ${ORANGE}`, paddingBottom: 10, marginBottom: 12 },
  logo: { width: 150, height: 42, objectFit: "contain" },
  co: { fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY },
  coMeta: { color: "#555555", marginTop: 2, maxWidth: 260 },
  titleBox: { alignItems: "flex-end" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 1 },
  titleMeta: { marginTop: 3, fontSize: 9 },
  bold: { fontFamily: "Helvetica-Bold" },
  two: { flexDirection: "row", gap: 12, marginBottom: 12 },
  box: { flex: 1, border: "0.75pt solid #d9d9d9", borderRadius: 3, padding: 8 },
  h2: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#777777", textTransform: "uppercase", marginBottom: 4 },
  th: { flexDirection: "row", backgroundColor: NAVY, color: "#ffffff", fontFamily: "Helvetica-Bold", paddingVertical: 5, paddingHorizontal: 4 },
  tr: { flexDirection: "row", borderBottom: "0.5pt solid #dddddd", paddingVertical: 5, paddingHorizontal: 4 },
  cNo: { width: "6%" },
  cItem: { width: "58%", paddingRight: 6 },
  cHsn: { width: "12%" },
  cQty: { width: "12%", textAlign: "right" },
  cUnit: { width: "12%", textAlign: "right" },
  serialLabel: { marginTop: 3, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#555555" },
  serials: { marginTop: 1, fontSize: 7.5, fontFamily: "Courier", lineHeight: 1.35 },
  condition: { marginTop: 2, fontSize: 7.5, color: "#555555" },
  totalRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 4, borderTop: `1pt solid ${NAVY}` },
  remarksBox: { marginTop: 12, border: "0.75pt solid #d9d9d9", borderRadius: 3, padding: 8 },
  remarksBody: { marginTop: 4, color: "#333333", lineHeight: 1.4 },
  notes: { marginTop: 10, color: "#444444" },
  sign: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  signBox: { width: "40%", borderTop: "0.75pt solid #777777", paddingTop: 4, textAlign: "center", color: "#444444" },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#999999" },
});

export interface ChallanLine {
  name: string;
  sku: string | null;
  hsn: string | null;
  quantity: number;
  unit: string;
  serials: string[];
  returnCondition?: string | null;
}

export type ChallanVariant = "delivery" | "return";

export interface ChallanDocProps {
  variant?: ChallanVariant;
  challanNo: string;
  date: string;
  reversed: boolean;
  company: { name: string; phone?: string | null; email?: string | null; address?: string | null; gstin?: string | null };
  logo: { data: Buffer; format: "png" } | null;
  customer: { name: string; phone?: string | null; address?: string | null; meterName?: string | null; partyKind?: string | null };
  vehicleNo?: string | null;
  deliveredBy?: string | null;
  notes?: string | null;
  lines: ChallanLine[];
}

const qtyText = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

export function ChallanDocument(p: ChallanDocProps) {
  const isReturn = p.variant === "return";
  const title = isReturn ? "RETURN CHALLAN" : "DELIVERY CHALLAN";
  const docTitle = isReturn ? `Return Challan ${p.challanNo}` : `Delivery Challan ${p.challanNo}`;
  const totalQty = p.lines.reduce((n, l) => n + l.quantity, 0);
  const totalSerials = p.lines.reduce((n, l) => n + l.serials.length, 0);
  const notesText = p.notes?.trim() || "";

  return (
    <Document title={docTitle} author={p.company.name}>
      <Page size="A4" style={s.page}>
        <View style={s.hdr}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
            {p.logo ? <Image src={p.logo} style={s.logo} /> : <Text style={s.co}>{p.company.name}</Text>}
            {p.logo && <Text style={[s.co, { fontSize: 11, marginTop: 4 }]}>{p.company.name}</Text>}
            {p.company.address ? <Text style={s.coMeta}>{p.company.address}</Text> : null}
            <Text style={s.coMeta}>{[p.company.phone, p.company.email].filter(Boolean).join("  ·  ")}</Text>
            {p.company.gstin ? <Text style={s.coMeta}>GSTIN: {p.company.gstin}</Text> : null}
          </View>
          <View style={s.titleBox}>
            <Text style={s.title}>{title}</Text>
            <Text style={s.titleMeta}>
              No. <Text style={s.bold}>{p.challanNo}</Text>
            </Text>
            <Text style={s.titleMeta}>Date: {p.date}</Text>
            {p.reversed ? <Text style={[s.titleMeta, { color: "#c62828", fontFamily: "Helvetica-Bold" }]}>CANCELLED (REVERSED)</Text> : null}
          </View>
        </View>

        <View style={s.two}>
          <View style={s.box}>
            <Text style={s.h2}>{isReturn ? "Received from" : "Deliver to"}</Text>
            <Text style={s.bold}>{p.customer.name}</Text>
            {p.customer.phone ? <Text>{p.customer.phone}</Text> : null}
            {p.customer.address ? <Text>{p.customer.address}</Text> : null}
            {p.customer.meterName ? <Text>Meter name: {p.customer.meterName}</Text> : null}
            {p.customer.partyKind ? <Text>Type: {p.customer.partyKind}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.h2}>{isReturn ? "Return details" : "Dispatch details"}</Text>
            {!isReturn && <Text>Vehicle no.: {p.vehicleNo || "—"}</Text>}
            {!isReturn && <Text>Delivered by: {p.deliveredBy || "—"}</Text>}
            <Text>
              Items: {p.lines.length}
              {totalSerials > 0 ? `  ·  Serial numbers: ${totalSerials}` : ""}
            </Text>
          </View>
        </View>

        <View style={s.th} fixed>
          <Text style={s.cNo}>#</Text>
          <Text style={s.cItem}>Item</Text>
          <Text style={s.cHsn}>HSN</Text>
          <Text style={s.cQty}>Qty</Text>
          <Text style={s.cUnit}>Unit</Text>
        </View>
        {p.lines.map((l, i) => (
          <View key={i} style={s.tr} wrap>
            <Text style={s.cNo}>{i + 1}</Text>
            <View style={s.cItem}>
              <Text style={s.bold}>{l.name}</Text>
              {l.sku ? <Text style={{ color: "#666666" }}>SKU: {l.sku}</Text> : null}
              {isReturn && l.returnCondition ? (
                <Text style={s.condition}>Condition: {l.returnCondition}</Text>
              ) : null}
              {l.serials.length > 0 ? (
                <>
                  <Text style={s.serialLabel}>Serial numbers ({l.serials.length}):</Text>
                  <Text style={s.serials}>{l.serials.join(",  ")}</Text>
                </>
              ) : null}
            </View>
            <Text style={s.cHsn}>{l.hsn || "—"}</Text>
            <Text style={s.cQty}>{qtyText(l.quantity)}</Text>
            <Text style={s.cUnit}>{l.unit}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[s.cNo, s.bold]} />
          <Text style={[s.cItem, s.bold]}>Total quantity</Text>
          <Text style={s.cHsn} />
          <Text style={[s.cQty, s.bold]}>{qtyText(totalQty)}</Text>
          <Text style={s.cUnit} />
        </View>

        {notesText ? (
          <View style={s.remarksBox}>
            <Text style={s.h2}>Remarks</Text>
            <Text style={s.remarksBody}>{notesText}</Text>
          </View>
        ) : null}

        <Text style={s.notes}>
          {isReturn
            ? "Material returned as listed. This is a return challan, not a tax credit note."
            : "Material received in good condition. This is a delivery challan, not a tax invoice."}
        </Text>

        <View style={s.sign} wrap={false}>
          <Text style={s.signBox}>{isReturn ? "Returned by (customer)" : "Receiver's signature"}</Text>
          <Text style={s.signBox}>For {p.company.name}{"\n"}Authorised signatory</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>{p.challanNo}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
