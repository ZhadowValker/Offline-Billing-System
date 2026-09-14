import jsPDF from "jspdf";
import { Invoice } from "../types";
import { convertNumberToWords } from "./numberToWords";

export function generateReceiptPDF(invoice: Invoice): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a5",
  });

  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const LM = 6;
  const RM = 6;
  const TM = 4;
  const CW = PAGE_W - LM - RM;

  let y = PAGE_H - TM;

  // Helper functions
  function setFont(style: string, size: number) {
    doc.setFont("courier", style);
    doc.setFontSize(size);
  }

  function txt(
    text: string,
    x: number,
    yPos: number,
    size: number = 9,
    bold: boolean = false,
    align: "left" | "center" | "right" = "left"
  ) {
    const font = bold ? "courier" : "courier";
    const weight = bold ? "bold" : "normal";
    setFont(weight, size);
    doc.text(text, x, yPos, { align });
  }

  function hrDashes(yPos: number, char: string = "-") {
    setFont("normal", 9);
    const charWidth = 2.6;
    const dashCount = Math.floor(CW / charWidth);
    const line = char.repeat(dashCount);
    doc.text(line, LM, yPos);
  }

  // HEADER
  setFont("bold", 12);
  doc.text("BLESSY PACKAGINGS", PAGE_W / 2, y, { align: "center" });
  y -= 5;

  setFont("normal", 8);
  doc.text("H.NO.: 413 FF, PJR NAGAR, YELLAMABANDA.", PAGE_W / 2, y, {
    align: "center",
  });
  y -= 3;

  doc.text("Tel: +91-9000000000", PAGE_W / 2, y, { align: "center" });
  y -= 4.5;

  hrDashes(y);
  y -= 4.5;

  // INVOICE DETAILS
  setFont("bold", 10);
  doc.text("RECEIPT / INVOICE", PAGE_W / 2, y, { align: "center" });
  y -= 4.5;

  setFont("normal", 8);
  doc.text(`Inv#: ${invoice.invoiceNumber}`, LM, y);
  const invoiceDate = new Date(invoice.invoiceDate);
  const dateStr = invoiceDate.toLocaleDateString("en-IN");
  doc.text(`Date: ${dateStr}`, PAGE_W - RM, y, { align: "right" });
  y -= 4.5;

  // BILL TO
  setFont("bold", 8);
  doc.text("BILL TO:", LM, y);
  y -= 3;

  setFont("normal", 8);
  doc.text(invoice.buyerName, LM, y);
  y -= 3;

  const buyerAddr = invoice.buyerAddress || "";
  const addressLines = doc.splitTextToSize(buyerAddr, CW - 10);
  if (addressLines.length > 0) {
    doc.text(addressLines[0], LM, y);
  }
  y -= 3.5;

  hrDashes(y);
  y -= 4;

  // ITEMS TABLE HEADER
  setFont("bold", 8);
  doc.text("ITEM", LM, y);
  doc.text("QTY", LM + 90, y);
  doc.text("RATE", LM + 120, y);
  doc.text("AMOUNT", PAGE_W - RM, y, { align: "right" });
  y -= 3;

  hrDashes(y, "-");
  y -= 3.5;

  // ITEMS
  setFont("normal", 8);
  invoice.items.forEach((item) => {
    const itemName = item.itemName || "";
    const qty = item.quantity || 0;
    const rate = item.rate || 0;
    const amount = qty * rate;

    doc.text(itemName, LM, y);
    doc.text(qty.toString(), LM + 90, y, { align: "center" });
    doc.text(rate.toString(), LM + 120, y, { align: "center" });
    doc.text(amount.toString(), PAGE_W - RM, y, { align: "right" });
    y -= 4;
  });

  hrDashes(y);
  y -= 3.5;

  // TOTALS
  setFont("normal", 8);
  const subtotal = invoice.items.reduce((sum, item) => {
    return sum + (item.quantity || 0) * (item.rate || 0);
  }, 0);

  doc.text("Subtotal", LM, y);
  doc.text(`Rs. ${subtotal.toLocaleString("en-IN")}`, PAGE_W - RM, y, {
    align: "right",
  });
  y -= 3;

  const freight = invoice.freight || 0;
  doc.text("FREIGHT", LM, y);
  doc.text(`Rs. ${freight.toLocaleString("en-IN")}`, PAGE_W - RM, y, {
    align: "right",
  });
  y -= 3.5;

  hrDashes(y, "=");
  y -= 3.5;

  // GRAND TOTAL
  const total = subtotal + freight;
  setFont("bold", 9);
  doc.text("TOTAL", LM, y);
  doc.text(`Rs. ${total.toLocaleString("en-IN")}`, PAGE_W - RM, y, {
    align: "right",
  });
  y -= 4;

  // AMOUNT IN WORDS
  setFont("bold", 7);
  doc.text("Amount in Words:", LM, y);
  y -= 2.5;

  setFont("bold", 8);
  const amountInWords = convertNumberToWords(Math.floor(total));
  doc.text(amountInWords.toUpperCase() + " ONLY", LM, y);
  y -= 3.5;

  hrDashes(y);
  y -= 3.5;

  // FOOTER
  setFont("normal", 7);
  doc.text("Thank you!", PAGE_W / 2, y, { align: "center" });
  y -= 2.5;

  doc.text("Please retain this receipt", PAGE_W / 2, y, { align: "center" });
  y -= 2.5;

  setFont("normal", 6);
  const now = new Date();
  const timeStr = now.toLocaleString("en-IN");
  doc.text(timeStr, PAGE_W / 2, y, { align: "center" });

  doc.save(`RECEIPT-${invoice.invoiceNumber}.pdf`);
}
