-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS 20260807030000_programacao-isolamento-org-migration.sql
-- (usa organizacoes, projetos, user_profiles, user_organizacao(), is_super_admin(),
-- todas já criadas nas migrations anteriores)
-- ============================================================
-- FASE A do Dashboard Macro / Modo Apresentação: campos que faltam em
-- organizacoes/projetos + vínculo projeto↔usuário pra papéis de campo
-- restritos a obra(s) específica(s) (encarregado/auxiliar).
--
-- Não cria uma tabela "empresas" nova nem um enum de papel novo — o tenant
-- já é `organizacoes` e o papel continua edicao/visualizacao/insercao_pontual
-- (decisão confirmada: ver plano `cheerful-tinkering-cosmos`). A diferença
-- entre "vê todos os projetos da empresa" e "só os vinculados" é uma
-- dimensão nova e independente do papel: user_profiles.escopo_projetos.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ============ 1. CAMPOS NOVOS EM organizacoes ============

ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS cor_primaria text;
ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS plano text;

-- Hoje só is_super_admin atualiza organizacoes. Passa a permitir que a
-- própria empresa (edicao) edite o branding (cnpj/logo_url/cor_primaria) —
-- protegido por trigger abaixo pra ninguém além do Dono da Plataforma mexer
-- em is_piloto/ativo/plano.
DROP POLICY IF EXISTS "Edicao atualiza dados da propria organizacao" ON public.organizacoes;
CREATE POLICY "Edicao atualiza dados da propria organizacao" ON public.organizacoes
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (id = public.user_organizacao() AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (id = public.user_organizacao() AND public.user_papel() = 'edicao'));

CREATE OR REPLACE FUNCTION public.protege_campos_sensiveis_organizacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    new.is_piloto := old.is_piloto;
    new.ativo := old.ativo;
    new.plano := old.plano;
  END IF;
  RETURN new;
END;
$$;
-- is_piloto/ativo/plano só mudam pela mão do Dono da Plataforma — edicao da
-- própria empresa pode chamar UPDATE (pra mudar cnpj/logo_url/cor_primaria),
-- mas esses 3 campos voltam ao valor antigo se quem chamou não for
-- is_super_admin, mesmo que venham no payload.

DROP TRIGGER IF EXISTS trg_protege_campos_sensiveis_organizacao ON public.organizacoes;
CREATE TRIGGER trg_protege_campos_sensiveis_organizacao
  BEFORE UPDATE ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.protege_campos_sensiveis_organizacao();

-- ============ 2. CAMPOS NOVOS EM projetos ============

ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS cliente text;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS tipo_obra text;
-- Nome "status_geral" (não "status") de propósito: projetos.status já existe
-- com outro sentido (ativo/inativo/arquivado — ciclo de vida do registro).
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS status_geral text
  NOT NULL DEFAULT 'em_andamento'
  CHECK (status_geral IN ('planejamento','em_andamento','paralisado','concluido'));

-- ============ 3. ESCOPO DE PROJETOS DO USUÁRIO ============

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS escopo_projetos text
  NOT NULL DEFAULT 'todos'
  CHECK (escopo_projetos IN ('todos', 'vinculados'));
-- Default 'todos' preserva o comportamento de hoje pra todo mundo (ninguém
-- perde acesso a nada sem uma ação explícita de alguém com papel edicao).
-- 'vinculados' = só enxerga os projetos que aparecem em projeto_usuarios.

CREATE TABLE IF NOT EXISTS public.projeto_usuarios (
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  atribuido_por uuid REFERENCES auth.users(id),
  atribuido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (projeto_id, user_id)
);

ALTER TABLE public.projeto_usuarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_usuarios TO authenticated;
GRANT ALL ON public.projeto_usuarios TO service_role;

-- Leitura: o próprio usuário vê seus vínculos; edicao/Dono da mesma empresa
-- do usuário-alvo também vê (pra montar a tela de gestão) — mesmo formato
-- de user_papel_modulos.
DROP POLICY IF EXISTS "Leitura projeto_usuarios" ON public.projeto_usuarios;
CREATE POLICY "Leitura projeto_usuarios" ON public.projeto_usuarios
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = projeto_usuarios.user_id
        AND up.organizacao_id = public.user_organizacao()
        AND public.user_papel() = 'edicao'
    )
  );

DROP POLICY IF EXISTS "Edicao gerencia projeto_usuarios" ON public.projeto_usuarios;
CREATE POLICY "Edicao gerencia projeto_usuarios" ON public.projeto_usuarios
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = projeto_usuarios.user_id
        AND up.organizacao_id = public.user_organizacao()
        AND public.user_papel() = 'edicao'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = projeto_usuarios.user_id
        AND up.organizacao_id = public.user_organizacao()
        AND public.user_papel() = 'edicao'
    )
  );

-- ============ 4. FUNÇÃO: usuário logado enxerga este projeto? ============

CREATE OR REPLACE FUNCTION public.user_ve_projeto(p_projeto_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.status_solicitacao = 'aprovado'
    AND (
      up.escopo_projetos = 'todos'
      OR EXISTS (
        SELECT 1 FROM public.projeto_usuarios pu
        WHERE pu.projeto_id = p_projeto_id AND pu.user_id = up.id
      )
    )
  );
$$;

-- ============ 5. POLICY DE LEITURA DE projetos GANHA A RESTRIÇÃO ============
-- Mantém literalmente o resto da regra de 20260803001400_projetos-acesso-
-- edicao-migration.sql — só empilha "e o usuário precisa enxergar ESTE
-- projeto", que hoje é sempre verdade (escopo_projetos default 'todos').

DROP POLICY IF EXISTS "Leitura projetos da organizacao" ON public.projetos;
CREATE POLICY "Leitura projetos da organizacao" ON public.projetos
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(id))
  );

NOTIFY pgrst, 'reload schema';
