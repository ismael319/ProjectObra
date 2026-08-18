-- FASE 5: REVOKE massivo do role anon — remove acesso público a funções
-- e tabelas que exigem autenticação.

-- ============ 1. REVOKE ALL de funções e tabelas ============

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ============ 2. Re-grant apenas o que o anon PRECISA ter ============

-- Apresentações públicas (token)
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_curva_s(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_kpis(text) TO anon;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_ocorrencias(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_playlist(text) TO anon;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_producao_hoje(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_slides(text) TO anon;

-- Rate limit (login/signup)
GRANT EXECUTE ON FUNCTION public.verificar_rate_limit_login(text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.verificar_rate_limit_signup(text, integer, integer) TO anon;

-- Logging (login/signup)
GRANT EXECUTE ON FUNCTION public.registrar_evento_seguranca(text, text, uuid, text, text, text, jsonb) TO anon;

-- ============ 3. Resultado ============
-- anon agora só pode:
--   - Ver apresentações públicas (6 funções)
--   - Verificar rate limit (2 funções)
--   - Registrar eventos de segurança (1 função)
--   - NÃO pode acessar nenhuma tabela
--   - NÃO pode chamar nenhuma outra função

NOTIFY pgrst, 'reload schema';
