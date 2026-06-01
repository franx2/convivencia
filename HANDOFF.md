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
| `groups` | `name`, `base_currency`, `owner_id`, `invite_token`, **`is_personal`** (espacio personal: gastos propios sin repartir), `created_at` |
| `group_users` | (group_id, user_id) — quién puede acceder. Controla RLS. |
| `members` | participantes (texto libre, no necesitan cuenta). **`weight`** (peso default reparto, default 1), **`alias`** (alias/CBU para cobrar, opcional) |
| `expenses` | `title`, `amount`, `currency`, `rate_to_base`, `paid_by`, `date`, `category`, `created_by` |
| `expense_shares` | (expense_id, member_id) — entre quiénes se divide. **`weight`** (peso del participante en ese gasto, default 1) |
| `categories` | categorías **personalizadas** por grupo: `value` (slug), `label`, `color` (clases tailwind), `hex`. Los presets viven en `lib/categories.ts` |
| `payments` | pagos/saldados: `from_member`, `to_member`, `amount` (moneda base), `date`, `note`. Reducen la deuda en balances/liquidación |
| `templates` | gastos típicos (de un tap): `label`, `category`, `amount` (opcional). Abren el form precargado via query params |
| `budgets` | presupuesto mensual por categoría: `category`, `amount`. `unique(group_id, category)` |

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
- `/g/[id]/importar` — importar un resumen de tarjeta (PDF). Solo en espacios personales.
- `/join?token=…` — sumarse a un grupo por invitación (llama RPC `join_group`).

**Espacio personal** (`groups.is_personal`): se crea desde la home con el check
"espacio personal"; arranca con un único miembro "Yo" y oculta las tabs Liquidación
y Miembros. Tiene el botón "Importar resumen".

**API route** (primer código de servidor): `app/api/import-statement/route.ts`
(Node runtime) recibe el PDF en base64, lo manda a Claude (Anthropic SDK, modelo
Haiku 4.5) como document block + tool use, y devuelve transacciones estructuradas.
Lee `ANTHROPIC_API_KEY` del entorno (server-only, NO `NEXT_PUBLIC`).

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
- **Pagar con alias** (`members.alias`): en Liquidación, "Copiar alias + monto" copia
  "alias, $monto" al portapapeles. Alias editable en Miembros.
- **Presupuesto mensual por categoría** (tabla `budgets`): editable en Balances, barra de
  progreso del gasto del mes vs límite + aviso 80% (ámbar) / 100% (rojo).
- **Categoría inteligente**: `suggestCategory(title, history)` en `lib/categories.ts` sugiere
  por historial (títulos parecidos) + palabras clave (AR). Editable; no pisa la elección manual.
- **PWA instalable / agregar al inicio en iPhone**: `app/manifest.ts` + meta apple-web-app +
  `apple-touch-icon`. Íconos PNG en `public/` (generados con `sharp`, casita emerald). Sin offline.
- **Modo oscuro**: Tailwind v4 por clase (`@custom-variant dark` en `globals.css`), script
  anti-flash en `layout.tsx`, toggle 🌙/☀️ en `Header` (recordado en localStorage). Dark en los
  primitivos `components/ui.tsx`, Header, tabs y body.
- **Espacio personal** (`groups.is_personal`): grupo de gastos propios sin repartir, con un
  único miembro "Yo". Tabs Liquidación/Miembros ocultas. Badge "personal".
- **Importar resumen de tarjeta (PDF)** en `/g/[id]/importar` (solo personal):
  - **Parser local** (`lib/import-statement.ts`): extrae texto con `pdfjs-dist` (worker desde
    CDN) y detecta transacciones por heurística (fecha + último monto, formato AR), categoriza
    con `suggestCategory`. Gratis y privado.
  - **Mejorar con IA**: `app/api/import-statement/route.ts` manda el PDF a Claude. Más robusto.
  - Preview editable (fecha/monto/título/categoría) antes de guardar como gastos.
  - Deps nuevas: `pdfjs-dist@4`, `@anthropic-ai/sdk`.

## Pasos manuales (Supabase / Vercel)

1. **Supabase SQL Editor:** correr `supabase/schema.sql` (tablas + RLS + grants + funciones).
   `schema.sql` ya es la fuente de verdad completa. Si la base venía de antes, correr las
   migraciones incrementales que falten (idempotentes, `if not exists`):
   - `supabase/migration_category.sql` — columna `category` en expenses.
   - `supabase/migration_categorias_pagos.sql` — tablas `categories` y `payments`.
   - `supabase/migration_reparto_plantillas.sql` — `members.weight`, `expense_shares.weight`, tabla `templates`.
   - `supabase/migration_alias_presupuesto.sql` — `members.alias`, tabla `budgets`.
   - `supabase/migration_espacio_personal.sql` — `groups.is_personal`.
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

- **Autovincular al creador como miembro** (decidido NO hacerlo por ahora, jun-2026): hoy el dueño
  no es `member` (solo `group_users`), así que no se lo puede elegir como quien pagó ni incluirlo
  en repartos sin agregarlo a mano. Habilitaría defaults "pagó=yo" / quick-capture. Pendiente si se retoma.
- **UX convivientes:** al crear un grupo no se cargan miembros ahí mismo. Conviene pedir integrantes
  en la creación.
- **Quick-add dedicado + PWA con deep-link** al último grupo (design doc Enfoque B): la PWA ya es
  instalable, falta la pantalla de captura rápida y que el ícono entre directo al quick-add.
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
