import jsPDF from "jspdf";
import type { Invoice } from "./db";
import { numberToWords } from "./db";
import { getSettings } from "./db";

export async function generateInvoicePDF(invoice: Invoice): Promise<void> {
  const settings = await getSettings();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 10;
  let y = margin;

  const pageW = W - margin * 2;

  function line(yPos: number) {
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, yPos, W - margin, yPos);
  }

  function vline(x: number, yStart: number, yEnd: number) {
    doc.setDrawColor(180, 180, 180);
    doc.line(x, yStart, x, yEnd);
  }

  function boldText(text: string, x: number, _y: number, size = 9) {
    doc.setFontSize(size);
    doc.setFont("helvetica", "bold");
    doc.text(text, x, _y);
  }

  function normalText(text: string, x: number, _y: number, size = 8) {
    doc.setFontSize(size);
    doc.setFont("helvetica", "normal");
    doc.text(text, x, _y);
  }

  // ── TITLE ──────────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TAX INVOICE", W / 2, y + 6, { align: "center" });
  doc.rect(margin, y, pageW, 10);
  y += 10;

  // ── ORIGINAL / DUPLICATE label (inside its own row, not overlapping) ───
  const copyRowH = 7;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Original / Duplicate / Triplicate copy", W - margin - 2, y + 4.5, { align: "right" });
  line(y + copyRowH);
  y += copyRowH;

  // ── SELLER + INVOICE DETAILS ───────────────────────────────────────────
  const sellerBoxH = 42;
  const halfW = pageW / 2;

  // Seller box (left)
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, halfW, sellerBoxH, "F");
  doc.rect(margin, y, halfW, sellerBoxH);

  boldText(settings.companyName, margin + 2, y + 6, 10);
  const addrLines = settings.address.split("\n");
  let textY = y + 12;
  addrLines.forEach((l) => {
    normalText(l, margin + 2, textY, 7.5);
    textY += 4;
  });
  normalText(`GSTIN/UIN : ${settings.gstNumber}`, margin + 2, textY, 7.5);
  textY += 4;
  normalText(`STATE CODE : ${settings.state}, CODE ${settings.stateCode}`, margin + 2, textY, 7.5);
  textY += 4;
  normalText(`PLACE OF SUPPLY : ${settings.placeOfSupply}`, margin + 2, textY, 7.5);

  // Invoice details box (right)
  const rx = margin + halfW;
  doc.rect(rx, y, halfW, sellerBoxH);

  // Invoice details: left sub-column labels at rx+2, values at rx+38
  const labelCol = rx + 2;
  const valueCol = rx + 38;
  normalText("Invoice No.:", labelCol, y + 6, 7.5);
  boldText(invoice.invoiceNumber, valueCol, y + 6, 8);
  normalText("Dated:", labelCol, y + 13, 7.5);
  boldText(
    new Date(invoice.invoiceDate)
      .toLocaleDateString("en-IN", { day: "numeric", month: "numeric", year: "numeric" })
      .replace(/\//g, "-"),
    valueCol,
    y + 13,
    8
  );
  normalText("Delivery Note:", labelCol, y + 20, 7.5);
  normalText("Supplier's Ref.:", labelCol, y + 27, 7.5);
  normalText(invoice.suppliersRef || "Other References", valueCol, y + 27, 7.5);
  normalText("Buyers Order No.:", labelCol, y + 34, 7.5);
  normalText(invoice.buyersOrderNo || "", valueCol, y + 34, 7.5);

  y += sellerBoxH;

  // ── BUYER INFO ─────────────────────────────────────────────────────────
  const buyerBoxH = 38;
  const buyerMidX = margin + halfW;

  doc.rect(margin, y, pageW, buyerBoxH);
  vline(buyerMidX, y, y + buyerBoxH);

  // Left side: buyer name + address
  boldText("BUYER'S INFO :", margin + 2, y + 5, 8);
  boldText(invoice.buyer.name, margin + 2, y + 11, 9);
  const bLines = invoice.buyer.address.split(/\n|,|;/).filter(Boolean);
  let by = y + 17;
  bLines.slice(0, 3).forEach((l) => {
    normalText(l.trim(), margin + 2, by, 7.5);
    by += 4;
  });
  if (invoice.buyer.gstNumber) {
    normalText("GST NO.: ", margin + 2, by, 7.5);
    boldText(invoice.buyer.gstNumber, margin + 18, by, 7.5);
  }

  // Right side: despatch details — labels left-aligned at dx, values indented at dx+42
  const dx = buyerMidX + 2;
  const dv = dx + 44; // value column for despatch fields
  normalText("Despatch Document No.:", dx, y + 5, 7.5);
  normalText(invoice.despatchDocNo || "", dv, y + 5, 7.5);
  normalText("Delivery Note Dated:", dx, y + 11, 7.5);
  normalText("Despatch Through :", dx, y + 17, 7.5);
  boldText(invoice.despatchThrough || "BY ROAD", dv, y + 17, 7.5);
  normalText("Destination:", dx, y + 23, 7.5);
  boldText(invoice.destination || invoice.buyer.state || "", dv, y + 23, 7.5);
  normalText("Bill of Landing/LR-RR No.:", dx, y + 28, 7.5);
  normalText("Motor vehicle No.:", dx, y + 34, 7.5);
  normalText(invoice.motorVehicleNo || "", dv, y + 34, 7.5);

  y += buyerBoxH;

  // ── TABLE HEADER ───────────────────────────────────────────────────────
  const cols = { sno: 8, desc: 50, hsn: 22, gst: 14, qty: 14, rate: 16, unit: 16, amt: 20 };
  const headerH = 8;
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y, pageW, headerH, "F");
  line(y);
  line(y + headerH);

  let cx = margin;
  const headers = ["S.NO.", "Description Of Goods", "HSN/SAC", "GST Rate", "Quantity", "Rate", "Per kgs/Units", "Amount"];
  const widths = Object.values(cols);
  headers.forEach((h, i) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(h, cx + widths[i] / 2, y + 5, { align: "center" });
    cx += widths[i];
    if (i < headers.length - 1) vline(cx, y, y + headerH);
  });

  y += headerH;

  // ── ITEMS ──────────────────────────────────────────────────────────────
  const lineH = 4.5;   // mm per text line
  const cellPadT = 5;  // top padding inside cell
  const cellPadB = 4;  // bottom padding

  invoice.items.forEach((item, idx) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    // Split product name and description into wrapped lines to calculate row height
    const descMaxW = cols.desc - 4;
    const nameLines: string[] = doc.splitTextToSize(item.productName, descMaxW);

    // Support Enter key line breaks AND auto-wrap within each line
    const rawDescLines = item.description ? item.description.split(/\r?\n/) : [];
    const descLines: string[] = rawDescLines.flatMap((l) =>
      l.trim() ? doc.splitTextToSize(l.trim(), descMaxW) : [""]
    );
    const totalTextLines = nameLines.length + (descLines.length > 0 && item.description ? descLines.length : 0);
    const rowH = Math.max(14, cellPadT + totalTextLines * lineH + cellPadB);

    const rowStartY = y;
    cx = margin;

    // S.No — vertically centred
    doc.text(String(idx + 1), margin + cols.sno / 2, y + rowH / 2, { align: "center", baseline: "middle" });
    cx += cols.sno;

    // Description column — name bold, then description lines normal
    doc.setFont("helvetica", "bold");
    let textY = y + cellPadT;
    nameLines.forEach((l) => {
      doc.text(l, cx + 2, textY);
      textY += lineH;
    });
    if (item.description) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      descLines.forEach((l) => {
        doc.text(l, cx + 2, textY);
        textY += lineH;
      });
      doc.setFontSize(8);
    }
    cx += cols.desc;

    // Remaining columns — vertically centred
    const midY = y + rowH / 2;
    doc.setFont("helvetica", "normal");
    doc.text(item.hsnCode, cx + cols.hsn / 2, midY, { align: "center", baseline: "middle" });
    cx += cols.hsn;
    doc.text(`${item.gstPercent}%`, cx + cols.gst / 2, midY, { align: "center", baseline: "middle" });
    cx += cols.gst;
    doc.text(String(item.quantity), cx + cols.qty / 2, midY, { align: "center", baseline: "middle" });
    cx += cols.qty;
    doc.text(String(item.rate), cx + cols.rate / 2, midY, { align: "center", baseline: "middle" });
    cx += cols.rate;
    doc.text(item.unit, cx + cols.unit / 2, midY, { align: "center", baseline: "middle" });
    cx += cols.unit;
    doc.setFont("helvetica", "bold");
    doc.text(String(Math.round(item.amount)), W - margin - 2, midY, { align: "right", baseline: "middle" });
    doc.setFont("helvetica", "normal");

    // Column dividers spanning full dynamic row height
    let divX = margin;
    widths.forEach((w, i) => {
      divX += w;
      if (i < widths.length - 1) vline(divX, rowStartY, rowStartY + rowH);
    });

    line(y + rowH);
    y += rowH;
  });

  // Fill to at least 155mm
  if (y < 155) {
    y = 155;
    line(y);
  }

  // ── TOTALS ─────────────────────────────────────────────────────────────
  const totalsX = margin + pageW - 95;
  const labelX  = totalsX + 2;   // label left-indent inside the box
  const pctX    = totalsX + 58;  // percentage column centre
  const valX    = W - margin - 2; // value right-aligned
  const rowH    = 6;

  const extraRows = invoice.otherCharges > 0 ? 1 : 0;
  const totalRows = 7 + extraRows;
  const totalsStartY = y;

  vline(totalsX, totalsStartY, totalsStartY + rowH * totalRows);

  function totalRow(label: string, value: string, pct?: string, bold = false) {
    doc.setFontSize(8);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, labelX, y + 4);
    if (pct) doc.text(pct, pctX, y + 4, { align: "center" });
    doc.text(value, valX, y + 4, { align: "right" });
    line(y + rowH);
    y += rowH;
  }

  totalRow("TOTAL AMOUNT BEFORE TAX", `Rs. ${Math.round(invoice.subtotal).toLocaleString("en-IN")}`);
  if (!invoice.isIGST) {
    totalRow("CGST", `Rs. ${Math.round(invoice.cgstTotal).toLocaleString("en-IN")}`, `${settings.cgstRate}%`);
    totalRow("SGST", `Rs. ${Math.round(invoice.sgstTotal).toLocaleString("en-IN")}`, `${settings.sgstRate}%`);
    totalRow("IGST", "");
  } else {
    totalRow("CGST", "");
    totalRow("SGST", "");
    totalRow("IGST", `Rs. ${Math.round(invoice.igstTotal).toLocaleString("en-IN")}`, `${settings.igstRate}%`);
  }
  totalRow("TAX AMOUNT : GST", `Rs. ${Math.round(invoice.taxTotal).toLocaleString("en-IN")}`, `${invoice.isIGST ? settings.igstRate : settings.cgstRate + settings.sgstRate}%`);

  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y, pageW, rowH, "F");
  totalRow("TOTAL AMOUNT AFTER TAX", `Rs. ${Math.round(invoice.subtotal + invoice.taxTotal).toLocaleString("en-IN")}`, undefined, true);

  if (invoice.otherCharges > 0) {
    totalRow(`OTHER CHARGES   ${invoice.otherChargesLabel}`, `Rs. ${Math.round(invoice.otherCharges).toLocaleString("en-IN")}`);
  }

  doc.setFillColor(220, 240, 228);
  doc.rect(margin, y, pageW, rowH, "F");
  totalRow("TOTAL PAYABLE AMOUNT", `Rs. ${Math.round(invoice.totalAmount).toLocaleString("en-IN")}`, undefined, true);

  y += 2;

  // ── AMOUNT IN WORDS ────────────────────────────────────────────────────
  line(y);
  const words = numberToWords(invoice.totalAmount);
  boldText("TOTAL AMOUNT IN WORDS :", margin + 2, y + 5, 8);
  boldText(words.toUpperCase(), margin + 62, y + 5, 8);
  line(y + 8);
  y += 8;

  // ── FOOTER BOXES ──────────────────────────────────────────────────────
  const footerY = y;
  const footerH = 36;
  doc.rect(margin, footerY, halfW, footerH);
  doc.rect(margin + halfW, footerY, halfW, footerH);

  normalText("Recived the above goods in good condition", margin + 2, footerY + 6, 7.5);
  normalText("along with transporter invoice copy", margin + 2, footerY + 11, 7.5);
  normalText("Reciver Signature", margin + 10, footerY + footerH - 4, 7.5);

  const bankLabelX = margin + halfW + 2;
  const bankValueX = margin + halfW + 34;
  boldText("Company's Bank Details", bankLabelX, footerY + 6, 8);
  normalText("Bank Name :", bankLabelX, footerY + 13, 7.5);
  normalText(settings.bankName, bankValueX, footerY + 13, 7.5);
  normalText("A/C No. :", bankLabelX, footerY + 19, 7.5);
  normalText(settings.accountNumber, bankValueX, footerY + 19, 7.5);
  normalText("IFSC Code :", bankLabelX, footerY + 25, 7.5);
  normalText(settings.ifscCode, bankValueX, footerY + 25, 7.5);
  if (settings.branchName) {
    normalText("Branch :", bankLabelX, footerY + 31, 7.5);
    normalText(settings.branchName, bankValueX, footerY + 31, 7.5);
  }

  y += footerH;

  // ── DECLARATION + FOR COMPANY ─────────────────────────────────────────
  const declH = 28;
  doc.rect(margin, y, halfW, declH);
  doc.rect(margin + halfW, y, halfW, declH);

  normalText("Declaration.:", margin + 2, y + 6, 7.5);
  normalText("We declare that this invoice shows the actual price of the goods", margin + 2, y + 12, 7.5);
  normalText("described and that all particulars are true and correct.", margin + 2, y + 17, 7.5);

  boldText(`For ${settings.companyName}`, margin + halfW + 2, y + 6, 8);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("Authorised Signatory", W - margin - 2, y + 24, { align: "right" });

  y += declH;

  // ── CONTACT FOOTER ────────────────────────────────────────────────────
  doc.rect(margin, y, pageW, 8);
  normalText(`Contact no.: ${settings.contact}`, margin + 4, y + 5, 7.5);
  normalText(`Email ID: ${settings.email}`, W / 2 + 10, y + 5, 7.5);

  doc.save(`${invoice.invoiceNumber}.pdf`);
}
