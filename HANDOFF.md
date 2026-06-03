# HANDOFF — covivencia.

Estado vivo del proyecto para pasar contexto entre sesiones (Claude Code / gstack u otro agente).
Leer junto con `AGENTS.md`, `CLAUDE.md`, `README.md`, `package.json` y `supabase/schema.sql`.

## Qué es

Clon de **Tricount** para **convivientes (parejas / familias que viven juntos)**: repartir
gastos compartidos, ver quién le debe a quién y sugerir transferencias mínimas para saldar.
Nombre visible de la app: **covivencia.** (con punto final).

## Estado actual critico (2026-06-03)

### Git / codigo

- Branch local: `main`.
- Working tree estaba limpio antes de editar este handoff. Despues de esta actualizacion,
  puede quedar solo `HANDOFF.md` modificado localmente.
- Remoto GitHub: `origin` = `https://github.com/franx2/convivencia.git`.
- `origin/main` queda en el commit HEAD que contiene este handoff tras el push
  (`git log -1 --oneline` para SHA exacto).
- Ultimos commits relevantes:
  - `HEAD` - `feat: improve category chart with echarts`.
  - `7b42224` - `feat: add exploded category chart symbols`.
  - `b4f9fe8` - `feat: expand categories and personal shortcut`.
  - `e39f108` - `feat(balances): filtros mes/persona, ingresos por miembro y balance mensual`.
  - `0e87d95` - `feat(import): soporte de PDF con contraseña + parser afinado a Banco Patagonia`.
  - `caac530` - `feat(import): parser local afinado a Galicia VISA (saca todo sin API)`.
  - `52bc212` - `feat(import): consumos USD, control del total y lector local mejorado`.
  - `46fd044` - `fix(import): mandar el TEXTO extraído a la IA en vez del PDF (evita 429 y abarata)`.
  - `ae63561` - `feat(import): proveedor Gemini (free tier, API key del usuario)`.
  - `4246916` - `feat(import): banco y tarjeta por gasto + vista previa agrupada`.
  - `81447e0` - `feat: dashboard con barra inferior, espacio personal por defecto y dólar oficial automático`.

### Vercel / produccion

- Proyecto/URL principal visible: `convivencia-kzfk`, URL `https://convivencia-kzfk.vercel.app`.
- Se hizo **Instant Rollback** desde el dashboard porque varios deploys quedaron en `Queued`.
- En las capturas, el ultimo deploy `Ready` marcado como `Production` para `convivencia-kzfk`
  era `da886b2` (`Let users provide ChatGPT API keys`). Es probable que produccion siga en ese
  rollback aunque GitHub `main` tenga commits mas nuevos.
- El 2026-06-03 se hicieron pushes reales a `main`: `b4f9fe8` y `7b42224`. Deberian disparar
  auto-deploy si la integracion GitHub/Vercel esta normal, pero desde Codex no se pudo verificar:
  no habia `VERCEL_TOKEN`, `vercel` CLI ni carpeta `.vercel` linkeada en este proceso.
- La pantalla **All Projects -> Deployments** muestra cola acumulada en varios proyectos:
  `convivencia`, `convivencia-hvoh`, `convivencia-kzfk`. No seguir pusheando commits vacios:
  eso solo agrega mas filas `Queued`.
- Deploys queued vistos por API/script:
  - `convivencia-kzfk` `dpl_CYn9Aofvu1n7wPhS6gfhYaB8TT12` commit `d6229fa` - **cancelado OK por API**.
  - `convivencia-hvoh` `dpl_3y3PWzywFw9eoxVSWgQZfHutvqZq` commit `d6229fa` - API devolvio `not_found`.
  - `convivencia` `dpl_9PcsPwCUSigRfXre7m91C9XC1c9f` commit `d6229fa`.
  - `convivencia-hvoh` `dpl_BbhUzJNcP1q9M4d5fi5MxHXRpR8U` commit `d285b3d`.
  - `convivencia` `dpl_2nPTvivkH7xDpBfVGZGdqKTDMFmy` commit `d285b3d`.
  - `convivencia-hvoh` `dpl_8AeaLBox7r45jEBQsVF3E5VVR1wz` commit `2a34584`.
  - `convivencia` `dpl_EubWkhjEqBLqLZ75CTgLWsCpMfWb` commit `2a34584`.
  - `convivencia` `dpl_HWNGPwafb7XbcZnzpngDi6XCz5gQ` commit `1557caf`.
  - `convivencia-hvoh` `dpl_BLWd8s19YSZAz5y4ucR2Y94tciGj` commit `1557caf`.
  - `convivencia` `dpl_DvmtwvDU5etvHprgbG7Xn8hWJ6Vn` commit `da886b2`.
- Intento de cancelacion con API:
  - `GET https://api.vercel.com/v6/deployments?state=QUEUED&target=production&branch=main&limit=100`
    encontro 10 deploys.
  - `PATCH https://api.vercel.com/v12/deployments/{id}/cancel` cancelo el primero.
  - Para `convivencia-hvoh dpl_3y3...` devolvio:
    `{"error":{"code":"not_found","message":"Could not find project associated with deployment: ..."}}`
  - Se probo agregar `?slug=franx2` y siguio devolviendo `not_found`.
- Importante de seguridad: el usuario pego un token Vercel en el chat durante la sesion.
  **Debe revocarlo en `https://vercel.com/account/tokens` y crear uno nuevo si hace falta.**

### Recomendacion para retomar deploy

1. No hacer mas pushes vacios.
2. Desde Vercel dashboard, entrar proyecto por proyecto (`convivencia`, `convivencia-hvoh`,
   `convivencia-kzfk`) y cancelar manualmente los queued desde el menu `...` o desde la pagina
   individual del deployment.
3. Mantener produccion en el rollback `Ready` que funcione.
4. Cuando la cola quede limpia, redeployar manualmente **un solo commit**:
   - Si se quiere lo ultimo del repo: `HEAD` (`feat: improve category chart with echarts`).
  - Si se quiere la version anterior a ECharts: `7b42224`.
  - Si se quiere la version anterior al grafico explotado/simbolos: `b4f9fe8`.
   - Si se quiere volver al rollback estable que se veia Ready en captura: `da886b2`.
5. Tras deploy listo, revisar si Vercel quedo en modo rollback; si si, usar `Undo Rollback` o
   promover manualmente el deployment correcto a Production.

## Stack

- **Next.js 16.2.6** (App Router) + **React 19** + **Tailwind CSS v4**.
- Gráficos: **ECharts** para categorías (cliente, carga dinámica) + CSS/SVG simple para barras mensuales.
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
| `expenses` | `title`, `amount`, `currency`, `rate_to_base`, `paid_by`, `date`, `category`, `bank`, `card`, `created_by` |
| `expense_shares` | (expense_id, member_id) — entre quiénes se divide. **`weight`** (peso del participante en ese gasto, default 1) |
| `categories` | categorías **personalizadas** por grupo: `value` (slug), `label`, `color` (clases tailwind), `hex`. Los presets viven en `lib/categories.ts`; el símbolo/emoji se genera en código, no en DB. |
| `payments` | pagos/saldados: `from_member`, `to_member`, `amount` (moneda base), `date`, `note`. Reducen la deuda en balances/liquidación |
| `templates` | gastos típicos (de un tap): `label`, `category`, `amount` (opcional). Abren el form precargado via query params |
| `budgets` | presupuesto mensual por categoría: `category`, `amount`. `unique(group_id, category)` |
| `incomes` | ingresos por miembro: `group_id`, `member_id`, `amount`, `date`, `note`. Solo afecta el balance mensual, no la liquidación. |

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
- `/` — abre directamente en **grupos compartidos** + crear grupo + borrar grupos propios.
  La barra inferior tiene acceso **Personal** que entra directo a `/g/{mi-espacio}`; no muestra
  una pestaña/lista intermedia del espacio personal.
- `/g/[id]` — grupo, tabs:
  - **Gastos**: tarjeta de **gastos típicos** (chips de un tap + "Editar" para crear plantillas),
    filtro por categoría, lista con editar (✎) / borrar (✕). Categorías visibles con emoji.
  - **Balances**: filtros mes/persona, ingresos del mes, gasto del mes, balance mensual,
    **gráfico radial explotado top 6 por categoría con emoji** + barras por mes + presupuestos + saldos.
  - **Liquidación**: transferencias mínimas + **marcar pagado** / alta de pago manual + historial.
  - **Miembros**: alta/baja, **peso** por miembro (reparto proporcional), link de invitación.
- `/g/[id]/nuevo` — agregar gasto. Acepta prefill por query params (`title`/`category`/`amount`)
  desde las plantillas. Permite **+ Nueva categoría** y **reparto proporcional** (peso por miembro).
- `/g/[id]/editar/[eid]` — editar un gasto (mismo form, comparten `components/ExpenseForm.tsx`).
- `/g/[id]/importar` — importar un resumen de tarjeta (PDF). Solo en espacios personales.
- `/join?token=…` — sumarse a un grupo por invitación (llama RPC `join_group`).

**Espacio personal** (`groups.is_personal`): se auto-crea desde la home si no existe,
arranca con un único miembro "Yo" y oculta las tabs Liquidación y Miembros. En la home,
el acceso "Personal" entra directo al grupo personal.

**API route** (primer código de servidor): `app/api/import-statement/route.ts`
(Node runtime) recibe **texto extraído** o PDF en base64 y lo manda al proveedor elegido:
Claude (Anthropic SDK, modelo Haiku 4.5), ChatGPT/OpenAI (Responses API + Structured Outputs)
o Gemini (free tier, API key del usuario). Prefiere mandar texto extraído para abaratar y
evitar 429; cae al PDF solo si no hay texto. Devuelve transacciones estructuradas.
Lee `ANTHROPIC_API_KEY` del entorno para Claude. Para ChatGPT/Gemini, cada usuario pega
su propia API key en `/g/[id]/importar`; se guarda en `localStorage` del navegador y se
manda solo al endpoint cuando se usa ese proveedor. `OPENAI_API_KEY`/`GEMINI_API_KEY`
quedan como fallback server-side opcional (NO `NEXT_PUBLIC`). `OPENAI_MODEL` es opcional;
default `gpt-5`.

## Features hechas

- Auth (con **recuperación de contraseña** vía `/reset`), grupos (moneda base), miembros,
  gastos **multi-moneda** (tipo de cambio manual), balances y liquidación (greedy), invitación por link.
- **Borrar grupos propios** desde la home: limpia gastos/repartos, pagos, ingresos, presupuestos,
  plantillas, categorías y miembros antes de borrar el grupo. RLS limita el borrado al owner.
  Es tolerante si falta la tabla `incomes` (migration-safe).
- **Categorías**: presets ampliados para convivientes en `lib/categories.ts`:
  Supermercado, Alquiler, Servicios, Comida/Delivery, Transporte, Hogar, Salud, Ocio,
  Indumentaria, Educación, Mascotas, Viajes, Impuestos, Seguros, Suscripciones, Tecnología,
  Belleza, Regalos, Deportes, Bebés/Niños, Trabajo, Banco/Comisiones, Otros.
  Cada categoría tiene emoji fijo; las categorías personalizadas generan emoji automáticamente
  por nombre y si no hay match usan la inicial. Helpers `mergeCategories`, `metaFrom`,
  `slugifyCategory`, `paletteAt`, `categorySymbol`.
- **Editar gastos** (`/g/[id]/editar/[eid]`); form compartido en `components/ExpenseForm.tsx`.
- **Gráficos** (`components/charts.tsx`): gráfico radial de categorías con **ECharts**
  (`roseType: radius`, top 6, emojis, tooltip, dos mayores desplazadas/seleccionadas)
  + barras de gasto por mes en CSS. Helpers `spendByCategory` / `spendByMonth` en `lib/balances.ts`.
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
- **Ingresos por miembro** (tabla `incomes`): alta/baja en Balances, filtros por mes/persona,
  balance mensual = ingresos - gastos. No modifica la liquidación.
- **Categoría inteligente**: `suggestCategory(title, history)` en `lib/categories.ts` sugiere
  por historial (títulos parecidos) + palabras clave (AR). Editable; no pisa la elección manual.
- **PWA instalable / agregar al inicio en iPhone**: `app/manifest.ts` + meta apple-web-app +
  `apple-touch-icon`. Íconos PNG en `public/` (generados con `sharp`, casita emerald). Sin offline.
- **Modo oscuro**: Tailwind v4 por clase (`@custom-variant dark` en `globals.css`), script
  anti-flash en `layout.tsx`, toggle 🌙/☀️ en `Header` (recordado en localStorage). Dark en los
  primitivos `components/ui.tsx`, Header, tabs y body.
- **Espacio personal** (`groups.is_personal`): grupo de gastos propios sin repartir, con un
  único miembro "Yo". Tabs Liquidación/Miembros ocultas. Badge "personal". La home ya no muestra
  la pestaña personal; el acceso inferior entra directo al espacio.
- **Importar resumen de tarjeta (PDF)** en `/g/[id]/importar` (solo personal):
  - **Parser local** (`lib/import-statement.ts`): extrae texto con `pdfjs-dist` (worker desde
    CDN) y detecta transacciones por heurística (fecha + último monto, formato AR), categoriza
    con `suggestCategory`. Gratis y privado.
  - **Mejorar con IA**: `app/api/import-statement/route.ts` manda texto extraído o PDF fallback
    a Claude, ChatGPT o Gemini. ChatGPT/Gemini usan API key pegada por cada usuario
    (persistida solo en ese navegador).
  - Preview editable agrupada por Mes → Banco → Tarjeta; campos banco/tarjeta por gasto.
  - Soporta PDFs con contraseña.
  - Preview editable (fecha/monto/título/categoría/banco/tarjeta) antes de guardar como gastos.
  - Deps nuevas: `pdfjs-dist@4`, `@anthropic-ai/sdk`, `echarts`.

## Pasos manuales (Supabase / Vercel)

1. **Supabase SQL Editor:** correr `supabase/schema.sql` (tablas + RLS + grants + funciones).
   `schema.sql` ya es la fuente de verdad completa. Si la base venía de antes, correr las
   migraciones incrementales que falten (idempotentes, `if not exists`):
   - `supabase/migration_category.sql` — columna `category` en expenses.
   - `supabase/migration_categorias_pagos.sql` — tablas `categories` y `payments`.
   - `supabase/migration_reparto_plantillas.sql` — `members.weight`, `expense_shares.weight`, tabla `templates`.
   - `supabase/migration_alias_presupuesto.sql` — `members.alias`, tabla `budgets`.
   - `supabase/migration_espacio_personal.sql` — `groups.is_personal`.
   - `supabase/migration_banco_tarjeta.sql` — columnas `expenses.bank` y `expenses.card`.
   - `supabase/migration_ingresos.sql` — tabla `incomes`.
   El código es **migration-safe**: agregar/editar gasto no rompe aunque falte una migración
   (el `weight` solo se manda en reparto proporcional; banco/tarjeta solo se mandan si hay dato;
   el borrado de grupos ignora tabla `incomes` inexistente).
2. **Supabase Auth:** desactivar **Confirm email** (Authentication → Sign In/Providers → Email)
   para registro sin confirmación. En **URL Configuration**: Site URL + Redirect URLs con la URL de
   Vercel. **Para reset de contraseña agregar `…/reset`** a Redirect URLs (prod y `localhost:3000/reset`),
   sino el link del email rebota.
3. **Vercel env vars:** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ver `.env.local`),
   en Production. Para Claude, agregar `ANTHROPIC_API_KEY`. Para ChatGPT/Gemini, los usuarios pueden
   pegar su propia API key en la app; `OPENAI_API_KEY` y `GEMINI_API_KEY` quedan como fallback opcional
   server-side (`OPENAI_MODEL` / `GEMINI_MODEL` opcionales). Las `NEXT_PUBLIC_*` se hornean en el build
   → **Redeploy** tras cargarlas.
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
- Revisar seguridad de `app/api/import-statement/route.ts`: hoy el endpoint no valida sesión ni pertenencia
  al grupo antes de llamar proveedores de IA. Riesgo de consumo de cuota server-side si se usa `provider=claude`
  o fallbacks `OPENAI_API_KEY`/`GEMINI_API_KEY`.

Design docs de la sesión de office-hours en `~/.gstack/projects/convivencia/` (cuña: captura en 3 segundos).

## gstack

Instalado global en `~/.claude/skills/gstack` (v1.55). Flujo: `/office-hours` (pensar) →
`/autoplan` o `/plan-eng-review` (plan) → build → `/review` → `/qa` → `/ship`.
Usar `/browse` para navegar web.

## Validación conocida

- 2026-06-03, antes de pushear `b4f9fe8`:
  - `npm.cmd run lint`: OK.
  - `npm.cmd run build`: OK.
- 2026-06-03, antes de pushear `7b42224`:
  - `npm.cmd run lint`: OK.
  - `npm.cmd run build`: OK.
- 2026-06-03, cambio de gráfico de categorías a ECharts:
  - `npm.cmd run lint`: OK.
  - `npm.cmd run build`: OK.
- PowerShell puede bloquear `npm.ps1` por policy; usar `npm.cmd run ...`.
