-- ============================================================
-- MIGRAÇÃO: Corrige views "Security Definer" reportadas pelo Security
-- Advisor do Supabase (CRITICAL). Execute no SQL Editor do ProjectObra.
-- ============================================================
-- Uma view sem `security_invoker` roda com o privilégio de quem a CRIOU
-- (dono do schema), não de quem a consulta. Isso quebra silenciosamente
-- qualquer suposição de "o JOIN com uma tabela que tem RLS já filtra" —
-- RLS só é reavaliado pelo invocador real da query, e o invocador de uma
-- view assim é sempre o dono, que tipicamente contorna RLS.
--
-- Confirmado ao vivo em produção (não é teórico): uma requisição SEM login
-- contra public.vw_projeto_kpis retornou avanço físico, PPC e ocorrências
-- críticas de obra de qualquer organização. O front-end também consulta
-- essa view sem filtro de organização (usePortfolioProjetos em
-- portfolio-db.ts), então hoje QUALQUER usuário logado de QUALQUER empresa
-- cliente recebe pela rede os KPIs de TODAS as empresas, não só da própria
-- — só não exibe os que não são dela porque filtra no cliente depois.
--
-- ============ 1. vw_projeto_kpis: filtro de RLS replicado no WHERE ============
-- Não dá pra simplesmente ligar security_invoker=on aqui: a materialized
-- view por trás (projeto_kpis_snapshot) tem REVOKE ALL de authenticated/anon
-- de propósito (matview não suporta RLS — ver Fase C, 20260813020000). Com
-- security_invoker, o usuário autenticado perderia acesso a ela por
-- completo. A correção é a view continuar rodando como dono (contornando
-- esse REVOKE de propósito), mas decidindo ELA MESMA quem vê o quê — com o
-- mesmo predicado da policy "Leitura projetos da organizacao" de
-- public.projetos (20260813000000_acesso-por-obra-versionado.sql), em vez
-- de confiar num JOIN que nunca filtrou nada de verdade.

CREATE OR REPLACE VIEW public.vw_projeto_kpis AS
SELECT k.*
FROM public.projeto_kpis_snapshot k
JOIN public.projetos p ON p.id = k.projeto_id
WHERE public.is_super_admin()
   OR (p.organizacao_id = public.user_organizacao() AND public.user_ve_projeto(p.id));

REVOKE ALL ON public.vw_projeto_kpis FROM PUBLIC, anon;
GRANT SELECT ON public.vw_projeto_kpis TO authenticated;

-- ============ 2. v_organizacao_modulos_ativos: nunca deveria ser lida direto ============
-- Já foi documentada como "não exposta ao PostgREST" na migration original
-- (20260816092000), mas sem REVOKE explícito ela herdava o privilégio
-- padrão do schema public — mesma causa do item 1, só que aqui ainda sem
-- dado sensível em produção (tabelas por trás praticamente vazias hoje).
-- Só as funções SECURITY DEFINER que ficam por cima dela
-- (meus_modulos_comerciais_ativos, organizacao_pode_ler/escrever_modulo_
-- comercial) devem lê-la — e elas continuam funcionando normalmente porque
-- rodam com o privilégio de quem as criou, não do chamador.

REVOKE ALL ON public.v_organizacao_modulos_ativos FROM PUBLIC, authenticated, anon;

-- ============ 3. solicitacoes_exclusao: sem consumidor no front-end, tranca ============
-- Nenhuma tela usa essa view (confirmado por busca no código) — existe só
-- de apoio pra inspeção manual do Dono da Plataforma no SQL Editor. Sem RLS
-- possível numa view e sem REVOKE, ela ficava de fato acessível pra
-- qualquer authenticated (e possivelmente anon), expondo email + motivo de
-- exclusão de conta de usuários de QUALQUER empresa cliente. Se um dia
-- vira tela de verdade, expor por função SECURITY DEFINER restrita a
-- is_super_admin() (mesmo padrão do item 2), não pela view direto.

REVOKE ALL ON public.solicitacoes_exclusao FROM PUBLIC, authenticated, anon;

NOTIFY pgrst, 'reload schema';
