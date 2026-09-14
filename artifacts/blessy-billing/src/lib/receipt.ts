import jsPDF from "jspdf";
import type { Invoice } from "./db";
import { getSettings } from "./db";

/**
 * Generate a compact thermal receipt-style PDF for Non-GST invoices
 * Size: Half A4 (210mm x 148.5mm = 5.8" x 5.8" thermal paper equivalent)
 * Format: Monospace, dot-matrix style
 */
export async function generateReceiptPDF(invoice: Invoice): Promise<void> {
  const settings = await getSettings();

  // Thermal receipt dimensions (mm)
  const RECEIPT_W = 80;  // Standard thermal paper width
  const RECEIPT_H = 200; // Length as needed
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [RECEIPT_W, RECEIPT_H],
  });

  const PAGE_W = RECEIPT_W;
  const PAGE_H = RECEIPT_H;
  const LM = 3;  // left margin
  const RM = 3;  // right margin
  const CW = PAGE_W - LM - RM; // content width

  let y = 4;

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
    const lineWidth = Math.floor(CW / 1.8); // Approx chars per line in courier 9pt
    txt(char.repeat(lineWidth), LM, yPos, "left");
  }

  // ── HEADER ────────────────────────────────────────────────────────
  setFont("bold", 11);
  txt(settings.companyName.toUpperCase(), LM + CW / 2, y, "center");
  y += 5;

  setFont("normal", 8);
  txt(settings.address, LM + CW / 2, y, "center");
  y += 3;

  txt(`Tel: ${settings.contact}`, LM + CW / 2, y, "center");
  y += 4;

  hr(y);
  y += 4;

  // ── INVOICE DETAILS ───────────────────────────────────────────────
  setFont("bold", 9);
  txt("RECEIPT / INVOICE", LM + CW / 2, y, "center");
  y += 4;

  setFont("normal", 8);
  txt(`Inv#: ${invoice.invoiceNumber}`, LM, y);
  txt(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}`, LM, y + 3);
  y += 6;

  // ── BILL TO ────────────────────────────────────────────────────────
  setFont("bold", 8);
  txt("BILL TO:", LM, y);
  y += 3;

  setFont("normal", 8);
  txt(invoice.buyer.name, LM, y);
  y += 3;

  // Address (max 2 lines in compact form)
  const addrLines = invoice.buyer.address.split(/\r?\n/).filter(Boolean).slice(0, 2);
  addrLines.forEach((line) => {
    txt(line.substring(0, 35), LM, y);
    y += 3;
  });

  y += 2;
  hr(y);
  y += 3;

  // ── ITEMS ──────────────────────────────────────────────────────────
  setFont("bold", 8);
  txt("ITEM", LM, y);
  txt("QTY", LM + 40, y);
  txt("RATE", LM + 52, y);
  txt("AMT", PAGE_W - RM - 8, y, "right");
  y += 3;

  hr(y, "-");
  y += 3;

  setFont("normal", 7.5);
  invoice.items.forEach((item) => {
    // Product name (truncated)
    const prodName = item.productName.substring(0, 35);
    txt(prodName, LM, y);

    const qty = String(item.quantity).substring(0, 5);
    const rate = `${Math.round(item.rate)}`;
    const amt = `${Math.round(item.amount)}`;

    txt(qty, LM + 40, y);
    txt(rate, LM + 52, y);
    txt(amt, PAGE_W - RM - 8, y, "right");
    y += 3;
  });

  y += 2;
  hr(y);
  y += 3;

  // ── TOTALS ────────────────────────────────────────────────────────
  setFont("normal", 8);

  // Subtotal
  txt("Subtotal", LM, y);
  txt(`Rs. ${Math.round(invoice.subtotal).toLocaleString("en-IN")}`, PAGE_W - RM - 8, y, "right");
  y += 3;

  // Other charges
  if (invoice.otherCharges > 0) {
    txt(invoice.otherChargesLabel || "Other Charges", LM, y);
    txt(`Rs. ${Math.round(invoice.otherCharges).toLocaleString("en-IN")}`, PAGE_W - RM - 8, y, "right");
    y += 3;
  }

  // Grand total
  y += 1;
  hr(y, "=");
  y += 3;

  setFont("bold", 9);
  txt("TOTAL", LM, y);
  txt(`Rs. ${Math.round(invoice.totalAmount).toLocaleString("en-IN")}`, PAGE_W - RM - 8, y, "right");
  y += 4;

  // ── AMOUNT IN WORDS ────────────────────────────────────────────────
  setFont("normal", 7);
  txt("Amount in Words:", LM, y);
  y += 3;

  const wordsTxt = (invoice.totalInWords || "").toUpperCase();
  const wordLines: string[] = doc.splitTextToSize(wordsTxt, CW - 2);
  wordLines.slice(0, 2).forEach((line: string) => {
    txt(line.substring(0, 40), LM, y);
    y += 2.5;
  });

  y += 2;
  hr(y);
  y += 3;

  // ── FOOTER ────────────────────────────────────────────────────────
  setFont("normal", 7);
  txt("Thank you!", LM + CW / 2, y, "center");
  y += 3;

  txt("Please retain this receipt", LM + CW / 2, y, "center");
  y += 3;

  setFont("normal", 6);
  const timestamp = new Date().toLocaleString("en-IN");
  txt(timestamp, LM + CW / 2, y, "center");

  doc.save(`RECEIPT-${invoice.invoiceNumber}.pdf`);
}
