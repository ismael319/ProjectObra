-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- FASE 4 da dupla validação: a central de pendências.
--
-- O problema que esta migration resolve: validacao_confirmacoes guarda o que JÁ
-- foi decidido, nunca o que FALTA decidir. Descobrir "o que espera este
-- usuário" exige cruzar as etapas em que ele responde com os registros ainda
-- abertos de TRÊS tabelas diferentes (cargas_concreto, apontamentos_diarios,
-- programacao_submissoes) — e ainda descontar o que ele mesmo já decidiu.
--
-- Fazer isso no frontend seriam três consultas grandes + o cruzamento em
-- memória, repetido a cada carregamento do sino. Uma função no banco resolve
-- numa chamada e reaproveita public.pode_validar(), que já concentra as regras
-- de responsável, área e dono.
--
-- Devolve CONTAGEM por etapa, não a lista de registros: a central de pendências
-- é um painel que direciona pras telas de validação já existentes (cada uma tem
-- o contexto que a decisão precisa — destinos da carga, quantidades do
-- apontamento). Duplicar a ação numa quarta tela só criaria dois lugares pra
-- manter.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. PENDÊNCIAS DO USUÁRIO LOGADO ============
--
-- Observação sobre o apontamento: apontamentos_diarios não tem organizacao_id
-- (ver 20260810020000), então a contagem dele não é filtrada por empresa — a
-- tabela é efetivamente da organização piloto. Concreto e programação são
-- filtrados normalmente.

CREATE OR REPLACE FUNCTION public.minhas_validacoes_pendentes()
RETURNS TABLE (
  entidade text,
  etapa_chave text,
  etapa_nome text,
  total bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH etapas AS (
    SELECT e.id, e.entidade, e.chave, e.nome, e.ordem
      FROM public.validacao_etapas e
     WHERE e.organizacao_id = public.user_organizacao()
       AND e.ativo
  ),
  -- Poda barata antes do trabalho pesado: só sobram as etapas em que o usuário
  -- tem alguma chance de decidir (é responsável, ou a etapa é do dono).
  minhas AS (
    SELECT e.*
      FROM etapas e
     WHERE EXISTS (
             SELECT 1 FROM public.validacao_responsaveis r
              WHERE r.etapa_id = e.id AND r.usuario_id = auth.uid()
           )
        OR EXISTS (
             SELECT 1 FROM public.validacao_etapas ve
              WHERE ve.id = e.id AND ve.escopo_proprio
           )
  ),
  concreto AS (
    SELECT m.entidade, m.chave, m.nome, m.ordem, count(*) AS total
      FROM minhas m
      JOIN public.cargas_concreto c
        ON c.organizacao_id = public.user_organizacao()
     WHERE m.entidade = 'carga_concreto'
       AND c.validacao_status IN ('pendente', 'parcial')
       AND NOT EXISTS (
             SELECT 1 FROM public.validacao_confirmacoes vc
              WHERE vc.entidade = 'carga_concreto'
                AND vc.registro_id = c.id
                AND vc.etapa_chave = m.chave
           )
       AND public.pode_validar('carga_concreto', m.chave, c.id)
     GROUP BY m.entidade, m.chave, m.nome, m.ordem
  ),
  apontamento AS (
    SELECT m.entidade, m.chave, m.nome, m.ordem, count(*) AS total
      FROM minhas m
      JOIN public.apontamentos_diarios a ON true
     WHERE m.entidade = 'apontamento'
       AND a.validacao_status IN ('pendente', 'parcial')
       AND NOT EXISTS (
             SELECT 1 FROM public.validacao_confirmacoes vc
              WHERE vc.entidade = 'apontamento'
                AND vc.registro_id = a.id
                AND vc.etapa_chave = m.chave
           )
       AND public.pode_validar('apontamento', m.chave, a.id)
     GROUP BY m.entidade, m.chave, m.nome, m.ordem
  ),
  programacao AS (
    SELECT m.entidade, m.chave, m.nome, m.ordem, count(*) AS total
      FROM minhas m
      JOIN public.programacao_submissoes s
        ON s.organizacao_id = public.user_organizacao()
     WHERE m.entidade = 'programacao'
       AND s.validacao_status IN ('pendente', 'parcial')
       AND NOT EXISTS (
             SELECT 1 FROM public.validacao_confirmacoes vc
              WHERE vc.entidade = 'programacao'
                AND vc.registro_id = s.id
                AND vc.etapa_chave = m.chave
           )
       AND public.pode_validar('programacao', m.chave, s.id)
     GROUP BY m.entidade, m.chave, m.nome, m.ordem
  ),
  tudo AS (
    SELECT * FROM concreto
    UNION ALL SELECT * FROM apontamento
    UNION ALL SELECT * FROM programacao
  )
  SELECT entidade, chave, nome, total
    FROM tudo
   WHERE total > 0
   ORDER BY entidade, ordem;
$$;

GRANT EXECUTE ON FUNCTION public.minhas_validacoes_pendentes() TO authenticated;

-- ============ 2. CONTAGEM TOTAL (pro sino do cabeçalho) ============
-- Função própria em vez de somar no client: o sino carrega em toda tela, e
-- devolver um número só evita trafegar a lista inteira a cada navegação.

CREATE OR REPLACE FUNCTION public.minhas_validacoes_pendentes_total()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(sum(total), 0) FROM public.minhas_validacoes_pendentes();
$$;

GRANT EXECUTE ON FUNCTION public.minhas_validacoes_pendentes_total() TO authenticated;

NOTIFY pgrst, 'reload schema';
