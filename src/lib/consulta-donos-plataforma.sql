-- Consulta (somente leitura) — lista quem hoje é Dono da Plataforma.
-- Execute no Supabase SQL Editor.

SELECT id, email, papel, status_solicitacao, criado_em
FROM public.user_profiles
WHERE is_super_admin = true
ORDER BY criado_em;
