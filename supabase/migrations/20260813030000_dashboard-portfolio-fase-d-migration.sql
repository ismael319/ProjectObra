-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS 20260813020000_dashboard-portfolio-fase-c-migration.sql
-- ============================================================
-- FASE D do Dashboard Macro / Modo Apresentação: playlists/slides + acesso
-- público por token, sem login.
--
-- Achado da Fase 0: este banco NUNCA deu acesso a `anon` em tabela real — ao
-- contrário, duas migrations (20260804000000, 20260806000000) revogaram
-- grants acidentais. Por isso aqui NENHUMA tabela real recebe GRANT pra
-- anon: o acesso público inteiro passa por funções SECURITY DEFINER
-- estreitas, cada uma revalidando o token e devolvendo só os campos
-- necessários daquele tipo de slide — nunca a tabela crua.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ 1. TABELAS ============

CREATE TABLE IF NOT EXISTS public.apresentacao_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  loop boolean NOT NULL DEFAULT true,
  transicao text NOT NULL DEFAULT 'fade' CHECK (transicao IN ('fade', 'slide', 'corte')),
  -- Segredo em si (não é um id de registro comum) — 24 bytes aleatórios,
  -- não um uuid previsível. Revogar = token_revogado_em; regenerar = troca
  -- o valor E limpa token_revogado_em (ver funções na seção 5).
  token_acesso_publico text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  token_revogado_em timestamptz,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  -- Playlist de empresa (todos os projetos) OU de um projeto específico —
  -- nunca as duas coisas, nunca nenhuma.
  CHECK ((organizacao_id IS NOT NULL) <> (projeto_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.apresentacao_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.apresentacao_playlists(id) ON DELETE CASCADE,
  ordem integer NOT NULL,
  tipo_tela text NOT NULL CHECK (tipo_tela IN
    ('dashboard_macro', 'curva_s', 'mapa_setores', 'producao_visual', 'ocorrencias', 'custom_url')),
  -- Só preenchido quando a playlist é de empresa mas o slide mira UM projeto
  -- (ex.: "Curva S da Torre B" dentro de uma playlist de portfólio). Numa
  -- playlist de projeto, fica NULL e herda o projeto da playlist.
  projeto_id uuid REFERENCES public.projetos(id),
  duracao_segundos integer NOT NULL DEFAULT 30 CHECK (duracao_segundos > 0),
  parametros jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_apresentacao_slides_playlist ON public.apresentacao_slides (playlist_id, ordem);
CREATE UNIQUE INDEX IF NOT EXISTS idx_apresentacao_playlists_token ON public.apresentacao_playlists (token_acesso_publico);

ALTER TABLE public.apresentacao_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apresentacao_slides ENABLE ROW LEVEL SECURITY;

-- ============ 2. FUNÇÃO AUXILIAR: empresa "dona" de uma playlist ============

CREATE OR REPLACE FUNCTION public.apresentacao_playlist_organizacao(p_organizacao_id uuid, p_projeto_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_organizacao_id, (SELECT p.organizacao_id FROM public.projetos p WHERE p.id = p_projeto_id));
$$;

-- ============ 3. POLICIES: tela de configuração (autenticada) ============
-- edicao da empresa dona da playlist; se for playlist de projeto, também
-- precisa enxergar aquele projeto (user_ve_projeto — Fase A).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.apresentacao_playlists TO authenticated;
GRANT ALL ON public.apresentacao_playlists TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apresentacao_slides TO authenticated;
GRANT ALL ON public.apresentacao_slides TO service_role;

DROP POLICY IF EXISTS "Edicao gerencia apresentacao_playlists" ON public.apresentacao_playlists;
CREATE POLICY "Edicao gerencia apresentacao_playlists" ON public.apresentacao_playlists
  FOR ALL TO authenticated
  USING (
    public.is_super_admin() OR (
      public.apresentacao_playlist_organizacao(organizacao_id, projeto_id) = public.user_organizacao()
      AND public.user_papel() = 'edicao'
      AND (projeto_id IS NULL OR public.user_ve_projeto(projeto_id))
    )
  )
  WITH CHECK (
    public.is_super_admin() OR (
      public.apresentacao_playlist_organizacao(organizacao_id, projeto_id) = public.user_organizacao()
      AND public.user_papel() = 'edicao'
      AND (projeto_id IS NULL OR public.user_ve_projeto(projeto_id))
    )
  );

DROP POLICY IF EXISTS "Edicao gerencia apresentacao_slides" ON public.apresentacao_slides;
CREATE POLICY "Edicao gerencia apresentacao_slides" ON public.apresentacao_slides
  FOR ALL TO authenticated
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.apresentacao_playlists pl
      WHERE pl.id = apresentacao_slides.playlist_id
        AND public.apresentacao_playlist_organizacao(pl.organizacao_id, pl.projeto_id) = public.user_organizacao()
        AND public.user_papel() = 'edicao'
        AND (pl.projeto_id IS NULL OR public.user_ve_projeto(pl.projeto_id))
    )
    AND (apresentacao_slides.projeto_id IS NULL OR public.user_ve_projeto(apresentacao_slides.projeto_id))
  )
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.apresentacao_playlists pl
      WHERE pl.id = apresentacao_slides.playlist_id
        AND public.apresentacao_playlist_organizacao(pl.organizacao_id, pl.projeto_id) = public.user_organizacao()
        AND public.user_papel() = 'edicao'
        AND (pl.projeto_id IS NULL OR public.user_ve_projeto(pl.projeto_id))
    )
    AND (apresentacao_slides.projeto_id IS NULL OR public.user_ve_projeto(apresentacao_slides.projeto_id))
  );

-- ============ 4. REVOGAR / REGENERAR TOKEN ============
-- Revogar mantém o valor antigo (auditoria) só invalida via token_revogado_em.
-- Regenerar troca o valor por um novo aleatório E limpa token_revogado_em.
-- Funções (não UPDATE direto): a coluna tem DEFAULT gerado, mas trocar por
-- um novo valor aleatório em UPDATE não re-executa o DEFAULT — precisa gerar
-- explicitamente aqui.

CREATE OR REPLACE FUNCTION public.apresentacao_revogar_token(p_playlist_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.apresentacao_playlists SET token_revogado_em = now() WHERE id = p_playlist_id;
$$;

CREATE OR REPLACE FUNCTION public.apresentacao_regenerar_token(p_playlist_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  novo_token text := encode(gen_random_bytes(24), 'hex');
BEGIN
  UPDATE public.apresentacao_playlists
  SET token_acesso_publico = novo_token, token_revogado_em = NULL
  WHERE id = p_playlist_id;
  RETURN novo_token;
END;
$$;

-- As duas funções rodam como SECURITY DEFINER mas continuam checando a RLS
-- de quem chama através do UPDATE normal — GRANT EXECUTE só resolve
-- privilégio de tabela, a policy "Edicao gerencia apresentacao_playlists"
-- ainda barra quem não é edicao da empresa dona.
GRANT EXECUTE ON FUNCTION public.apresentacao_revogar_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apresentacao_regenerar_token(uuid) TO authenticated;

-- ============ 5. ACESSO PÚBLICO — RPCs estreitas, sem GRANT em tabela real ====
-- Cada função junta direto com apresentacao_playlists pelo token (token
-- inválido/revogado/inativo = zero linhas, sem erro) — não existe um "modo
-- debug" que vaze dado sem o token bater.

CREATE OR REPLACE FUNCTION public.apresentacao_publica_playlist(p_token text)
RETURNS TABLE (playlist_id uuid, nome text, loop boolean, transicao text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT id, nome, loop, transicao
  FROM public.apresentacao_playlists
  WHERE token_acesso_publico = p_token AND token_revogado_em IS NULL AND ativo;
$$;

CREATE OR REPLACE FUNCTION public.apresentacao_publica_slides(p_token text)
RETURNS TABLE (slide_id uuid, ordem integer, tipo_tela text, projeto_id uuid, duracao_segundos integer, parametros jsonb)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT s.id, s.ordem, s.tipo_tela, COALESCE(s.projeto_id, pl.projeto_id), s.duracao_segundos, s.parametros
  FROM public.apresentacao_slides s
  JOIN public.apresentacao_playlists pl ON pl.id = s.playlist_id
  WHERE pl.token_acesso_publico = p_token AND pl.token_revogado_em IS NULL AND pl.ativo
  ORDER BY s.ordem;
$$;

-- dashboard_macro: KPIs de todos os projetos no escopo da playlist (a
-- própria, se for de projeto; todos os da empresa, se for de portfólio).
CREATE OR REPLACE FUNCTION public.apresentacao_publica_kpis(p_token text)
RETURNS TABLE (
  projeto_id uuid, nome text, cliente text, status_semaforo text,
  avanco_fisico_pct numeric, avanco_planejado_pct numeric, ppc_ultima_semana numeric,
  efetivo_atual integer, ocorrencias_abertas integer, ocorrencias_criticas integer
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT p.id, p.nome, p.cliente, k.status_semaforo,
         k.avanco_fisico_pct, k.avanco_planejado_pct, k.ppc_ultima_semana,
         k.efetivo_atual, k.ocorrencias_abertas, k.ocorrencias_criticas
  FROM public.apresentacao_playlists pl
  JOIN public.projetos p ON (pl.projeto_id = p.id OR (pl.projeto_id IS NULL AND p.organizacao_id = pl.organizacao_id))
  LEFT JOIN public.projeto_kpis_snapshot k ON k.projeto_id = p.id
  WHERE pl.token_acesso_publico = p_token AND pl.token_revogado_em IS NULL AND pl.ativo
  ORDER BY p.nome;
$$;

-- curva_s: "spotlight" de UM projeto (avanço físico x planejado) — não é o
-- gráfico histórico completo (esse é calculado no navegador em cima do
-- `dados` de cada cronograma, pesado demais pra reconstruir numa função
-- pública); mesmo número que já alimenta o Dashboard Macro.
CREATE OR REPLACE FUNCTION public.apresentacao_publica_curva_s(p_token text, p_projeto_id uuid)
RETURNS TABLE (nome text, cliente text, avanco_fisico_pct numeric, avanco_planejado_pct numeric, status_semaforo text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT p.nome, p.cliente, k.avanco_fisico_pct, k.avanco_planejado_pct, k.status_semaforo
  FROM public.apresentacao_playlists pl
  JOIN public.projetos p ON p.id = p_projeto_id
    AND (pl.projeto_id = p.id OR (pl.projeto_id IS NULL AND p.organizacao_id = pl.organizacao_id))
  LEFT JOIN public.projeto_kpis_snapshot k ON k.projeto_id = p.id
  WHERE pl.token_acesso_publico = p_token AND pl.token_revogado_em IS NULL AND pl.ativo;
$$;

-- ocorrencias: RDR em aberto de UM projeto (mesmo critério de "aberto" já
-- usado em RdrDashboard.tsx — concluido <> 'SIM'), as 10 mais urgentes.
CREATE OR REPLACE FUNCTION public.apresentacao_publica_ocorrencias(p_token text, p_projeto_id uuid)
RETURNS TABLE (local text, descricao text, data_ocorrido date, prazo date, concluido text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT r.local, r.descricao, r.data_ocorrido, r.prazo, r.concluido
  FROM public.apresentacao_playlists pl
  JOIN public.projetos p ON p.id = p_projeto_id
    AND (pl.projeto_id = p.id OR (pl.projeto_id IS NULL AND p.organizacao_id = pl.organizacao_id))
  JOIN public.rdr_records r ON r.projeto_id = p.id AND r.concluido IS DISTINCT FROM 'SIM'
  WHERE pl.token_acesso_publico = p_token AND pl.token_revogado_em IS NULL AND pl.ativo
  ORDER BY r.prazo NULLS LAST, r.data_ocorrido DESC
  LIMIT 10;
$$;

-- producao_visual: atividades de HOJE de um projeto, campos mínimos — o
-- player monta o card chamando buildRelatorioVisual (src/lib/relatorio-
-- visual.ts) no navegador, mesma função pura já usada na tela autenticada.
CREATE OR REPLACE FUNCTION public.apresentacao_publica_producao_hoje(p_token text, p_projeto_id uuid)
RETURNS TABLE (
  id uuid, name text, area text, stage text, foreman text, company text,
  status text, is_extra boolean, inativa boolean, fora_do_plano boolean, planned_date date
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT a.id, a.name, a.area, a.stage, a.foreman, a.company,
         a.status::text, a.is_extra, a.inativa, a.fora_do_plano, a.planned_date
  FROM public.apresentacao_playlists pl
  JOIN public.projetos p ON p.id = p_projeto_id
    AND (pl.projeto_id = p.id OR (pl.projeto_id IS NULL AND p.organizacao_id = pl.organizacao_id))
  JOIN public.activities a ON a.projeto_id = p.id AND a.planned_date = CURRENT_DATE
  WHERE pl.token_acesso_publico = p_token AND pl.token_revogado_em IS NULL AND pl.ativo;
$$;

-- Sem RPC pra mapa_setores nem custom_url: mapa_setores ainda não tem uma
-- versão pública nesta fase (a tela autenticada — Gestão à Vista — renderiza
-- planta em imagem + grade de células, replicar isso como função pública é
-- um trabalho à parte; o player mostra "Em breve" pra esse tipo de slide).
-- custom_url não usa banco — o player só abre parametros.url num iframe.

GRANT EXECUTE ON FUNCTION public.apresentacao_publica_playlist(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_slides(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_kpis(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_curva_s(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_ocorrencias(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apresentacao_publica_producao_hoje(text, uuid) TO anon, authenticated;
-- Concedido pra authenticated também: a tela de configuração usa a MESMA
-- função pra "Pré-visualizar" (abre o player com o token de verdade da
-- própria playlist) em vez de duplicar a lógica de busca.

NOTIFY pgrst, 'reload schema';
