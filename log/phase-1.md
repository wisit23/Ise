# Phase 1 — Auth service (login/register only)

**Status:** Register, login, refresh, logout, `/me` are built and verified end-to-end through
the browser. **Scoped down from the master plan on user's request**: KYC upload/approve,
seller-profile creation, and the report-submission endpoint are deferred — their DB tables
exist (see `database/ER-changes.md`) but have no routes yet.

**Update:** added [`database/schema.md`](../database/schema.md) — a full data-dictionary of
every table that currently exists (all 6 in `reloop_auth`: columns, types, constraints, an ER
mermaid diagram), separate from `ER-changes.md` which explains *why* each table looks the way
it does versus the original diagram. Will grow a new section per service as their schemas land.

## What was built
- `reloop_auth` Prisma schema: `User`, `BuyerProfile`, `SellerProfile`, `LoginLog`,
  `RefreshToken`, `Report` (see `database/auth-service.prisma` +
  `database/ER-changes.md` for the full reasoning per table).
- `POST /api/auth/register` — email/password/firstName/lastName/phone, bcrypt-hashed password,
  defaults to `BUYER` role, returns access+refresh tokens.
- `POST /api/auth/login` — verifies password, writes a `LoginLog` row, returns tokens.
- `POST /api/auth/refresh` — verifies the refresh JWT against the stored (non-revoked,
  non-expired) `RefreshToken` row, issues a new access token.
- `POST /api/auth/logout` — revokes the given refresh token.
- `GET /api/auth/me` — returns the current user from the access token (gateway validates first,
  auth-service re-validates independently via `requireAuth` from `shared/`).
- Frontend: `/`, `/login`, `/register` pages (Tailwind, plain — shadcn/ui component setup
  deferred, see note below), `lib/api.js` fetch wrapper, `lib/auth.js` localStorage session
  helpers, `NavBar` component that reflects logged-in/out state.

## Issues found + fixed
- **Refresh-token unique-constraint collision**: registering then immediately logging in (same
  user, same second) produced the *exact same JWT string* for the refresh token — `sub`, `role`,
  and `iat` (second-resolution) were identical, so the signature was identical too, and the
  second `INSERT` hit the `token` unique constraint and crashed the login request. Fixed by
  adding a random `jti` (UUID) into the refresh-token payload so two tokens for the same user
  are never byte-identical even within the same second. Reproduced via curl before the fix,
  confirmed fixed via curl after.
- **Text contrast on page background**: pages inherited a dark background from the browser's
  color-scheme preference (Tailwind's base reset doesn't force a background color), while text
  stayed `gray-900` — near-invisible on dark. No dark theme exists yet in this MVP, so pinned
  `body { @apply bg-white text-gray-900; }` in `globals.css` rather than building out dark-mode
  support that wasn't asked for.

## Deferred (tables exist, no routes/UI)
- KYC document upload + admin approve/reject (`SellerProfile.kyc_*` fields).
- Seller-profile creation ("เปิดร้านค้า" flow).
- Report submission (`Report` table has no endpoint).

## Verification performed
- curl against the gateway: register → login (immediately, same second — the bug case) → `/me`
  with the access token → refresh → wrong password (400) → duplicate email (409). All passed.
- Browser (Claude Browser pane): filled and submitted the real `/register` form → redirected to
  `/` → NavBar showed "สวัสดี, Praew" → clicked logout → NavBar reverted to
  "เข้าสู่ระบบ/สมัครสมาชิก". Confirmed via screenshots + `getComputedStyle` checks (background
  color fix) and `read_page` (form field/button refs).
