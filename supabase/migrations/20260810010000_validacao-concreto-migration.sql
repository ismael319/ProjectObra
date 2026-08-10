-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- FASE 1 da dupla validação: liga o fluxo das cargas de concreto à fundação
-- criada em 20260810000000_validacao-fundacao-migration.sql.
--
-- cargas_concreto já tinha `validado`/`validado_em` desde
-- 20260730135216_cargas_concreto.sql, mas as colunas estavam ÓRFÃS: nenhuma
-- tela do app gravava true — só o importador de planilha
-- (src/pages/qualidade/concreto/lib/importer-db.ts). Esta migration mantém as
-- duas colunas funcionando (a Consulta e o export de Excel leem `validado`) e
-- acrescenta `validacao_status`, que é o estado real de 4 valores.
--
-- Quem escreve essas colunas passa a ser um TRIGGER, nunca o frontend: o app
-- só insere em validacao_confirmacoes, e a propagação acontece no banco com
-- SECURITY DEFINER. É isso que permite alguém confirmar sem ter papel 'edicao'
-- em qualidade — a RLS de UPDATE de cargas_concreto continua fechada.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. COLUNA DE ESTADO ============

ALTER TABLE public.cargas_concreto
  ADD COLUMN IF NOT EXISTS validacao_status text NOT NULL DEFAULT 'pendente';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cargas_concreto_validacao_status_check') THEN
    ALTER TABLE public.cargas_concreto
      ADD CONSTRAINT cargas_concreto_validacao_status_check
      CHECK (validacao_status IN ('pendente', 'parcial', 'aprovado', 'rejeitado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cargas_concreto_validacao_status_idx
  ON public.cargas_concreto (organizacao_id, validacao_status);

-- ============ 2. PROPAGAÇÃO: confirmação -> status do registro ============
-- Uma função só pras três entidades; as fases seguintes acrescentam os IFs que
-- faltam. SECURITY DEFINER de propósito: é o que deixa quem confirma gravar o
-- status sem ter permissão de UPDATE na tabela de negócio.

CREATE OR REPLACE FUNCTION public.propagar_validacao_confirmacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entidade text := COALESCE(NEW.entidade, OLD.entidade);
  v_registro uuid := COALESCE(NEW.registro_id, OLD.registro_id);
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
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_propagar_validacao ON public.validacao_confirmacoes;
CREATE TRIGGER trg_propagar_validacao
  AFTER INSERT OR UPDATE OR DELETE ON public.validacao_confirmacoes
  FOR EACH ROW EXECUTE FUNCTION public.propagar_validacao_confirmacao();

-- ============ 3. INVALIDAÇÃO: editar o registro derruba as confirmações ============
-- Sem isso, alguém confirmaria uma carga de 8 m³ e o lançador trocaria pra 12
-- m³ depois, com a carga seguindo "aprovada". O mesmo buraco existe hoje no
-- apontamento (Validacao.tsx descarta `validado` do payload de edição em vez
-- de zerá-lo) — resolver no banco vale pros dois, e independe do client.

CREATE OR REPLACE FUNCTION public.invalidar_validacao_carga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.validacao_confirmacoes
   WHERE entidade = 'carga_concreto' AND registro_id = NEW.id;
  RETURN NEW;
END;
$$;

-- A cláusula WHEN é o que evita recursão: o UPDATE que a propagação faz mexe
-- só em validacao_status/validado/validado_em, que não estão nesta lista.
DROP TRIGGER IF EXISTS trg_invalidar_validacao_carga ON public.cargas_concreto;
CREATE TRIGGER trg_invalidar_validacao_carga
  AFTER UPDATE ON public.cargas_concreto
  FOR EACH ROW
  WHEN (
    OLD.data IS DISTINCT FROM NEW.data
    OR OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
    OR OLD.traco_id IS DISTINCT FROM NEW.traco_id
    OR OLD.quantidade_m3 IS DISTINCT FROM NEW.quantidade_m3
    OR OLD.peso_balanca_kg IS DISTINCT FROM NEW.peso_balanca_kg
    OR OLD.preco_unitario IS DISTINCT FROM NEW.preco_unitario
    OR OLD.nota_fiscal IS DISTINCT FROM NEW.nota_fiscal
    OR OLD.tipo_origem IS DISTINCT FROM NEW.tipo_origem
    OR OLD.numero_carga IS DISTINCT FROM NEW.numero_carga
    OR OLD.cod_laboratorio IS DISTINCT FROM NEW.cod_laboratorio
    OR OLD.dispensa_ensaio IS DISTINCT FROM NEW.dispensa_ensaio
  )
  EXECUTE FUNCTION public.invalidar_validacao_carga();

-- Trocar o destino muda a ÁREA da carga — e área é justamente o que define
-- quem pode conferir. Confirmação anterior não vale mais.
CREATE OR REPLACE FUNCTION public.invalidar_validacao_destino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.validacao_confirmacoes
   WHERE entidade = 'carga_concreto' AND registro_id = COALESCE(NEW.carga_id, OLD.carga_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidar_validacao_destino ON public.destinos_carga;
CREATE TRIGGER trg_invalidar_validacao_destino
  AFTER INSERT OR UPDATE OR DELETE ON public.destinos_carga
  FOR EACH ROW EXECUTE FUNCTION public.invalidar_validacao_destino();

-- ============ 4. LIMPEZA DE ÓRFÃS ============
-- validacao_confirmacoes é polimórfica e não tem FK: sem isso, excluir uma
-- carga deixaria as confirmações dela para sempre no banco.

CREATE OR REPLACE FUNCTION public.limpar_validacao_carga_excluida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.validacao_confirmacoes
   WHERE entidade = 'carga_concreto' AND registro_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpar_validacao_carga ON public.cargas_concreto;
CREATE TRIGGER trg_limpar_validacao_carga
  AFTER DELETE ON public.cargas_concreto
  FOR EACH ROW EXECUTE FUNCTION public.limpar_validacao_carga_excluida();

-- ============ 5. BACKFILL ============
-- As cargas que o importador de planilha já marcou como validadas entram como
-- aprovadas — reabrir histórico pra conferência manual não é o objetivo.

UPDATE public.cargas_concreto
   SET validacao_status = 'aprovado'
 WHERE validado = true AND validacao_status = 'pendente';

NOTIFY pgrst, 'reload schema';
