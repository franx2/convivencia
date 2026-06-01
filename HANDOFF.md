# HANDOFF — convivencia

Estado vivo del proyecto para pasar contexto entre sesiones (Claude Code / gstack u otro agente).
Leer junto con `AGENTS.md`, `CLAUDE.md`, `README.md`, `package.json` y `supabase/schema.sql`.

## Qué es

Clon de **Tricount** para **convivientes (parejas / familias que viven juntos)**: repartir
gastos compartidos, ver quién le debe a quién y sugerir transferencias mínimas para saldar.

## Stack

- **Next.js 16.2.6** (App Router) + **React 19** + **Tailwind CSS v4**.
- **Supabase** (Auth + Postgres + RLS). Proyecto ref: `ebyldojhwdupvsgzqmpg`.
- Deploy en **Vercel** (auto-deploy en cada push a `main`). Repo: `franx2/convivencia`.
- URL producción: `https://convivencia-kzfk.vercel.app`.

### Ojo con Next 16 (ver AGENTS.md)
- `middleware.ts` se **renombró a `proxy.ts`** en Next 16. No lo usamos: la auth es **client-side**.
- Antes de tocar APIs de Next, leer `node_modules/next/dist/docs/`.

## Arquitectura

- Auth y datos **100% client-side** con `@supabase/supabase-js` (no SSR, no proxy).
  - `lib/supabase.ts`: cliente único. Lee `NEXT_PUBLIC_SUPABASE_URL` y
    `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la "anon" es la **publishable key** `sb_publishable_...`).
    Si faltan, usa placeholders y avisa por consola (para no romper el build/prerender).
  - `components/AuthProvider.tsx`: contexto de auth. `useAuth()` y `useRequireAuth()`
    (redirige a `/login` si no hay sesión).
- **Seguridad real = RLS** en Supabase. La key pública sola no da acceso a las tablas.

## Modelo de datos (`supabase/schema.sql`)

| Tabla | Notas |
|---|---|
| `groups` | `name`, `base_currency`, `owner_id`, `invite_token`, `created_at` |
| `group_users` | (group_id, user_id) — quién puede acceder. Controla RLS. |
| `members` | participantes de los gastos (texto libre, no necesitan cuenta) |
| `expenses` | `title`, `amount`, `currency`, `rate_to_base`, `paid_by`, `date`, **`category`**, `created_by` |
| `expense_shares` | (expense_id, member_id) — entre quiénes se divide |

- Funciones `SECURITY DEFINER`: `is_group_member(gid)`, `join_group(token)` (RPC para invitación),
  y trigger `add_owner_to_group` (suma al dueño a `group_users` al crear grupo).
- **IMPORTANTE — GRANTs:** RLS filtra filas, pero el rol `authenticated` necesita ADEMÁS
  `GRANT` de tabla. Sin eso, da `42501 permission denied` aun logueado. Los grants están
  al final de `schema.sql` (solo a `authenticated`; `anon` queda sin acceso a propósito).

## Páginas

- `/login` — registro / ingreso (email + password). Respeta `?next=`.
- `/` — lista de mis grupos + crear grupo.
- `/g/[id]` — grupo, tabs: **Gastos** (chip + filtro por categoría), **Balances**
  (total + "Gastos por categoría" + saldos), **Liquidación** (transferencias mínimas), **Miembros** (+ link de invitación).
- `/g/[id]/nuevo` — agregar gasto (monto, moneda, tipo de cambio si no es la base, pagó, fecha, **categoría**, entre quiénes).
- `/join?token=…` — sumarse a un grupo por invitación (llama RPC `join_group`).

## Features hechas

- Auth, grupos (moneda base), miembros, gastos **multi-moneda** (tipo de cambio manual),
  balances y liquidación (greedy), invitación por link.
- **Categorías** fijas para convivientes (`lib/categories.ts`): Supermercado, Alquiler,
  Servicios, Comida/Delivery, Transporte, Hogar, Salud, Ocio, Otros. Chip + filtro en Gastos,
  resumen por categoría (monto + %) en Balances. Helper `spendByCategory` en `lib/balances.ts`.

## Pasos manuales (Supabase / Vercel)

1. **Supabase SQL Editor:** correr `supabase/schema.sql` (tablas + RLS + grants + funciones).
   Si ya estaba creado sin grants/categoría, correr el bloque de GRANTs y
   `supabase/migration_category.sql`.
2. **Supabase Auth:** desactivar **Confirm email** (Authentication → Sign In/Providers → Email)
   para registro sin confirmación. Agregar la URL de Vercel en **URL Configuration** (Site URL + Redirect URLs).
3. **Vercel env vars:** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ver `.env.local`),
   en Production. Las `NEXT_PUBLIC_*` se hornean en el build → **Redeploy** tras cargarlas.
4. **Vercel Deployment Protection:** apagar **Vercel Authentication** (Settings → Deployment
   Protection) para que externos accedan sin cuenta de Vercel; sino ven "Access Required / Pending Approval".

## Ideas / deuda pendiente

- **UX convivientes:** al crear un grupo no se cargan miembros ahí mismo, y al creador no se lo
  suma como miembro automáticamente. Convendría pedir integrantes en la creación.
- **Gastos fijos/recurrentes** (alquiler, servicios) — feature natural para convivientes, aún no está.
- Multi-moneda: el tipo de cambio es manual; se podría auto-traer de una API.
- Verificación end-to-end en navegador pendiente de hacer logueado (auth + grupo + gasto + balances).

## gstack

Instalado global en `~/.claude/skills/gstack` (v1.55). Flujo: `/office-hours` (pensar) →
`/autoplan` o `/plan-eng-review` (plan) → build → `/review` → `/qa` → `/ship`.
Usar `/browse` para navegar web.

## Validación conocida

- `node node_modules/typescript/bin/tsc --noEmit`: OK.
- `node node_modules/eslint/bin/eslint.js .`: OK (la regla `react-hooks/set-state-in-effect`
  está silenciada solo en los efectos de carga inicial con comentario justificado).
- `next build` local puede fallar sin red por `next/font/google`; en Vercel anda.
