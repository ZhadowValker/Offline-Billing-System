import Dexie, { type Table } from "dexie";

export interface Customer {
  id?: number;
  name: string;
  address: string;
  gstNumber: string;
  state: string;
  stateCode: string;
  contact: string;
  email: string;
  createdAt: Date;
}

export interface Product {
  id?: number;
  name: string;
  category: string;
  size: string;
  hsnCode: string;
  defaultRate: number;
  gstPercent: number;
  unit: string;
  createdAt: Date;
}

export interface InvoiceItem {
  id?: number;
  productName: string;
  description: string;
  hsnCode: string;
  quantity: number;
  rate: number;
  gstPercent: number;
  unit: string;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface Invoice {
  id?: number;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date;
  buyer: Customer;
  items: InvoiceItem[];
  subtotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  otherCharges: number;
  otherChargesLabel: string;
  totalAmount: number;
  totalInWords: string;
  isIGST: boolean;
  placeOfSupply: string;
  status: "draft" | "finalized";
  transportMode: string;
  vehicleNumber: string;
  deliveryNote: string;
  suppliersRef: string;
  otherRef: string;
  buyersOrderNo: string;
  buyersOrderDate?: Date;
  despatchDocNo: string;
  despatchThrough: string;
  destination: string;
  billOfLadingNo: string;
  motorVehicleNo: string;
  createdAt: Date;
  updatedAt: Date;
  versions: InvoiceVersion[];
}

export interface InvoiceVersion {
  versionNumber: number;
  editedAt: Date;
  editNote: string;
  snapshot: Omit<Invoice, "versions">;
}

export interface Settings {
  id?: number;
  companyName: string;
  address: string;
  gstNumber: string;
  stateCode: string;
  state: string;
  placeOfSupply: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  contact: string;
  email: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  invoicePrefix: string;
  financialYearStart: number;
  nextInvoiceNumber: number;
  githubPat?: string;
  githubRepo?: string;
  lastSyncSha?: string;
  loginPasswordHash?: string;
}

class BlessyDB extends Dexie {
  customers!: Table<Customer>;
  products!: Table<Product>;
  invoices!: Table<Invoice>;
  settings!: Table<Settings>;

  constructor() {
    super("BlessyPackagings");

    this.version(1).stores({
      customers: "++id, name, gstNumber, createdAt",
      products: "++id, name, category, hsnCode, createdAt",
      invoices: "++id, invoiceNumber, invoiceDate, status, createdAt",
      settings: "++id",
    });

    this.version(2).stores({
      customers: "++id, name, gstNumber, createdAt",
      products: "++id, name, category, hsnCode, createdAt",
      invoices: "++id, invoiceNumber, invoiceDate, status, createdAt",
      settings: "++id",
    }).upgrade(() => {
      // githubPat and githubRepo added as optional fields — no migration needed
    });

    this.version(3).stores({
      customers: "++id, name, gstNumber, createdAt",
      products: "++id, name, category, hsnCode, createdAt",
      invoices: "++id, invoiceNumber, invoiceDate, status, createdAt",
      settings: "++id",
    }).upgrade(() => {
      // lastSyncSha and loginPasswordHash added as optional fields — no migration needed
    });
  }
}

export const db = new BlessyDB();

export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.toArray();
  if (existing.length > 0) return existing[0];

  const defaults: Settings = {
    companyName: "BLESSY PACKAGINGS",
    address: "H.NO.: 413 FF, PJR NAGAR, YELLAMABANDA.\nK.P.H.B, HYDERABAD.",
    gstNumber: "36GCIPK6838N1ZR",
    stateCode: "36",
    state: "TELANGANA",
    placeOfSupply: "TELANGANA",
    bankName: "INDIAN BANK",
    accountNumber: "6668328949",
    ifscCode: "IDIB000B120",
    branchName: "",
    contact: "91 9030 47 5553",
    email: "info.blessypackagings@gmail.com",
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    invoicePrefix: "BP",
    financialYearStart: 2026,
    nextInvoiceNumber: 1,
  };

  const id = await db.settings.add(defaults);
  return { ...defaults, id };
}

export async function getNextInvoiceNumber(): Promise<string> {
  const settings = await getSettings();
  // Financial year: April start. e.g. FY 2026-27 → "26-27"
  const today = new Date();
  const calYear = today.getFullYear();
  const fyStart = today.getMonth() >= 3 ? calYear : calYear - 1; // April = month 3
  const fyShort = `${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`;
  const num = String(settings.nextInvoiceNumber).padStart(4, "0");
  return `${settings.invoicePrefix}-${fyShort}-${num}`;
}

export async function incrementInvoiceNumber(): Promise<void> {
  const settings = await getSettings();
  if (settings.id !== undefined) {
    await db.settings.update(settings.id, {
      nextInvoiceNumber: settings.nextInvoiceNumber + 1,
    });
  }
}

export function numberToWords(num: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ];

  function convertBelow1000(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + " " + ones[n % 10] + " ";
    return ones[Math.floor(n / 100)] + " Hundred " + convertBelow1000(n % 100);
  }

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  if (intPart === 0) return "Zero Rupees Only";

  let result = "";
  if (intPart >= 10000000) {
    result += convertBelow1000(Math.floor(intPart / 10000000)) + "Crore ";
  }
  if (intPart >= 100000) {
    result += convertBelow1000(Math.floor((intPart % 10000000) / 100000)) + "Lakh ";
  }
  if (intPart >= 1000) {
    result += convertBelow1000(Math.floor((intPart % 100000) / 1000)) + "Thousand ";
  }
  result += convertBelow1000(intPart % 1000);

  result = result.trim() + " Rupees";

  if (decPart > 0) {
    result += " and " + convertBelow1000(decPart).trim() + " Paise";
  }

  return result + " Only";
}
