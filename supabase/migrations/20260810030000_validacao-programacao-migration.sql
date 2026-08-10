-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- FASE 3 da dupla validação: a programação semanal. É a mais pesada das três
-- porque, diferente do concreto e do apontamento, aqui NÃO EXISTIA o vínculo
-- entre o trabalho e a pessoa que responde por ele.
--
-- O problema: activities.foreman guarda o engenheiro como TEXTO LIVRE, e
-- programacao_engenheiros_area.engenheiro também. Não há nada ligando essas
-- strings ao usuário autenticado — e user_profiles nem tem coluna de nome pra
-- tentar um casamento automático. Por isso o de-para (secão 1) é MANUAL: uma
-- tela lista os nomes distintos e alguém associa cada um a um usuário. Enquanto
-- um nome não for mapeado, ele simplesmente não entra em validação; nada quebra.
--
-- A unidade validável é (semana, engenheiro), não a atividade individual nem a
-- semana inteira: atividade a atividade seriam dezenas de conferências por
-- semana, e a semana inteira perderia o "cada engenheiro confirma a DELE".
-- Cada linha de programacao_submissoes é um desses pares.
--
-- weeks.status ('rascunho'/'consolidado') e lockWeekWithBaseline continuam
-- existindo como o fechamento global da semana — o que muda é que agora dá pra
-- checar, antes de bloquear, se todo mundo já confirmou.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. DE-PARA: nome do engenheiro -> usuário ============

CREATE TABLE IF NOT EXISTS public.programacao_engenheiros_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  -- Exatamente como aparece em activities.foreman.
  foreman_nome text NOT NULL,
  usuario_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, foreman_nome)
);

CREATE INDEX IF NOT EXISTS prog_eng_usuarios_usuario_idx
  ON public.programacao_engenheiros_usuarios (usuario_id);

ALTER TABLE public.programacao_engenheiros_usuarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programacao_engenheiros_usuarios TO authenticated;

DROP POLICY IF EXISTS "Leitura prog_eng_usuarios da propria empresa" ON public.programacao_engenheiros_usuarios;
CREATE POLICY "Leitura prog_eng_usuarios da propria empresa" ON public.programacao_engenheiros_usuarios
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Edicao gerencia prog_eng_usuarios" ON public.programacao_engenheiros_usuarios;
CREATE POLICY "Edicao gerencia prog_eng_usuarios" ON public.programacao_engenheiros_usuarios
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('engenharia') = 'edicao')
  )
  WITH CHECK (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('engenharia') = 'edicao')
  );

-- ============ 2. SUBMISSÕES: a unidade validável ============

CREATE TABLE IF NOT EXISTS public.programacao_submissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  week_id uuid NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  engenheiro_usuario_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  -- Cópia do nome usado nas atividades: o de-para pode mudar depois, e a
  -- submissão precisa continuar dizendo a qual conjunto ela se referia.
  foreman_nome text NOT NULL,
  validacao_status text NOT NULL DEFAULT 'pendente',
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_id, engenheiro_usuario_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programacao_submissoes_validacao_status_check') THEN
    ALTER TABLE public.programacao_submissoes
      ADD CONSTRAINT programacao_submissoes_validacao_status_check
      CHECK (validacao_status IN ('pendente', 'parcial', 'aprovado', 'rejeitado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS prog_submissoes_week_idx ON public.programacao_submissoes (week_id);
CREATE INDEX IF NOT EXISTS prog_submissoes_usuario_idx ON public.programacao_submissoes (engenheiro_usuario_id);

ALTER TABLE public.programacao_submissoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.programacao_submissoes TO authenticated;

DROP POLICY IF EXISTS "Leitura prog_submissoes da propria empresa" ON public.programacao_submissoes;
CREATE POLICY "Leitura prog_submissoes da propria empresa" ON public.programacao_submissoes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

-- Criar/remover submissão é manutenção da lista, não decisão de validação:
-- qualquer um da empresa que enxergue o módulo pode disparar a sincronização.
DROP POLICY IF EXISTS "Empresa sincroniza prog_submissoes" ON public.programacao_submissoes;
CREATE POLICY "Empresa sincroniza prog_submissoes" ON public.programacao_submissoes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia'))
  );

DROP POLICY IF EXISTS "Edicao remove prog_submissoes" ON public.programacao_submissoes;
CREATE POLICY "Edicao remove prog_submissoes" ON public.programacao_submissoes
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('engenharia') = 'edicao')
  );

-- ============ 3. ETAPA "SÓ O DONO CONFIRMA" ============
-- Sem isso, qualquer engenheiro cadastrado como responsável pela etapa
-- 'engenheiro' poderia confirmar a programação de OUTRO engenheiro — o oposto
-- de "cada engenheiro confirma a dele". A flag é genérica e vale pra qualquer
-- entidade futura que tenha dono.

ALTER TABLE public.validacao_etapas
  ADD COLUMN IF NOT EXISTS escopo_proprio boolean NOT NULL DEFAULT false;

UPDATE public.validacao_etapas
   SET escopo_proprio = true
 WHERE entidade = 'programacao' AND chave = 'engenheiro' AND escopo_proprio = false;

-- ============ 4. pode_validar: ramo da programação ============
-- Substitui a versão de 20260810000000 acrescentando 'programacao' e a regra
-- de escopo_proprio. Concreto e apontamento seguem idênticos.

CREATE OR REPLACE FUNCTION public.pode_validar(
  p_entidade text,
  p_etapa_chave text,
  p_registro_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_etapa public.validacao_etapas%ROWTYPE;
BEGIN
  SELECT * INTO v_etapa
  FROM public.validacao_etapas
  WHERE organizacao_id = public.user_organizacao()
    AND entidade = p_entidade
    AND chave = p_etapa_chave
    AND ativo;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Etapa do dono: só quem é o engenheiro da submissão confirma, e não precisa
  -- estar em validacao_responsaveis pra isso — ser o dono já basta.
  IF v_etapa.escopo_proprio THEN
    IF p_entidade = 'programacao' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.programacao_submissoes s
        WHERE s.id = p_registro_id AND s.engenheiro_usuario_id = auth.uid()
      );
    END IF;
    RETURN false;
  END IF;

  -- Etapa sem recorte de área: basta estar na lista de responsáveis.
  IF NOT v_etapa.escopo_area THEN
    RETURN EXISTS (
      SELECT 1 FROM public.validacao_responsaveis r
      WHERE r.etapa_id = v_etapa.id AND r.usuario_id = auth.uid()
    );
  END IF;

  -- Com recorte de área, quem tem área nula responde por todas.
  IF EXISTS (
    SELECT 1 FROM public.validacao_responsaveis r
    WHERE r.etapa_id = v_etapa.id AND r.usuario_id = auth.uid()
      AND r.area_id IS NULL AND r.area_concreto_id IS NULL
  ) THEN
    RETURN true;
  END IF;

  IF p_entidade = 'apontamento' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.apontamentos_diarios a
      JOIN public.validacao_responsaveis r ON r.area_id = a.area_id
      WHERE a.id = p_registro_id
        AND r.etapa_id = v_etapa.id
        AND r.usuario_id = auth.uid()
    );
  END IF;

  -- Uma carga pode ser aplicada em várias áreas (destinos_carga tem N linhas
  -- por carga): responder por qualquer uma delas basta pra poder conferir.
  IF p_entidade = 'carga_concreto' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.destinos_carga d
      JOIN public.validacao_responsaveis r ON r.area_concreto_id = d.area_concreto_id
      WHERE d.carga_id = p_registro_id
        AND r.etapa_id = v_etapa.id
        AND r.usuario_id = auth.uid()
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pode_validar(text, text, uuid) TO authenticated;

-- ============ 5. PROPAGAÇÃO: ramo da programação ============

CREATE OR REPLACE FUNCTION public.propagar_validacao_confirmacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entidade text := COALESCE(NEW.entidade, OLD.entidade);
  v_registro uuid := COALESCE(NEW.registro_id, OLD.registro_id);
  v_organizacao uuid := COALESCE(NEW.organizacao_id, OLD.organizacao_id);
  v_status text;
BEGIN
  IF v_entidade = 'carga_concreto' THEN
    SELECT public.validacao_status(c.organizacao_id, v_entidade, c.id)
      INTO v_status
      FROM public.cargas_concreto c
     WHERE c.id = v_registro;

    IF v_status IS NOT NULL THEN
      UPDATE public.cargas_concreto
         SET validacao_status = v_status,
             validado = (v_status = 'aprovado'),
             validado_em = CASE WHEN v_status = 'aprovado' THEN now() ELSE NULL END
       WHERE id = v_registro;
    END IF;

  ELSIF v_entidade = 'apontamento' THEN
    v_status := public.validacao_status(v_organizacao, v_entidade, v_registro);

    UPDATE public.apontamentos_diarios
       SET validacao_status = v_status,
           validado = (v_status = 'aprovado'),
           validado_em = CASE WHEN v_status = 'aprovado' THEN now() ELSE NULL END
     WHERE id = v_registro;

  ELSIF v_entidade = 'programacao' THEN
    SELECT public.validacao_status(s.organizacao_id, v_entidade, s.id)
      INTO v_status
      FROM public.programacao_submissoes s
     WHERE s.id = v_registro;

    IF v_status IS NOT NULL THEN
      UPDATE public.programacao_submissoes
         SET validacao_status = v_status
       WHERE id = v_registro;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============ 6. LIMPEZA DE ÓRFÃS ============

CREATE OR REPLACE FUNCTION public.limpar_validacao_submissao_excluida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.validacao_confirmacoes
   WHERE entidade = 'programacao' AND registro_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpar_validacao_submissao ON public.programacao_submissoes;
CREATE TRIGGER trg_limpar_validacao_submissao
  AFTER DELETE ON public.programacao_submissoes
  FOR EACH ROW EXECUTE FUNCTION public.limpar_validacao_submissao_excluida();

-- ============ 7. SINCRONIZAR SUBMISSÕES DE UMA SEMANA ============
-- Cria uma submissão por engenheiro MAPEADO que tenha atividade na semana.
-- Chamada pela tela ao abrir a semana — evita exigir que cada engenheiro
-- clique em "enviar para validação" antes de qualquer coisa existir.
--
-- Não remove submissões de engenheiro que saiu da semana: apagar destruiria as
-- confirmações já feitas. Quem quiser limpar usa o DELETE (papel Edição).

CREATE OR REPLACE FUNCTION public.sincronizar_submissoes_semana(p_week_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizacao uuid;
  v_criadas integer;
BEGIN
  SELECT organizacao_id INTO v_organizacao FROM public.weeks WHERE id = p_week_id;
  IF v_organizacao IS NULL OR v_organizacao <> public.user_organizacao() THEN
    RETURN 0;
  END IF;

  WITH nomes AS (
    SELECT DISTINCT a.foreman
      FROM public.activities a
     WHERE a.week_id = p_week_id
       AND a.foreman IS NOT NULL
       AND trim(a.foreman) <> ''
       AND COALESCE(a.inativa, false) = false
  ),
  inseridas AS (
    INSERT INTO public.programacao_submissoes (organizacao_id, week_id, engenheiro_usuario_id, foreman_nome)
    SELECT v_organizacao, p_week_id, m.usuario_id, n.foreman
      FROM nomes n
      JOIN public.programacao_engenheiros_usuarios m
        ON m.foreman_nome = n.foreman AND m.organizacao_id = v_organizacao
    ON CONFLICT (week_id, engenheiro_usuario_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_criadas FROM inseridas;

  RETURN v_criadas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_submissoes_semana(uuid) TO authenticated;

-- ============ 8. SEMANA PRONTA PRA BLOQUEIO? ============
-- Não bloqueia nada por si — a tela usa isso pra avisar antes de consolidar.
-- Semana sem nenhuma submissão devolve true: quem ainda não usa validação de
-- programação não pode ficar impedido de fechar a semana.

CREATE OR REPLACE FUNCTION public.programacao_pronta_para_bloqueio(p_week_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.programacao_submissoes
     WHERE week_id = p_week_id AND validacao_status <> 'aprovado'
  );
$$;

GRANT EXECUTE ON FUNCTION public.programacao_pronta_para_bloqueio(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
