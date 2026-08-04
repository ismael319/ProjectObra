-- ============================================================
-- MIGRAÇÃO: Multi-empresa (multi-tenant) — Fase 1
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS user-approval-migration.sql
-- ============================================================
-- Cria o conceito de "empresa cliente" (organização): o dono cadastra uma
-- empresa nova e convida o primeiro gestor dela; esse gestor cuida da
-- própria equipe. O "projeto" (obra) passa a viver na nuvem, isolado por
-- empresa. Telas ainda sem isolamento (Gantt Livre, Apontamento/EAP,
-- Programação semanal, Mapa de Chuvas) ficam bloqueadas DE VERDADE no banco
-- pra qualquer empresa que não seja a "empresa piloto" (a primeira, a sua),
-- até as próximas fases isolarem cada uma delas.
-- ============================================================

-- ============ 1. TABELAS NOVAS (sem regras de acesso ainda) ============

CREATE TABLE public.organizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  is_piloto boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizacoes_piloto_unica_uidx ON public.organizacoes (is_piloto) WHERE is_piloto;
ALTER TABLE public.organizacoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.convites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  email text NOT NULL,
  papel_convidado text NOT NULL CHECK (papel_convidado IN ('admin','gestor','engenheiro','campo')),
  usado_em timestamptz,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX convites_email_pendente_uidx ON public.convites (lower(email)) WHERE usado_em IS NULL;
ALTER TABLE public.convites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.organizacoes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.convites TO authenticated;
GRANT ALL ON public.organizacoes, public.convites TO service_role;

-- ============ 2. NOVA COLUNA EM user_profiles (sem constraint ainda) ============

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- ============ 3. CRIAR A EMPRESA PILOTO E ENCAIXAR QUEM JÁ EXISTE ============

INSERT INTO public.organizacoes (nome, is_piloto) VALUES ('Empresa Piloto', true);

UPDATE public.user_profiles
SET organizacao_id = (SELECT id FROM public.organizacoes WHERE is_piloto)
WHERE status_solicitacao = 'aprovado' AND organizacao_id IS NULL;

-- ============ 4. COERÊNCIA (só depois do backfill acima) ============

ALTER TABLE public.user_profiles ADD CONSTRAINT aprovado_tem_organizacao
  CHECK (status_solicitacao <> 'aprovado' OR organizacao_id IS NOT NULL);

-- ============ 5. FUNÇÕES AUXILIARES ============

CREATE OR REPLACE FUNCTION public.organizacao_piloto_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM public.organizacoes WHERE is_piloto LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_organizacao()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT organizacao_id FROM public.user_profiles
  WHERE id = auth.uid() AND status_solicitacao = 'aprovado';
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.user_profiles WHERE id = auth.uid() AND status_solicitacao = 'aprovado'),
    false
  );
$$;
-- user_papel(), criada na migration anterior, continua igual — não muda.

-- ============ 6. TRIGGER DE SIGNUP: usa convite se existir ============

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  convite record;
BEGIN
  SELECT * INTO convite FROM public.convites
  WHERE lower(email) = lower(new.email) AND usado_em IS NULL
  ORDER BY criado_em DESC LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.user_profiles (id, email, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, convite.papel_convidado, 'aprovado', convite.organizacao_id);
    UPDATE public.convites SET usado_em = now() WHERE id = convite.id;
  ELSE
    INSERT INTO public.user_profiles (id, email, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, NULL, 'pendente', NULL);
  END IF;

  RETURN new;
END;
$$;
-- Se tem convite esperando aquele email: a conta já nasce aprovada, com o
-- papel e a empresa do convite. Sem convite: cai no fluxo antigo (pendente,
-- sem empresa), que só o dono ou um admin/gestor da empresa piloto decide.

-- ============ 7. POLICIES DE user_profiles, AGORA ESCOPADAS POR EMPRESA ============

DROP POLICY IF EXISTS "Admin gerencia perfis" ON public.user_profiles;
CREATE POLICY "Admin gerencia perfis da propria organizacao" ON public.user_profiles
  FOR ALL TO authenticated
  USING (public.user_papel() = 'admin' AND organizacao_id = public.user_organizacao())
  WITH CHECK (public.user_papel() = 'admin' AND organizacao_id = public.user_organizacao());

CREATE POLICY "Dono gerencia todos perfis" ON public.user_profiles
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Gestor le solicitacoes" ON public.user_profiles;
CREATE POLICY "Piloto le solicitacoes orfas" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    public.user_papel() IN ('admin','gestor')
    AND public.user_organizacao() = public.organizacao_piloto_id()
    AND organizacao_id IS NULL
  );

DROP POLICY IF EXISTS "Gestor decide solicitacoes" ON public.user_profiles;
CREATE POLICY "Piloto decide solicitacoes orfas" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    public.user_papel() IN ('admin','gestor')
    AND public.user_organizacao() = public.organizacao_piloto_id()
    AND status_solicitacao = 'pendente' AND organizacao_id IS NULL
  )
  WITH CHECK (
    (
      (public.user_papel() = 'admin' AND papel IN ('admin','gestor','engenheiro','campo'))
      OR (public.user_papel() = 'gestor' AND papel IN ('gestor','engenheiro','campo'))
    )
    AND (
      (status_solicitacao = 'aprovado' AND organizacao_id = public.user_organizacao())
      OR (status_solicitacao = 'rejeitado' AND organizacao_id IS NULL)
    )
  );

-- ============ 8. POLICIES DE organizacoes E convites ============

CREATE POLICY "Leitura organizacoes" ON public.organizacoes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.user_organizacao());

CREATE POLICY "Dono cria organizacoes" ON public.organizacoes
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

CREATE POLICY "Dono atualiza organizacoes" ON public.organizacoes
  FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Leitura convites" ON public.convites
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() IN ('admin','gestor') AND organizacao_id = public.user_organizacao()));

CREATE POLICY "Convite por dono ou gestor da organizacao" ON public.convites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.user_papel() = 'admin' AND organizacao_id = public.user_organizacao())
    OR (public.user_papel() = 'gestor' AND organizacao_id = public.user_organizacao() AND papel_convidado IN ('gestor','engenheiro','campo'))
  );

CREATE POLICY "Cancelar convite pendente" ON public.convites
  FOR DELETE TO authenticated
  USING (usado_em IS NULL AND (public.is_super_admin() OR (public.user_papel() IN ('admin','gestor') AND organizacao_id = public.user_organizacao())));

-- ============ 9. TABELAS NOVAS DO "PROJETO" NA NUVEM ============

CREATE TABLE public.projetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  codigo text,
  descricao text,
  status text,
  gestor text,
  data_inicio timestamptz,
  data_fim_prevista timestamptz,
  empresa text,
  localizacao text,
  tipo_projeto text,
  orcamento numeric,
  disciplinas jsonb NOT NULL DEFAULT '[]',
  areas jsonb NOT NULL DEFAULT '[]',
  equipe jsonb NOT NULL DEFAULT '[]',
  observacoes text,
  percentual_avanco numeric NOT NULL DEFAULT 0,
  imagem_capa text,
  cronograma_padrao_id uuid,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.projeto_cronogramas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  tipo text,
  versao integer NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  peso numeric,
  cor text,
  data_upload timestamptz NOT NULL DEFAULT now(),
  dados jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projeto_cronogramas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso projetos da organizacao" ON public.projetos
  FOR ALL TO authenticated
  USING (organizacao_id = public.user_organizacao())
  WITH CHECK (organizacao_id = public.user_organizacao());

CREATE POLICY "Acesso cronogramas da organizacao" ON public.projeto_cronogramas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()));

-- ============ 10. BLOQUEIO DE VERDADE DAS TABELAS AINDA NÃO ISOLADAS ============
-- RESTRICTIVE policy: soma com "E" (AND) às regras já existentes, sem
-- precisar reescrever nenhuma delas. Só libera pra quem é da empresa piloto.

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'scenarios','equipes','atividades','paradas',
    'empresas','liderancas','setores','areas','subareas',
    'apontamentos_diarios','dias_trabalho','eap_modelos',
    'activities','app_settings','mapa_chuvas'
  ]
  LOOP
    -- Só mexe se a tabela realmente existir (evita quebrar tudo se a lista
    -- ficar desatualizada no futuro).
    IF to_regclass('public.' || tabela) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'Restringe a organizacao piloto', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO public USING (public.user_organizacao() = public.organizacao_piloto_id());',
      'Restringe a organizacao piloto', tabela
    );
  END LOOP;
END $$;

-- Reforço extra pro role anônimo (que hoje tem GRANT em algumas dessas
-- tabelas): revogar de vez, já que anon não tem organização nenhuma.
-- REVOKE ALL ON public.scenarios, public.equipes, public.atividades, public.paradas, public.mapa_chuvas FROM anon;

-- ============ 11. MANUAL: marcar você como dono (rode com cuidado, depois) ============
-- SELECT id, email FROM public.user_profiles WHERE email = 'ismaelpereirafranca8@gmail.com';
-- UPDATE public.user_profiles SET is_super_admin = true WHERE email = 'ismaelpereirafranca8@gmail.com';
