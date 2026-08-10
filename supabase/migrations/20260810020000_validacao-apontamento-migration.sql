-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- FASE 2 da dupla validação: liga o apontamento de funcionários à fundação
-- (20260810000000) seguindo o mesmo desenho já usado no concreto
-- (20260810010000).
--
-- No apontamento as duas perspectivas são: RH confere a QUANTIDADE (pedreiro,
-- servente, carpinteiro, outros) e Planejamento confere os LOCAIS (setor,
-- área, subárea, atividade).
--
-- Duas particularidades desta tabela, que explicam as escolhas abaixo:
--
-- 1. apontamentos_diarios NÃO tem organizacao_id (nem projeto_id) — é anterior
--    ao multi-tenant, e o isolamento dela vem de uma policy RESTRICTIVE
--    amarrada à organização piloto (20260803001300). Como o trigger precisa de
--    uma organização pra saber quais etapas contar, ele usa a organização de
--    QUEM CONFIRMOU (validacao_confirmacoes.organizacao_id), não a do registro.
--
-- 2. A tela de validação antiga marcava a data inteira de uma vez
--    (`.eq("data", data)`) e o `editarMut` dela descartava validado/validado_em
--    do payload em vez de zerá-los — ou seja, editar um apontamento já validado
--    NÃO o desvalidava. O trigger de invalidação abaixo fecha esse buraco no
--    banco, independentemente do que o client faça.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. COLUNA DE ESTADO ============

ALTER TABLE public.apontamentos_diarios
  ADD COLUMN IF NOT EXISTS validacao_status text NOT NULL DEFAULT 'pendente';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apontamentos_diarios_validacao_status_check') THEN
    ALTER TABLE public.apontamentos_diarios
      ADD CONSTRAINT apontamentos_diarios_validacao_status_check
      CHECK (validacao_status IN ('pendente', 'parcial', 'aprovado', 'rejeitado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS apontamentos_diarios_validacao_status_idx
  ON public.apontamentos_diarios (data, validacao_status);

-- ============ 2. PROPAGAÇÃO ============
-- Substitui a versão de 20260810010000 acrescentando o ramo do apontamento.
-- A da carga de concreto continua idêntica.

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
    -- Sem FROM se a carga já foi excluída: v_status fica NULL e o UPDATE é
    -- pulado, em vez de estourar.
    SELECT public.validacao_status(c.organizacao_id, v_entidade, c.id)
      INTO v_status
      FROM public.cargas_concreto c
     WHERE c.id = v_registro;

    IF v_status IS NOT NULL THEN
      UPDATE public.cargas_concreto
         SET validacao_status = v_status,
             -- `validado` continua sendo a fonte que a Consulta e o export de
             -- Excel já leem — mantida em sincronia pra nada quebrar.
             validado = (v_status = 'aprovado'),
             validado_em = CASE WHEN v_status = 'aprovado' THEN now() ELSE NULL END
       WHERE id = v_registro;
    END IF;

  ELSIF v_entidade = 'apontamento' THEN
    -- Organização de quem confirmou: a tabela não tem a coluna (ver cabeçalho).
    v_status := public.validacao_status(v_organizacao, v_entidade, v_registro);

    UPDATE public.apontamentos_diarios
       SET validacao_status = v_status,
           -- A EAP (cronograma_itens) e a tela de Evolução leem `validado`.
           validado = (v_status = 'aprovado'),
           validado_em = CASE WHEN v_status = 'aprovado' THEN now() ELSE NULL END
     WHERE id = v_registro;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============ 3. INVALIDAÇÃO ============
-- Campos materiais = o que o RH e o Planejamento conferem. Mexer em qualquer
-- um deles derruba as duas conferências: se a quantidade mudou, a conferência
-- do RH não vale mais; se a atividade mudou, a do Planejamento não vale.

CREATE OR REPLACE FUNCTION public.invalidar_validacao_apontamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.validacao_confirmacoes
   WHERE entidade = 'apontamento' AND registro_id = NEW.id;
  RETURN NEW;
END;
$$;

-- A cláusula WHEN evita recursão: o UPDATE da propagação mexe só em
-- validacao_status/validado/validado_em, que não estão nesta lista.
DROP TRIGGER IF EXISTS trg_invalidar_validacao_apontamento ON public.apontamentos_diarios;
CREATE TRIGGER trg_invalidar_validacao_apontamento
  AFTER UPDATE ON public.apontamentos_diarios
  FOR EACH ROW
  WHEN (
    OLD.data IS DISTINCT FROM NEW.data
    OR OLD.pedreiro IS DISTINCT FROM NEW.pedreiro
    OR OLD.servente IS DISTINCT FROM NEW.servente
    OR OLD.carpinteiro IS DISTINCT FROM NEW.carpinteiro
    OR OLD.qntdd_funcao IS DISTINCT FROM NEW.qntdd_funcao
    OR OLD.total IS DISTINCT FROM NEW.total
    OR OLD.empresa_id IS DISTINCT FROM NEW.empresa_id
    OR OLD.lideranca_id IS DISTINCT FROM NEW.lideranca_id
    OR OLD.setor_id IS DISTINCT FROM NEW.setor_id
    OR OLD.area_id IS DISTINCT FROM NEW.area_id
    OR OLD.subarea_id IS DISTINCT FROM NEW.subarea_id
    OR OLD.atividade_id IS DISTINCT FROM NEW.atividade_id
  )
  EXECUTE FUNCTION public.invalidar_validacao_apontamento();

-- ============ 4. LIMPEZA DE ÓRFÃS ============

CREATE OR REPLACE FUNCTION public.limpar_validacao_apontamento_excluido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.validacao_confirmacoes
   WHERE entidade = 'apontamento' AND registro_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpar_validacao_apontamento ON public.apontamentos_diarios;
CREATE TRIGGER trg_limpar_validacao_apontamento
  AFTER DELETE ON public.apontamentos_diarios
  FOR EACH ROW EXECUTE FUNCTION public.limpar_validacao_apontamento_excluido();

-- ============ 5. BACKFILL ============
-- O que a tela antiga já validou em lote entra como aprovado — reabrir meses
-- de apontamento pra reconferência manual não é o objetivo.

UPDATE public.apontamentos_diarios
   SET validacao_status = 'aprovado'
 WHERE validado = true AND validacao_status = 'pendente';

NOTIFY pgrst, 'reload schema';
