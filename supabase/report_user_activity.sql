-- Reporte de usuarios y uso de convivencia.
-- Ejecutar despues de migration_activity_metrics.sql.

select
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    u.email
  ) as nombre,
  u.email,
  u.created_at as fecha_registro,
  u.last_sign_in_at as ultimo_inicio_sesion,
  max(a.created_at) as ultima_actividad,
  count(*) filter (
    where a.event_type = 'app_opened'
      and a.created_at >= now() - interval '30 days'
  ) as aperturas_30_dias,
  count(*) filter (
    where a.event_type <> 'app_opened'
      and a.created_at >= now() - interval '30 days'
  ) as acciones_30_dias
from auth.users u
left join public.user_activity_events a on a.user_id = u.id
group by u.id, u.email, u.created_at, u.last_sign_in_at, u.raw_user_meta_data
order by ultima_actividad desc nulls last, u.created_at desc;
