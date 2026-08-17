-- ============================================================
-- MIGRAÇÃO: Widget "Aderência por Engenheiro" + correção da descrição de
-- "Apontamento de Mão de Obra" no catálogo (Fase B)
-- Execute este SQL no Supabase SQL Editor do ProjectObra, APÓS
-- dashboard-widgets-catalogo-projeto-migration.sql
-- ============================================================
-- ADERENCIA_ENGENHEIRO reaproveita o mesmo cálculo (computeSegment sobre o
-- campo "foreman") e o mesmo componente (PainelAderencia) já usados na tela
-- de Programação Semanal — client-side, fonte_view continua NULL.
--
-- WORKFORCE (seed original: "Resumo do Efetivo") lia um estado do app que
-- nenhuma tela populava (laborEntries) e sempre mostrava zero — o componente
-- foi trocado pra ler de verdade de apontamentos_diarios; esse UPDATE só
-- corrige nome/descrição do catálogo pra bater com o que o widget mostra
-- agora.

INSERT INTO public.widget_tipos (codigo, nome, descricao, categoria, modulo_origem, tipo_visualizacao, fonte_view, status, ordem_exibicao) VALUES
  ('ADERENCIA_ENGENHEIRO', 'Aderência por Engenheiro', 'PPC/aderência da semana atual, agrupado por engenheiro responsável — mesmo cálculo já usado na Programação Semanal.', 'engenharia', 'engenharia', 'grafico_barra', NULL, 'ativo', 55)
ON CONFLICT (codigo) DO NOTHING;

UPDATE public.widget_tipos
SET nome = 'Apontamento de Mão de Obra',
    descricao = 'Total de pessoas e detalhamento por função (pedreiro, servente, carpinteiro...) do dia mais recente com apontamento lançado neste projeto.'
WHERE codigo = 'WORKFORCE';

NOTIFY pgrst, 'reload schema';
