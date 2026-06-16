import jsPDF from "jspdf";
import type { Invoice } from "./db";
import { getSettings } from "./db";

// ── Image loader ──────────────────────────────────────────────────────────────
async function loadImageAsDataURL(publicPath: string): Promise<string> {
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  const res  = await fetch(`${base}${publicPath}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ── Main PDF generator ────────────────────────────────────────────────────────
export async function generateInvoicePDF(invoice: Invoice): Promise<void> {
  const settings = await getSettings();

  const [sidebarUrl, logoUrl, logoFullUrl] = await Promise.all([
    loadImageAsDataURL("/bill-sidebar.png"),
    loadImageAsDataURL("/logo-icon.png"),
    loadImageAsDataURL("/logo-full.png"),
  ]);

  const hasGST  = (invoice.billType || "gst") === "gst";
  const isQuote = invoice.billType === "quotation";
  const docTitle = isQuote ? "QUOTATION" : hasGST ? "TAX INVOICE" : "INVOICE";

  // ── Page geometry (mm) ────────────────────────────────────────────────────
  const doc    = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PAGE_W = 210;
  const PAGE_H = 297;

  // Sidebar: natural aspect ratio 223:1400 → at 297mm tall = 47.3mm wide
  const SIDEBAR_W = 47;
  const ML        = SIDEBAR_W + 3;   // left margin for content
  const MR        = 6;               // right margin
  const CW        = PAGE_W - ML - MR; // content width
  const MT        = 9;               // top margin (headroom)

  let y = MT;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const rgb = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
  const BLUE: [number,number,number] = [26, 95, 168];

  function setFont(style: "normal"|"bold"|"italic", size: number) {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  }

  function txt(text: string, x: number, _y: number, align: "left"|"center"|"right" = "left") {
    doc.text(String(text ?? ""), x, _y, { align });
  }

  function hline(yPos: number, x1 = ML, x2 = PAGE_W - MR, color: [number,number,number] = [210,210,210], w = 0.25) {
    doc.setDrawColor(...color);
    doc.setLineWidth(w);
    doc.line(x1, yPos, x2, yPos);
  }

  function vline(x: number, y1: number, y2: number) {
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.25);
    doc.line(x, y1, x, y2);
  }

  function filledRect(x: number, _y: number, w: number, h: number, r: number, g: number, b: number) {
    doc.setFillColor(r, g, b);
    doc.rect(x, _y, w, h, "F");
  }

  // ── SIDEBAR ───────────────────────────────────────────────────────────────
  doc.addImage(sidebarUrl, "PNG", 0, 0, SIDEBAR_W, PAGE_H);

  // ── WATERMARK ─────────────────────────────────────────────────────────────
  const WM = 90;
  doc.saveGraphicsState();
  (doc as any).setGState(new (doc as any).GState({ opacity: 0.05 }));
  doc.addImage(logoFullUrl, "PNG", ML + (CW - WM) / 2, (PAGE_H - WM) / 2, WM, WM);
  doc.restoreGraphicsState();

  // ── HEADER: Logo + Company name — centred ─────────────────────────────────
  const HEADER_H   = 22;
  const LOGO_SIZE  = 18;
  const CO_FONT    = 14;

  // Measure company name width to centre the group
  setFont("bold", CO_FONT);
  const nameW    = doc.getTextWidth(settings.companyName.toUpperCase());
  const gap      = 3;
  const groupW   = LOGO_SIZE + gap + nameW;
  const groupX   = ML + (CW - groupW) / 2;

  // Logo
  doc.addImage(logoUrl, "PNG", groupX, y, LOGO_SIZE, LOGO_SIZE);

  // Company name — vertically centred with logo
  setFont("bold", CO_FONT);
  rgb(...BLUE);
  txt(settings.companyName.toUpperCase(), groupX + LOGO_SIZE + gap, y + LOGO_SIZE / 2 + 2.5);

  y += HEADER_H;

  // Blue bottom border of header
  hline(y, ML, PAGE_W - MR, BLUE, 0.8);
  y += 2;

  // ── TITLE STRIP: right-aligned below header ───────────────────────────────
  const TITLE_H = 10;

  // "Original / Duplicate / Triplicate" — grey, right of title box
  setFont("normal", 6);
  rgb(160, 160, 160);
  const copyText = "Original / Duplicate / Triplicate";
  const copyW    = doc.getTextWidth(copyText);

  // Title box
  const TITLE_BOX_W = 38;
  const TITLE_BOX_X = PAGE_W - MR - TITLE_BOX_W;
  filledRect(TITLE_BOX_X, y, TITLE_BOX_W, 7, ...BLUE);
  setFont("bold", 9);
  rgb(255, 255, 255);
  txt(docTitle, TITLE_BOX_X + TITLE_BOX_W / 2, y + 5, "center");

  // Copy label left of title box
  setFont("normal", 6);
  rgb(160, 160, 160);
  txt(copyText, TITLE_BOX_X - 3, y + 5, "right");

  y += TITLE_H;
  hline(y, ML, PAGE_W - MR, [220, 227, 237]);
  y += 3;

  // ── META ROW: seller details | invoice fields ─────────────────────────────
  const META_Y   = y;
  const halfW    = CW / 2;
  const rightX   = ML + halfW + 3;
  const SELLER_W = halfW - 4; // max width for seller text before wrapping

  // Seller left column — company name
  setFont("bold", 8);
  rgb(...BLUE);
  txt(settings.companyName.toUpperCase(), ML, y + 4);

  // Seller detail lines with wrapping so GSTIN line doesn't overflow
  setFont("normal", 7.5);
  rgb(80, 80, 80);
  const sellerRawLines = [
    settings.address,
    `GSTIN/UIN: ${settings.gstNumber} | State Code: ${settings.stateCode} | ${settings.state.toUpperCase()}`,
    `Place of Supply: ${settings.placeOfSupply}`,
    `Tel: ${settings.contact} | ${settings.email}`,
  ];
  const sellerWrapped: string[] = sellerRawLines.flatMap((l: string) =>
    (doc.splitTextToSize(l, SELLER_W) as string[])
  );
  let sy = y + 9;
  sellerWrapped.forEach((l: string) => { txt(l, ML, sy); sy += 3.6; });

  // metaH: name row starts at y+4 (5mm tall) + wrapped lines from y+9 + bottom pad
  const metaH = 9 + sellerWrapped.length * 3.6 + 3;

  vline(ML + halfW, META_Y, META_Y + metaH);

  // Invoice fields right column
  const invoiceFields: [string, string][] = [
    [isQuote ? "Quotation No.:" : "Invoice No.:", invoice.invoiceNumber],
    ["Dated:", new Date(invoice.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })],
  ];
  if (invoice.buyersOrderNo)   invoiceFields.push(["Buyer's Order No.:", invoice.buyersOrderNo]);
  if (invoice.suppliersRef)    invoiceFields.push(["Supplier's Ref.:",   invoice.suppliersRef]);
  if (invoice.despatchThrough) invoiceFields.push(["Despatch Through:",  invoice.despatchThrough]);
  if (invoice.destination)     invoiceFields.push(["Destination:",       invoice.destination]);

  let iy = y + 4;
  invoiceFields.forEach(([label, value]) => {
    setFont("normal", 7.5); rgb(150, 150, 150);
    txt(label, rightX, iy);
    setFont("bold", 7.5); rgb(30, 30, 30);
    txt(value, PAGE_W - MR, iy, "right");
    iy += 4;
  });

  y = META_Y + metaH;
  hline(y, ML, PAGE_W - MR, [220, 227, 237]);
  y += 3;

  // ── BILL TO ───────────────────────────────────────────────────────────────
  const BUYER_Y   = y;
  const buyerHalf = CW / 2;

  // "BILL TO" pill
  filledRect(ML, y, 16, 4.5, ...BLUE);
  setFont("bold", 6.5); rgb(255, 255, 255);
  txt("BILL TO", ML + 8, y + 3.3, "center");

  y += 6;
  setFont("bold", 9.5); rgb(20, 20, 20);
  txt(invoice.buyer.name, ML, y);
  y += 4.5;

  // Split only on newlines (not commas) so address stays intact; wrap to column width
  const addrLines = invoice.buyer.address.split(/\r?\n/).filter(Boolean);
  setFont("normal", 7.5); rgb(80, 80, 80);
  addrLines.forEach(l => {
    const wrapped: string[] = doc.splitTextToSize(l.trim(), halfW - 4) as string[];
    wrapped.forEach((wl: string) => { txt(wl, ML, y); y += 3.8; });
  });
  if (invoice.buyer.state) { txt(invoice.buyer.state, ML, y); y += 3.8; }
  if (hasGST && invoice.buyer.gstNumber) {
    setFont("normal", 7.5); rgb(80, 80, 80); txt("GST NO.: ", ML, y);
    setFont("bold", 7.5);   rgb(30, 30, 30); txt(invoice.buyer.gstNumber, ML + 16, y);
    y += 3.8;
  }

  // Transport fields — right column
  const transportFields: [string, string][] = [];
  if (invoice.motorVehicleNo) transportFields.push(["Motor Vehicle No.:", invoice.motorVehicleNo]);
  if (invoice.billOfLadingNo) transportFields.push(["Bill of Lading No.:", invoice.billOfLadingNo]);
  if (invoice.despatchDocNo)  transportFields.push(["Despatch Doc No.:", invoice.despatchDocNo]);

  const tRightX = ML + buyerHalf + 3;
  vline(ML + buyerHalf, BUYER_Y, y + 2);
  let ty = BUYER_Y + 6;
  transportFields.forEach(([label, value]) => {
    setFont("normal", 7.5); rgb(150, 150, 150); txt(label, tRightX, ty);
    setFont("bold",   7.5); rgb(50,  50,  50);  txt(value, PAGE_W - MR, ty, "right");
    ty += 4;
  });

  y += 2;
  hline(y, ML, PAGE_W - MR, [220, 227, 237]);
  y += 3;

  // ── ITEMS TABLE ───────────────────────────────────────────────────────────
  // Column definitions
  type ColDef = { label: string; w: number; align: "left"|"center"|"right" };
  const cols: ColDef[] = hasGST
    ? [
        { label: "S.No", w: 7,  align: "center" },
        { label: "Description of Goods", w: 54, align: "left"   },
        { label: "HSN/SAC", w: 18, align: "center" },
        { label: "GST %",   w: 10, align: "center" },
        { label: "Qty",     w: 13, align: "center" },
        { label: "Rate",    w: 16, align: "center" },
        { label: "Unit",    w: 13, align: "center" },
        { label: "Amount",  w: CW - 7 - 54 - 18 - 10 - 13 - 16 - 13, align: "right" },
      ]
    : [
        { label: "S.No", w: 7,  align: "center" },
        { label: "Description of Goods", w: 68, align: "left"   },
        { label: "HSN/SAC", w: 20, align: "center" },
        { label: "Qty",     w: 15, align: "center" },
        { label: "Rate",    w: 18, align: "center" },
        { label: "Unit",    w: 15, align: "center" },
        { label: "Amount",  w: CW - 7 - 68 - 20 - 15 - 18 - 15, align: "right" },
      ];

  // Table header row
  const TH = 6.5;
  filledRect(ML, y, CW, TH, ...BLUE);
  let cx = ML;
  cols.forEach(c => {
    setFont("bold", 7.5); rgb(255, 255, 255);
    const tx = c.align === "center" ? cx + c.w / 2
             : c.align === "right"  ? cx + c.w - 1.5
             : cx + 1.5;
    txt(c.label, tx, y + 4.5, c.align);
    cx += c.w;
  });
  y += TH;

  // Item rows
  const LINE_H = 4;
  const ROW_PT = 4;
  const ROW_PB = 3;
  const DESC_W = cols.find(c => c.label === "Description of Goods")!.w - 4;

  invoice.items.forEach((item, idx) => {
    setFont("bold", 8);
    const nameLines: string[] = doc.splitTextToSize(item.productName, DESC_W);
    const descLines: string[] = item.description
      ? item.description.split(/\r?\n/).flatMap((l: string) =>
          l.trim() ? doc.splitTextToSize(l.trim(), DESC_W) : [""])
      : [];
    const totalLines = nameLines.length + (descLines.length > 0 ? descLines.length : 0);
    const rowH = Math.max(11, ROW_PT + totalLines * LINE_H + ROW_PB);

    // Alternating tint
    if (idx % 2 === 0) { doc.setFillColor(245, 248, 252); doc.rect(ML, y, CW, rowH, "F"); }

    cx = ML;
    const midY = y + rowH / 2 + 1.2;

    cols.forEach((c, ci) => {
      if (c.label === "Description of Goods") {
        // Product name
        setFont("bold", 8); rgb(20, 20, 20);
        let tY = y + ROW_PT;
        nameLines.forEach((l: string) => { txt(l, cx + 1.5, tY); tY += LINE_H; });
        // Description lines
        if (descLines.length > 0) {
          setFont("normal", 7); rgb(120, 120, 120);
          descLines.forEach((l: string) => { txt(l, cx + 1.5, tY); tY += LINE_H; });
        }
      } else {
        let cellVal = "";
        if (c.label === "S.No")    cellVal = String(idx + 1);
        if (c.label === "HSN/SAC") cellVal = item.hsnCode;
        if (c.label === "GST %")   cellVal = `${item.gstPercent}%`;
        if (c.label === "Qty")     cellVal = String(item.quantity);
        if (c.label === "Rate")    cellVal = String(item.rate);
        if (c.label === "Unit")    cellVal = item.unit;
        if (c.label === "Amount")  cellVal = `Rs.${Math.round(item.amount).toLocaleString("en-IN")}`;

        const isBold  = c.label === "Amount" || c.label === "Qty";
        const fsize   = c.label === "Amount" ? 8 : 7.5;
        setFont(isBold ? "bold" : "normal", fsize);
        rgb(c.label === "S.No" ? 120 : 40, c.label === "S.No" ? 120 : 40, c.label === "S.No" ? 120 : 40);

        const tx = c.align === "center" ? cx + c.w / 2
                 : c.align === "right"  ? cx + c.w - 1.5
                 : cx + 1.5;
        txt(cellVal, tx, midY, c.align);
      }

      // Column divider
      if (ci < cols.length - 1) vline(cx + c.w, y, y + rowH);
      cx += c.w;
    });

    hline(y + rowH, ML, PAGE_W - MR, [220, 227, 237]);
    y += rowH;
  });

  // Gap + separator after items table
  y += 4;
  hline(y);
  y += 2;

  // ── TOTALS ────────────────────────────────────────────────────────────────
  const TOT_ROW = 5.8;
  const TOT_W   = 84;
  const TOT_X   = PAGE_W - MR - TOT_W;
  const VAL_X   = PAGE_W - MR - 1.5;
  const LBL_X   = TOT_X + 2;
  const PCT_X   = TOT_X + 54;

  // Left border of totals column — drawn per totalRow call via hline only

  function totalRow(
    label: string, value: string, pct?: string,
    bold = false, bg?: [number,number,number], fgWhite = false
  ) {
    if (bg) { doc.setFillColor(...bg); doc.rect(ML, y, CW, TOT_ROW, "F"); }
    setFont(bold ? "bold" : "normal", 7.5);
    rgb(fgWhite ? 255 : (bold ? 30 : 80), fgWhite ? 255 : (bold ? 30 : 80), fgWhite ? 255 : (bold ? 30 : 80));
    txt(label, LBL_X, y + 4);
    if (pct) { setFont("normal", 7); rgb(fgWhite ? 200 : 160, fgWhite ? 200 : 160, fgWhite ? 200 : 160); txt(pct, PCT_X, y + 4); }
    setFont(bold ? "bold" : "normal", 7.5);
    rgb(fgWhite ? 255 : (bold ? 20 : 60), fgWhite ? 255 : (bold ? 20 : 60), fgWhite ? 255 : (bold ? 20 : 60));
    txt(value, VAL_X, y + 4, "right");
    hline(y + TOT_ROW, ML, PAGE_W - MR, [220, 227, 237]);
    y += TOT_ROW;
  }

  if (hasGST) {
    totalRow("Total Before Tax", `Rs. ${Math.round(invoice.subtotal).toLocaleString("en-IN")}`);
    if (!invoice.isIGST) {
      totalRow("CGST", `Rs. ${Math.round(invoice.cgstTotal).toLocaleString("en-IN")}`, `${settings.cgstRate}%`);
      totalRow("SGST", `Rs. ${Math.round(invoice.sgstTotal).toLocaleString("en-IN")}`, `${settings.sgstRate}%`);
    } else {
      totalRow("IGST", `Rs. ${Math.round(invoice.igstTotal).toLocaleString("en-IN")}`, `${settings.igstRate}%`);
    }
    totalRow(
      "Tax Total (GST)",
      `Rs. ${Math.round(invoice.taxTotal).toLocaleString("en-IN")}`,
      `${invoice.isIGST ? settings.igstRate : Number(settings.cgstRate) + Number(settings.sgstRate)}%`
    );
    totalRow("Total After Tax", `Rs. ${Math.round(invoice.subtotal + invoice.taxTotal).toLocaleString("en-IN")}`, undefined, true, [236, 244, 252]);
  } else {
    totalRow("Subtotal", `Rs. ${Math.round(invoice.subtotal).toLocaleString("en-IN")}`);
  }

  if (invoice.otherCharges > 0) {
    totalRow(invoice.otherChargesLabel || "Other Charges", `Rs. ${Math.round(invoice.otherCharges).toLocaleString("en-IN")}`);
  }

  // Grand total — blue background
  const GT_H = TOT_ROW + 1;
  filledRect(ML, y, CW, GT_H, ...BLUE);
  setFont("bold", 9.5); rgb(255, 255, 255);
  txt("TOTAL PAYABLE", LBL_X, y + 5.2);
  txt(`Rs. ${Math.round(invoice.totalAmount).toLocaleString("en-IN")}`, VAL_X, y + 5.2, "right");
  y += GT_H + 2;

  // ── AMOUNT IN WORDS ───────────────────────────────────────────────────────
  doc.setFillColor(247, 248, 250);
  doc.rect(ML, y, CW, 8, "F");
  hline(y, ML, PAGE_W - MR, [220, 227, 237]);
  setFont("bold", 8); rgb(...BLUE);
  txt("Amount in Words:", ML + 2, y + 5.3);
  setFont("bold", 8); rgb(20, 20, 20);
  const wordsX  = ML + 38;
  const wordsW  = CW - 40;
  const wordsTxt = (invoice.totalInWords || "").toUpperCase();
  const wordLines: string[] = doc.splitTextToSize(wordsTxt, wordsW);
  txt(wordLines[0] || wordsTxt, wordsX, y + 5.3);
  hline(y + 8, ML, PAGE_W - MR, [220, 227, 237]);
  y += 10;

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const FOOT_H  = 32;
  const thirdW  = CW / 3;

  hline(y, ML, PAGE_W - MR, BLUE, 0.8);
  y += 4;

  // Bank details
  setFont("bold", 8); rgb(...BLUE); txt("Bank Details", ML + 1, y + 4);
  setFont("normal", 7.5); rgb(80, 80, 80);
  txt(`Bank: ${settings.bankName}`,          ML + 1, y + 9);
  txt(`A/C: ${settings.accountNumber}`,      ML + 1, y + 13.5);
  txt(`IFSC: ${settings.ifscCode}`,          ML + 1, y + 18);

  vline(ML + thirdW, y, y + FOOT_H);

  // Declaration
  const decX = ML + thirdW + 2;
  setFont("bold", 8); rgb(...BLUE); txt("Declaration", decX, y + 4);
  setFont("normal", 7.5); rgb(80, 80, 80);
  txt("We declare that this invoice shows",     decX, y + 9);
  txt("the actual price of goods described",    decX, y + 13);
  txt("and all particulars are true & correct.",decX, y + 17);

  vline(ML + thirdW * 2, y, y + FOOT_H);

  // Authorised signatory
  const sigX = ML + thirdW * 2 + 2;
  setFont("bold", 8); rgb(...BLUE);
  txt(`For ${settings.companyName.toUpperCase()}`, sigX, y + 4);
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.25);
  doc.rect(sigX, y + 6, thirdW - 6, 18);
  setFont("normal", 7); rgb(160, 160, 160);
  txt("Authorised Signatory", sigX + 1, y + FOOT_H - 3);

  doc.save(`${invoice.invoiceNumber}.pdf`);
}
