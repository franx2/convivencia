# covivencia.

Clon de **Tricount**: repartí gastos compartidos en un grupo (viaje, depto, asado). Cada quien carga lo que pagó, la app calcula quién le debe a quién y sugiere las transferencias mínimas para saldar.

**Stack:** Next.js 16 (App Router) · Supabase (Auth + Postgres + RLS) · Tailwind CSS v4 · deploy en Vercel.

## Funciones

- **Login con cuentas** (Supabase Auth, email + contraseña).
- **Grupos** con moneda base; cada usuario ve solo sus grupos.
- **Miembros**: participantes de los gastos (texto libre, no necesitan cuenta).
- **Gastos multi-moneda**: cada gasto en su moneda + tipo de cambio a la base.
- **Reparto igualitario** entre los participantes elegidos.
- **Balances** y **liquidación** (transferencias mínimas) en la moneda base.
- **Invitación por link** con token: quien lo abre (con sesión) entra al grupo.

## Modelo de datos

| Tabla | Para qué |
|---|---|
| `groups` | el grupo (nombre, moneda base, dueño, token de invitación) |
| `group_users` | qué usuarios pueden acceder a cada grupo (controla RLS) |
| `members` | participantes entre los que se reparten los gastos |
| `expenses` | cada gasto (monto, moneda, tipo de cambio, quién pagó, fecha) |
| `expense_shares` | entre qué miembros se divide cada gasto |

Seguridad por **Row Level Security**: solo ves/editás un grupo si estás en `group_users`. Las funciones `is_group_member`, `join_group` y el trigger del dueño son `SECURITY DEFINER` para evitar recursión en las policies.

## Setup local

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Crear `.env.local` con las claves de tu proyecto Supabase:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-publishable-key>
   # Opcional para "Mejorar con Claude" al importar resumenes PDF:
   ANTHROPIC_API_KEY=<tu-anthropic-key>
   # Opcional como fallback server-side; normalmente cada usuario carga su key en la app.
   OPENAI_API_KEY=<tu-openai-key>
   OPENAI_MODEL=gpt-5
   ```
3. Aplicar el esquema: en el **SQL Editor** de Supabase, pegar y ejecutar todo
   [`supabase/schema.sql`](supabase/schema.sql) (crea tablas, RLS y funciones).
4. (Opcional, para testear sin confirmar mails) en *Authentication → Sign In / Providers → Email*,
   desactivar **Confirm email**.
5. Correr el server:
   ```bash
   npm run dev
   ```

## Deploy en Vercel

1. [vercel.com/new](https://vercel.com/new) → importar este repo.
2. Cargar las env vars `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Para importar resumenes con Claude, cargar tambien `ANTHROPIC_API_KEY`.
   Para ChatGPT, cada usuario puede pegar su propia API key en la pantalla de importacion;
   `OPENAI_API_KEY` queda solo como fallback opcional server-side (`OPENAI_MODEL` tambien es opcional).
3. Deploy.
4. En **Supabase → Authentication → URL Configuration**, agregar la URL de Vercel en
   *Site URL* y *Redirect URLs*.

## Login con Google

La interfaz ya incluye el botón de Google. Para activarlo:

1. En Google Cloud, crear las credenciales OAuth web y agregar como redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. En **Supabase -> Authentication -> Providers -> Google**, habilitar el proveedor y pegar el Client ID y Client Secret de Google Cloud.
3. En **Supabase -> Authentication -> URL Configuration**, agregar tambien:
   `http://localhost:3000/login` y `https://<tu-dominio>/login` en *Redirect URLs*.

## Rutas

- `/login` — registro / ingreso.
- `/` — lista de mis grupos + crear grupo.
- `/g/[id]` — grupo: tabs Gastos, Balances, Liquidación, Miembros.
- `/g/[id]/nuevo` — agregar gasto.
- `/join?token=…` — sumarse a un grupo por invitación.
