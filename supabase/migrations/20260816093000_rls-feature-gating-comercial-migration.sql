-- ============================================================
-- MIGRAÇÃO: Enforcement de RLS para os módulos avulsos GESTAO_VISTA e
-- MAPA_SETORES (Fase D)
-- Execute este SQL no Supabase SQL Editor do ProjectObra, APÓS
-- views-uso-faturavel-modulos-ativos-migration.sql
-- ============================================================
-- Gestão à Vista (mapa_plantas/mapa_grupos/mapa_grades/mapa_status/
-- mapa_celulas) e Mapa de Setores (mapa_setores_plantas/
-- mapa_setores_marcadores/mapa_setores_vinculos) já têm RLS pelo módulo de
-- RLS "engenharia" (grosso). Esta migração ADICIONA uma camada RESTRICTIVE
-- por cima, sem tocar nas policies PERMISSIVE existentes, exigindo também
-- que a organização tenha o módulo comercial correspondente — o mesmo
-- padrão RESTRICTIVE já usado em modulos-visiveis-migration.sql.
--
-- Como o bypass de organização piloto está dentro de
-- organizacao_pode_ler_modulo_comercial / organizacao_pode_escrever_modulo_
-- comercial (Fase C), nenhuma organização com is_piloto = true é afetada,
-- mesmo que ainda não tenha nenhuma linha em organizacao_planos /
-- organizacao_modulos_avulsos.
--
-- Idempotente e defensivo: pula qualquer tabela que não exista no banco de
-- destino (nem toda migration do repositório necessariamente já foi
-- aplicada nesse ambiente).
-- ============================================================

DO $$
DECLARE
  tabela text;
  codigo_modulo text;
  grupo jsonb := '[
    {"codigo": "GESTAO_VISTA", "tabelas": ["mapa_plantas", "mapa_grupos", "mapa_grades", "mapa_status", "mapa_celulas"]},
    {"codigo": "MAPA_SETORES", "tabelas": ["mapa_setores_plantas", "mapa_setores_marcadores", "mapa_setores_vinculos"]}
  ]';
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(grupo)
  LOOP
    codigo_modulo := item->>'codigo';

    FOR tabela IN SELECT jsonb_array_elements_text(item->'tabelas')
    LOOP
      IF to_regclass('public.' || tabela) IS NULL THEN
        CONTINUE;
      END IF;

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'Assinatura restringe leitura ' || codigo_modulo, tabela);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.organizacao_pode_ler_modulo_comercial(%L));',
        'Assinatura restringe leitura ' || codigo_modulo, tabela, codigo_modulo
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'Assinatura restringe insercao ' || codigo_modulo, tabela);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.organizacao_pode_escrever_modulo_comercial(%L));',
        'Assinatura restringe insercao ' || codigo_modulo, tabela, codigo_modulo
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'Assinatura restringe atualizacao ' || codigo_modulo, tabela);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.organizacao_pode_escrever_modulo_comercial(%L)) WITH CHECK (public.organizacao_pode_escrever_modulo_comercial(%L));',
        'Assinatura restringe atualizacao ' || codigo_modulo, tabela, codigo_modulo, codigo_modulo
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'Assinatura restringe exclusao ' || codigo_modulo, tabela);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.organizacao_pode_escrever_modulo_comercial(%L));',
        'Assinatura restringe exclusao ' || codigo_modulo, tabela, codigo_modulo
      );
    END LOOP;
  END LOOP;
END $$;
