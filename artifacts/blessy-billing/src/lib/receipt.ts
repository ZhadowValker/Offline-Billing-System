import jsPDF from "jspdf";
import type { Invoice } from "./db";
import { getSettings } from "./db";
import { convertNumberToWords } from "./numberToWords";

export async function generateReceiptPDF(invoice: Invoice): Promise<void> {
  const settings = await getSettings();

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a5",
  });

  const PAGE_W = doc.internal.pageSize.getWidth();
  const LM = 6;
  const RM = 6;
  const TM = 6;
  const CW = PAGE_W - LM - RM;

  // jsPDF's y-axis starts at the TOP (y=0) and increases downward.
  let y = TM;

  function setFont(style: "normal" | "bold", size: number) {
    doc.setFont("courier", style);
    doc.setFontSize(size);
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
  doc.text((settings.companyName || "").toUpperCase(), PAGE_W / 2, y, {
    align: "center",
  });
  y += 5;

  setFont("normal", 8);
  if (settings.address) {
    doc.text(settings.address, PAGE_W / 2, y, { align: "center" });
    y += 3;
  }

  const contactLine = [settings.contact, settings.email]
    .filter(Boolean)
    .join(" | ");
  if (contactLine) {
    doc.text(contactLine, PAGE_W / 2, y, { align: "center" });
    y += 3;
  }

  y += 1.5;
  hrDashes(y);
  y += 4.5;

  // INVOICE DETAILS
  setFont("bold", 10);
  doc.text("RECEIPT / INVOICE", PAGE_W / 2, y, { align: "center" });
  y += 4.5;

  setFont("normal", 8);
  doc.text(`Inv#: ${invoice.invoiceNumber}`, LM, y);
  const invoiceDate = new Date(invoice.invoiceDate);
  const dateStr = invoiceDate.toLocaleDateString("en-IN");
  doc.text(`Date: ${dateStr}`, PAGE_W - RM, y, { align: "right" });
  y += 4.5;

  // BILL TO
  setFont("bold", 8);
  doc.text("BILL TO:", LM, y);
  y += 3;

  setFont("normal", 8);
  doc.text(invoice.buyer?.name || "", LM, y);
  y += 3;

  const buyerAddr = invoice.buyer?.address || "";
  const addressLines = doc.splitTextToSize(buyerAddr, CW - 10);
  if (addressLines.length > 0) {
    doc.text(addressLines[0], LM, y);
    y += 3;
  }
  y += 0.5;

  hrDashes(y);
  y += 4;

  // ITEMS TABLE HEADER
  setFont("bold", 8);
  doc.text("ITEM", LM, y);
  doc.text("QTY", LM + 90, y);
  doc.text("RATE", LM + 120, y);
  doc.text("AMOUNT", PAGE_W - RM, y, { align: "right" });
  y += 3;

  hrDashes(y, "-");
  y += 3.5;

  // ITEMS
  setFont("normal", 8);
  invoice.items.forEach((item) => {
    const itemName = item.productName || "";
    const qty = item.quantity || 0;
    const rate = item.rate || 0;
    const amount = item.amount ?? qty * rate;

    doc.text(itemName, LM, y);
    doc.text(String(qty), LM + 90, y, { align: "center" });
    doc.text(String(rate), LM + 120, y, { align: "center" });
    doc.text(Math.round(amount).toLocaleString("en-IN"), PAGE_W - RM, y, {
      align: "right",
    });
    y += 4;
  });

  hrDashes(y);
  y += 3.5;

  // TOTALS
  setFont("normal", 8);
  doc.text("Subtotal", LM, y);
  doc.text(
    `Rs. ${Math.round(invoice.subtotal).toLocaleString("en-IN")}`,
    PAGE_W - RM,
    y,
    { align: "right" }
  );
  y += 3;

  if (invoice.otherCharges > 0) {
    doc.text(
      (invoice.otherChargesLabel || "OTHER CHARGES").toUpperCase(),
      LM,
      y
    );
    doc.text(
      `Rs. ${Math.round(invoice.otherCharges).toLocaleString("en-IN")}`,
      PAGE_W - RM,
      y,
      { align: "right" }
    );
    y += 3;
  }

  y += 0.5;
  hrDashes(y, "=");
  y += 3.5;

  // GRAND TOTAL
  setFont("bold", 9);
  doc.text("TOTAL", LM, y);
  doc.text(
    `Rs. ${Math.round(invoice.totalAmount).toLocaleString("en-IN")}`,
    PAGE_W - RM,
    y,
    { align: "right" }
  );
  y += 4;

  // AMOUNT IN WORDS
  setFont("bold", 7);
  doc.text("Amount in Words:", LM, y);
  y += 2.5;

  setFont("bold", 8);
  const rawWords =
    invoice.totalInWords ||
    convertNumberToWords(Math.round(invoice.totalAmount));
  const wordsTxt = rawWords.toUpperCase().trim();
  const wordsFinal = wordsTxt.endsWith("ONLY") ? wordsTxt : `${wordsTxt} ONLY`;
  const wordsLines = doc.splitTextToSize(wordsFinal, CW);
  wordsLines.forEach((line: string) => {
    doc.text(line, LM, y);
    y += 3;
  });
  y += 0.5;

  hrDashes(y);
  y += 4;

  // FOOTER
  setFont("normal", 7);
  doc.text("Thank you!", PAGE_W / 2, y, { align: "center" });
  y += 2.5;

  doc.text("Please retain this receipt", PAGE_W / 2, y, { align: "center" });
  y += 2.5;

  setFont("normal", 6);
  const now = new Date();
  const timeStr = now.toLocaleString("en-IN");
  doc.text(timeStr, PAGE_W / 2, y, { align: "center" });

  doc.save(`RECEIPT-${invoice.invoiceNumber}.pdf`);
}
