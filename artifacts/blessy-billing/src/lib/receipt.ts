import jsPDF from "jspdf";
import type { Invoice } from "./db";
import { getSettings } from "./db";

/**
 * Generate a compact thermal receipt-style PDF for Non-GST invoices
 * Size: A5 Horizontal (210mm x 148.5mm)
 * Format: Monospace, dot-matrix style
 */
export async function generateReceiptPDF(invoice: Invoice): Promise<void> {
  const settings = await getSettings();

  // A5 Horizontal dimensions (mm)
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a5",
  });

  const PAGE_W = 210;  // A5 landscape width
  const PAGE_H = 148.5; // A5 landscape height
  const LM = 6;   // left margin
  const RM = 6;   // right margin
  const TM = 6;   // top margin
  const CW = PAGE_W - LM - RM; // content width

  let y = TM;

  // Helpers
  function setFont(style: "normal" | "bold", size: number) {
    doc.setFont("courier", style);
    doc.setFontSize(size);
  }

  function txt(text: string, x: number, _y: number, align: "left" | "center" | "right" = "left") {
    doc.setTextColor(0, 0, 0);
    doc.text(String(text ?? ""), x, _y, { align });
  }

  function hr(yPos: number, char = "-") {
    setFont("normal", 9);
    txt(char.repeat(80), LM, yPos, "left");
  }

  // ── HEADER ────────────────────────────────────────────────────────
  setFont("bold", 12);
  txt(settings.companyName.toUpperCase(), LM + CW / 2, y, "center");
  y += 5;

  setFont("normal", 8);
  txt(settings.address, LM + CW / 2, y, "center");
  y += 4;

  txt(`Tel: ${settings.contact}`, LM + CW / 2, y, "center");
  y += 4;

  hr(y);
  y += 5;

  // ── INVOICE DETAILS ───────────────────────────────────────────────
  setFont("bold", 10);
  txt("RECEIPT / INVOICE", LM + CW / 2, y, "center");
  y += 5;

  setFont("normal", 8);
  txt(`Inv#: ${invoice.invoiceNumber}`, LM, y);
  txt(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}`, LM + 70, y);
  y += 4;

  // ── BILL TO ────────────────────────────────────────────────────────
  setFont("bold", 8);
  txt("BILL TO:", LM, y);
  y += 3;

  setFont("normal", 8);
  txt(invoice.buyer.name, LM, y);
  y += 3;

  // Address (max 1 line in compact form)
  const addrLines = invoice.buyer.address.split(/\r?\n/).filter(Boolean).slice(0, 1);
  addrLines.forEach((line) => {
    txt(line.substring(0, 60), LM, y);
    y += 3;
  });

  y += 2;
  hr(y);
  y += 4;

  // ── ITEMS TABLE HEADER ────────────────────────────────────────────
  setFont("bold", 8);
  txt("ITEM", LM, y);
  txt("QTY", LM + 90, y);
  txt("RATE", LM + 120, y);
  txt("AMOUNT", PAGE_W - RM - 25, y);
  y += 3;

  hr(y, "-");
  y += 4;

  // ── ITEMS ─────────────────────────────────────────────────────────
  setFont("normal", 7.5);
  invoice.items.forEach((item) => {
    // Product name (truncated)
    const prodName = item.productName.substring(0, 50);
    txt(prodName, LM, y);

    const qty = String(item.quantity);
    const rate = `${Math.round(item.rate)}`;
    const amt = `${Math.round(item.amount)}`;

    txt(qty, LM + 90, y);
    txt(rate, LM + 120, y);
    txt(amt, PAGE_W - RM - 25, y, "right");
    y += 4;
  });

  y += 1;
  hr(y);
  y += 4;

  // ── TOTALS ────────────────────────────────────────────────────────
  setFont("normal", 8);

  // Subtotal
  txt("Subtotal", LM, y);
  txt(`Rs. ${Math.round(invoice.subtotal).toLocaleString("en-IN")}`, PAGE_W - RM - 25, y, "right");
  y += 3;

  // Other charges
  if (invoice.otherCharges > 0) {
    txt(invoice.otherChargesLabel || "Other Charges", LM, y);
    txt(`Rs. ${Math.round(invoice.otherCharges).toLocaleString("en-IN")}`, PAGE_W - RM - 25, y, "right");
    y += 3;
  }

  // Grand total separator
  y += 1;
  hr(y, "=");
  y += 3;

  // Grand total
  setFont("bold", 9);
  txt("TOTAL", LM, y);
  txt(`Rs. ${Math.round(invoice.totalAmount).toLocaleString("en-IN")}`, PAGE_W - RM - 25, y, "right");
  y += 4;

  // ── AMOUNT IN WORDS ────────────────────────────────────────────────
  setFont("normal", 7);
  txt("Amount in Words:", LM, y);
  y += 3;

  const wordsTxt = (invoice.totalInWords || "").toUpperCase();
  const wordLines: string[] = doc.splitTextToSize(wordsTxt, CW - 2);
  wordLines.slice(0, 1).forEach((line: string) => {
    txt(line.substring(0, 80), LM, y);
    y += 3;
  });

  y += 2;
  hr(y);
  y += 3;

  // ── FOOTER ────────────────────────────────────────────────────────
  setFont("normal", 7);
  txt("Thank you!", LM + CW / 2, y, "center");
  y += 2;

  txt("Please retain this receipt", LM + CW / 2, y, "center");
  y += 2;

  setFont("normal", 6);
  const timestamp = new Date().toLocaleString("en-IN");
  txt(timestamp, LM + CW / 2, y, "center");

  doc.save(`RECEIPT-${invoice.invoiceNumber}.pdf`);
}
