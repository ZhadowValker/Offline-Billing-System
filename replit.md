# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains:
- **Blessy Packagings Billing PWA** — offline-first GST billing system

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (backend), Dexie.js (IndexedDB frontend)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **PDF Generation**: jsPDF

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Blessy Billing App (artifacts/blessy-billing)

### Features
- Dashboard with revenue stats and monthly chart
- Invoice creation with auto sequential numbering (BP-2026-0001)
- CGST/SGST and IGST toggle
- PDF generation matching original tax invoice format
- Customer management (save and reuse buyers)
- Product catalog (pre-fill invoice items)
- Edit invoices with full version history
- Settings: company info, bank details, GST rates, invoice prefix
- All data stored locally in browser IndexedDB (offline-first)

### Pages
- `/` — Dashboard
- `/invoices` — Invoice list
- `/invoices/new` — Create invoice
- `/invoices/:id` — View invoice
- `/invoices/:id/edit` — Edit invoice
- `/customers` — Customer management
- `/products` — Product catalog
- `/settings` — Company & app settings

### Pre-configured with Blessy Packagings data
- GST: 36GCIPK6838N1ZR
- Bank: INDIAN BANK / 6668328949 / IDIB000B120
- Address: H.NO.: 413 FF, PJR NAGAR, YELLAMABANDA, K.P.H.B, HYDERABAD

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
