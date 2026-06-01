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
| `members` | participantes (texto libre, no necesitan cuenta). **`weight`** (peso default para reparto proporcional, default 1) |
| `expenses` | `title`, `amount`, `currency`, `rate_to_base`, `paid_by`, `date`, `category`, `created_by` |
| `expense_shares` | (expense_id, member_id) — entre quiénes se divide. **`weight`** (peso del participante en ese gasto, default 1) |
| `categories` | categorías **personalizadas** por grupo: `value` (slug), `label`, `color` (clases tailwind), `hex`. Los presets viven en `lib/categories.ts` |
| `payments` | pagos/saldados: `from_member`, `to_member`, `amount` (moneda base), `date`, `note`. Reducen la deuda en balances/liquidación |
| `templates` | gastos típicos (de un tap): `label`, `category`, `amount` (opcional). Abren el form precargado via query params |

- Funciones `SECURITY DEFINER`: `is_group_member(gid)`, `join_group(token)` (RPC para invitación),
  y trigger `add_owner_to_group` (suma al dueño a `group_users` al crear grupo).
- **OJO — el creador NO se agrega como `member`** (solo a `group_users`). Deuda pendiente.
- **IMPORTANTE — GRANTs:** RLS filtra filas, pero el rol `authenticated` necesita ADEMÁS
  `GRANT` de tabla. Sin eso, da `42501 permission denied` aun logueado. Los grants están
  al final de `schema.sql` (solo a `authenticated`; `anon` queda sin acceso a propósito).

## Páginas

- `/login` — registro / ingreso (email + password). Respeta `?next=`. Tiene modo
  **"olvidé mi contraseña"** (manda link a `/reset` con `resetPasswordForEmail`).
- `/reset` — setear nueva contraseña al volver del email (sesión `PASSWORD_RECOVERY`).
- `/` — lista de mis grupos + crear grupo.
- `/g/[id]` — grupo, tabs:
  - **Gastos**: tarjeta de **gastos típicos** (chips de un tap + "Editar" para crear plantillas),
    filtro por categoría, lista con editar (✎) / borrar (✕).
  - **Balances**: total + **donut por categoría** + **barras por mes** (SVG, sin libs) + saldos.
  - **Liquidación**: transferencias mínimas + **marcar pagado** / alta de pago manual + historial.
  - **Miembros**: alta/baja, **peso** por miembro (reparto proporcional), link de invitación.
- `/g/[id]/nuevo` — agregar gasto. Acepta prefill por query params (`title`/`category`/`amount`)
  desde las plantillas. Permite **+ Nueva categoría** y **reparto proporcional** (peso por miembro).
- `/g/[id]/editar/[eid]` — editar un gasto (mismo form, comparten `components/ExpenseForm.tsx`).
- `/join?token=…` — sumarse a un grupo por invitación (llama RPC `join_group`).

## Features hechas

- Auth (con **recuperación de contraseña** vía `/reset`), grupos (moneda base), miembros,
  gastos **multi-moneda** (tipo de cambio manual), balances y liquidación (greedy), invitación por link.
- **Categorías**: presets para convivientes en `lib/categories.ts` (Supermercado, Alquiler,
  Servicios, Comida/Delivery, Transporte, Hogar, Salud, Ocio, Otros) + **categorías personalizadas
  por grupo** (tabla `categories`, "+ Nueva categoría" en el form). Helpers `mergeCategories`,
  `metaFrom`, `slugifyCategory`, `paletteAt`.
- **Editar gastos** (`/g/[id]/editar/[eid]`); form compartido en `components/ExpenseForm.tsx`.
- **Gráficos** (`components/charts.tsx`, SVG puro sin dependencias): donut por categoría +
  barras de gasto por mes. Helpers `spendByCategory` / `spendByMonth` en `lib/balances.ts`.
- **Registrar pagos / saldados** (tabla `payments`): marcar pagado sobre una transferencia,
  alta manual e historial. `computeBalances(members, expenses, shares, payments)` resta lo pagado.
- **Reparto proporcional**: `members.weight` (default editable en Miembros) y `expense_shares.weight`
  (por gasto). El form tiene toggle "Reparto proporcional". `computeBalances` reparte por peso.
- **Gastos típicos de un tap** (tabla `templates`): chips en la tab Gastos que abren el form
  precargado. Alta/baja con "Editar".

## Pasos manuales (Supabase / Vercel)

1. **Supabase SQL Editor:** correr `supabase/schema.sql` (tablas + RLS + grants + funciones).
   `schema.sql` ya es la fuente de verdad completa. Si la base venía de antes, correr las
   migraciones incrementales que falten (idempotentes, `if not exists`):
   - `supabase/migration_category.sql` — columna `category` en expenses.
   - `supabase/migration_categorias_pagos.sql` — tablas `categories` y `payments`.
   - `supabase/migration_reparto_plantillas.sql` — `members.weight`, `expense_shares.weight`, tabla `templates`.
   El código es **migration-safe**: agregar/editar gasto no rompe aunque falte una migración
   (el `weight` solo se manda en reparto proporcional; las lecturas caen a `?? []`).
2. **Supabase Auth:** desactivar **Confirm email** (Authentication → Sign In/Providers → Email)
   para registro sin confirmación. En **URL Configuration**: Site URL + Redirect URLs con la URL de
   Vercel. **Para reset de contraseña agregar `…/reset`** a Redirect URLs (prod y `localhost:3000/reset`),
   sino el link del email rebota.
3. **Vercel env vars:** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ver `.env.local`),
   en Production. Las `NEXT_PUBLIC_*` se hornean en el build → **Redeploy** tras cargarlas.
4. **Vercel Deployment Protection:** apagar **Vercel Authentication** (Settings → Deployment
   Protection) para que externos accedan sin cuenta de Vercel; sino ven "Access Required / Pending Approval".

## Ideas / deuda pendiente

Pendiente del roadmap "vamos con todo" (features **sin** cambios de base):
- **Pagar con alias precargado**: botón que abra Mercado Pago / transferencia con alias+monto
  (guardar alias/CBU por miembro).
- **Presupuesto por categoría** con alerta ("vas 80% del super este mes").
- **PWA instalable** (manifest + ícono en home → quick-add del último grupo). Ver design doc Enfoque B.
- **Modo oscuro**.

Otra deuda:
- **UX convivientes:** al crear un grupo no se cargan miembros ahí mismo, y **al creador no se lo
  suma como miembro automáticamente** (solo a `group_users`). Conviene pedir integrantes en la creación
  y autovincular al dueño — habilita defaults "pagó=yo".
- **Gastos fijos/recurrentes** (alquiler, servicios): las plantillas son de *un tap*, no recurrentes
  automáticos. Aún no hay generación periódica.
- Multi-moneda: el tipo de cambio es manual; se podría auto-traer de una API.
- **URL de prod fija**: `convivencia-kzfk.vercel.app` ya es estable (apunta al último deploy de
  producción); las URLs con hash son por-deploy. Pendiente si se quiere dominio propio o sacar el `-kzfk`.
- Verificación end-to-end en navegador pendiente de hacer logueado (auth + grupo + gasto + balances).

Design docs de la sesión de office-hours en `~/.gstack/projects/convivencia/` (cuña: captura en 3 segundos).

## gstack

Instalado global en `~/.claude/skills/gstack` (v1.55). Flujo: `/office-hours` (pensar) →
`/autoplan` o `/plan-eng-review` (plan) → build → `/review` → `/qa` → `/ship`.
Usar `/browse` para navegar web.

## Validación conocida

- `node node_modules/typescript/bin/tsc --noEmit`: OK.
- `node node_modules/eslint/bin/eslint.js .`: OK (la regla `react-hooks/set-state-in-effect`
  está silenciada solo en los efectos de carga inicial con comentario justificado).
- `next build` local puede fallar sin red por `next/font/google`; en Vercel anda.
