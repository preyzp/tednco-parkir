<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## TednCo Parkir — Project Instructions

### 1. Project Identity

- Product name: TednCo Parkir.
- Product type: Parking management SaaS and installable PWA.
- Target users: Small parking businesses.
- Keep this project separate from R3G Software POS.
- Use Indonesian for user-facing UI text.
- Treat `HANDOFF.md` as the source of truth for current project progress.

### 2. Technology Stack

- Next.js App Router.
- React and TypeScript with strict mode.
- Tailwind CSS v4.
- Package manager: pnpm.
- MongoDB Atlas using the official MongoDB Node.js Driver.
- Zod for input validation.
- An established authentication library compatible with the installed Next.js version.
- Vitest for unit/integration tests and an appropriate E2E testing framework.

Do not install unnecessary dependencies. Review the existing package configuration before adding packages.

### 3. Mandatory Workflow

Before implementing any feature:

1. Inspect the repository and current Git status.
2. Read relevant project documentation.
3. Read the relevant local Next.js documentation under `node_modules/next/dist/docs/`.
4. Define the scope and acceptance criteria.
5. Implement only the requested scope.
6. Run relevant tests, `pnpm lint`, and `pnpm build` when applicable.
7. Report changes, test results, and known limitations.
8. Update `HANDOFF.md` after meaningful milestones.

Work incrementally. Never implement the entire application in one large change.

### 4. Business Rules

- MVP vehicle types: Motor and Mobil.
- License plate and vehicle type are required.
- Customer name, phone number, and notes are optional.
- Prevent duplicate active parking sessions for the same normalized plate within the same tenant and location.
- Parking rates must be configurable by location and vehicle type.
- Checkout tariff must be explicitly selected: Reguler or Menginap.
- Menginap requires a positive integer night count.
- Prepaid is a monetary balance associated with a vehicle plate and a specific location.
- Deduct prepaid exactly once, only after successful checkout.
- Prepaid deposits are not parking service revenue.
- Record deposits, deductions, refunds, and adjustments in a ledger.
- Never allow a negative prepaid balance.
- Canceled sessions remain in history and do not count as revenue.
- Completed financial transactions cannot be casually edited.
- Do not implement offline write synchronization in the MVP.
- Do not show success until the server confirms persistence.
- Receipts, printing, PDF receipts, and WhatsApp receipts are outside the MVP scope.

Refer to `BUSINESS_RULES.md` for complete rules.

### 5. Security

- Never build custom password hashing or session cryptography.
- Enforce authorization on the server.
- Never trust a tenant ID supplied only by the browser.
- Scope every tenant-owned database operation to the authenticated tenant and authorized location.
- Validate untrusted inputs on the server.
- Protect financial operations against duplicate requests and concurrent updates.
- Audit refunds, corrections, cancellations, and other financially significant actions.
- Never commit secrets or real credentials.

### 6. UI and Design

Follow `DESIGN_SPEC.md`.

- Font: Inter.
- Primary color: #059669.
- Background: #F8FAFC.
- Surface: #FFFFFF.
- Primary text: #0F172A.
- Secondary text: #64748B.
- Border: #E2E8F0.
- Design mobile-first.
- Use clear Indonesian labels.
- Make important touch targets approximately 44–48 pixels high.
- Provide loading, empty, validation, error, and unavailable states.
- Do not communicate status using color alone.

### 7. Code Quality

- Keep TypeScript strict.
- Avoid `any` unless necessary and documented.
- Keep business logic separate from UI components.
- Centralize validation, permission checks, and design tokens.
- Do not hard-code production tariff examples.
- Do not silently change established business rules.
- Add tests for financial calculations, permissions, tenant isolation, and duplicate operations.

### 8. Definition of Done

A change is complete only when:

- Acceptance criteria have been checked.
- Relevant tests pass.
- `pnpm lint` passes.
- `pnpm build` passes when application code or configuration changes.
- Relevant documentation is updated.
- `HANDOFF.md` reflects the current project state.
- A clear summary of the changes and verification results is provided.

## Frontend component standard

- Use **shadcn/ui as the primary component system for all frontend features**. Prefer the official shadcn/ui component whenever an equivalent exists; reuse existing local components before adding another copy.
- Build domain-specific components by composing shadcn/ui primitives. Keep business rules, authentication and server authorization outside presentation components.
- Use **Lucide React exclusively for application icons**. Do not introduce another icon library or UI component library.
- Reuse centralized semantic design tokens and component variants from DESIGN_SPEC.md and the existing global CSS. Preserve Inter and primary #059669; avoid feature-specific duplicate palettes or hard-coded theme colors.
- Follow consistent mobile-first responsive patterns and accessible semantics: labels, keyboard operation, visible focus, error/status announcements and 44?48px touch targets. Do not communicate status through color alone.
- Support **Light / Dark / System** across new components, with **System as default**, using the existing next-themes provider. Verify readability and interaction states in both palettes; keep visible UI text in Indonesian.
- Add official shadcn/ui components incrementally only when an active feature needs them, preserving the existing Tailwind v4/components.json setup and pnpm security settings. Never install the entire catalog.
- Preserve working components; apply this standard to new work and relevant changes without unnecessary rewrites. Existing backend and authentication behavior must remain intact.
