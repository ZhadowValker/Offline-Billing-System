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
  const sellerBoxH = 36;
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

  normalText("Invoice No.:", rx + 2, y + 6, 7.5);
  boldText(invoice.invoiceNumber, rx + 28, y + 6, 8);
  normalText("Dated:", rx + halfW / 2, y + 6, 7.5);
  boldText(
    new Date(invoice.invoiceDate)
      .toLocaleDateString("en-IN", { day: "numeric", month: "numeric", year: "numeric" })
      .replace(/\//g, "-"),
    rx + halfW / 2 + 15,
    y + 6,
    8
  );
  normalText("Delivery Note:", rx + 2, y + 13, 7.5);
  normalText("Supplier's Ref.:", rx + 2, y + 20, 7.5);
  normalText("Other References", rx + halfW / 2, y + 20, 7.5);
  normalText("Buyers Order No.:", rx + 2, y + 27, 7.5);
  normalText(invoice.buyersOrderNo || "", rx + 36, y + 27, 7.5);

  y += sellerBoxH;

  // ── BUYER INFO ─────────────────────────────────────────────────────────
  const buyerBoxH = 28;
  const buyerMidX = margin + halfW;

  doc.rect(margin, y, pageW, buyerBoxH);
  vline(buyerMidX, y, y + buyerBoxH);

  // Left side: buyer name + address
  boldText("BUYER'S INFO :", margin + 2, y + 5, 8);
  boldText(invoice.buyer.name, margin + 2, y + 11, 9);
  const bLines = invoice.buyer.address.split(/,|;|\n/).filter(Boolean);
  let by = y + 17;
  bLines.slice(0, 2).forEach((l) => {
    normalText(l.trim(), margin + 2, by, 7.5);
    by += 4;
  });
  normalText(`GST NO.: ${invoice.buyer.gstNumber}`, margin + 2, by, 7.5);

  // Right side: despatch details
  const dx = buyerMidX + 2;
  normalText("Despatch Document No.:", dx, y + 5, 7.5);
  normalText("Delivery Note Dated", dx + 52, y + 5, 7.5);
  normalText("Despatch Through :", dx, y + 13, 7.5);
  boldText(invoice.despatchThrough || "BY ROAD", dx + 36, y + 13, 7.5);
  normalText("Destination:", dx + 58, y + 13, 7.5);
  boldText(invoice.destination || invoice.buyer.state || "", dx + 74, y + 13, 7.5);
  normalText("Bill of Landing/LR-RR No.:", dx, y + 21, 7.5);
  normalText("Motor vehicle No.:", dx + 58, y + 21, 7.5);

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
  invoice.items.forEach((item, idx) => {
    const rowH = 16;
    const rowStartY = y;
    cx = margin;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    doc.text(String(idx + 1), margin + cols.sno / 2, y + 5, { align: "center" });
    cx += cols.sno;

    doc.text(item.productName, cx + 2, y + 5);
    if (item.description) doc.text(item.description, cx + 2, y + 10, { maxWidth: cols.desc - 4 });
    cx += cols.desc;

    doc.text(item.hsnCode, cx + cols.hsn / 2, y + 5, { align: "center" });
    cx += cols.hsn;

    doc.text(`${item.gstPercent}%`, cx + cols.gst / 2, y + 5, { align: "center" });
    cx += cols.gst;

    doc.text(String(item.quantity), cx + cols.qty / 2, y + 5, { align: "center" });
    cx += cols.qty;

    doc.text(String(item.rate), cx + cols.rate / 2, y + 5, { align: "center" });
    cx += cols.rate;

    doc.text(item.unit, cx + cols.unit / 2, y + 5, { align: "center" });
    cx += cols.unit;

    doc.text(String(Math.round(item.amount)), W - margin - 2, y + 5, { align: "right" });

    // Draw column dividers for this row
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
  const totalsX = margin + pageW - 90;
  const labelX = totalsX;
  const valX = W - margin - 2;
  const rowH = 6;

  // Count how many total rows we'll draw to size the vertical line correctly
  const extraRows = invoice.otherCharges > 0 ? 1 : 0;
  const totalRows = 7 + extraRows; // before-tax, cgst, sgst, igst, tax-amt, after-tax, payable + optional other
  const totalsStartY = y;

  vline(totalsX, totalsStartY, totalsStartY + rowH * totalRows);

  function totalRow(label: string, value: string, pct?: string, bold = false) {
    if (bold) { doc.setFont("helvetica", "bold"); } else { doc.setFont("helvetica", "normal"); }
    doc.setFontSize(8);
    doc.text(label, labelX + 2, y + 4);
    if (pct) doc.text(pct, labelX + 60, y + 4, { align: "center" });
    doc.text(value, valX, y + 4, { align: "right" });
    line(y + rowH);
    y += rowH;
  }

  totalRow("TOTAL AMOUNT BEFORE TAX", `\u20B9 ${Math.round(invoice.subtotal).toLocaleString("en-IN")}`);
  if (!invoice.isIGST) {
    totalRow("CGST", `\u20B9 ${Math.round(invoice.cgstTotal).toLocaleString("en-IN")}`, `${settings.cgstRate}%`);
    totalRow("SGST", `\u20B9 ${Math.round(invoice.sgstTotal).toLocaleString("en-IN")}`, `${settings.sgstRate}%`);
    totalRow("IGST", "");
  } else {
    totalRow("CGST", "");
    totalRow("SGST", "");
    totalRow("IGST", `\u20B9 ${Math.round(invoice.igstTotal).toLocaleString("en-IN")}`, `${settings.igstRate}%`);
  }
  totalRow("TAX AMOUNT : GST", `\u20B9 ${Math.round(invoice.taxTotal).toLocaleString("en-IN")}`, `${invoice.isIGST ? settings.igstRate : settings.cgstRate + settings.sgstRate}%`);

  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y, pageW, rowH, "F");
  totalRow("TOTAL AMOUNT AFTER TAX", `\u20B9 ${Math.round(invoice.subtotal + invoice.taxTotal).toLocaleString("en-IN")}`, undefined, true);

  if (invoice.otherCharges > 0) {
    totalRow(`OTHER CHARGES   ${invoice.otherChargesLabel}`, `\u20B9 ${Math.round(invoice.otherCharges).toLocaleString("en-IN")}`);
  }

  doc.setFillColor(220, 240, 228);
  doc.rect(margin, y, pageW, rowH, "F");
  totalRow("TOTAL PAYABLE AMOUNT", `\u20B9 ${Math.round(invoice.totalAmount).toLocaleString("en-IN")}`, undefined, true);

  y += 2;

  // ── AMOUNT IN WORDS ────────────────────────────────────────────────────
  line(y);
  const words = numberToWords(invoice.totalAmount);
  boldText("TOTAL AMOUNT IN WORDS :", margin + 2, y + 5, 8);
  normalText(words, margin + 62, y + 5, 8);
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

  boldText("Company's Bank Details", margin + halfW + 2, footerY + 6, 8);
  normalText(`Bank Name :   ${settings.bankName}`, margin + halfW + 2, footerY + 13, 7.5);
  normalText(`A/C No. :      ${settings.accountNumber}`, margin + halfW + 2, footerY + 19, 7.5);
  normalText(`Branch & IFSC Code :   ${settings.ifscCode}`, margin + halfW + 2, footerY + 25, 7.5);

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
