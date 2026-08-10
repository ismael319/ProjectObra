-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- REFINAMENTO da dupla validação: o caminho de volta da rejeição.
--
-- As fases 1 a 4 construíram o caminho de ida (lançar -> conferir -> aprovar) e
-- deixaram o de volta pela metade. Hoje, quando alguém rejeita um lançamento:
--
--   - quem lançou não fica sabendo — não há aviso, tela ou contador;
--   - o motivo escrito na rejeição só aparece no tooltip do badge, na tela de
--     QUEM REJEITOU (justamente quem já sabe o motivo);
--   - o registro fica em 'rejeitado' até alguém por acaso abrir e editar, o que
--     apaga as confirmações e devolve pra 'pendente'.
--
-- Ou seja: o lançamento morre em silêncio. Esta migration cria a consulta que
-- responde "o que EU lancei e voltou pra correção", com o motivo e quem
-- rejeitou.
--
-- A identificação de cada registro é montada aqui, no banco, porque cada fluxo
-- se identifica de um jeito diferente (código de rastreabilidade, atividade do
-- dia, semana do engenheiro) e a tela precisa de uma lista única.
--
-- Idempotente — seguro rodar mais de uma vez.

CREATE OR REPLACE FUNCTION public.meus_lancamentos_rejeitados()
RETURNS TABLE (
  entidade text,
  registro_id uuid,
  identificacao text,
  data_referencia date,
  etapa_nome text,
  motivo text,
  rejeitado_por text,
  rejeitado_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH rejeicoes AS (
    SELECT vc.entidade, vc.registro_id, vc.etapa_chave, vc.observacao,
           vc.criado_em, vc.usuario_id, vc.organizacao_id
      FROM public.validacao_confirmacoes vc
     WHERE vc.decisao = 'rejeitado'
  ),
  -- Nome da etapa vem por join (a confirmação guarda só a chave) e o e-mail de
  -- quem rejeitou por outro: prestar contas exige saber quem pediu a correção.
  detalhe AS (
    SELECT r.*, e.nome AS etapa_nome, up.email AS autor_email
      FROM rejeicoes r
      LEFT JOIN public.validacao_etapas e
             ON e.organizacao_id = r.organizacao_id
            AND e.entidade = r.entidade
            AND e.chave = r.etapa_chave
      LEFT JOIN public.user_profiles up ON up.id = r.usuario_id
  ),
  concreto AS (
    SELECT d.entidade, d.registro_id,
           COALESCE(c.codigo_rastreabilidade, 'Carga sem código') AS identificacao,
           c.data AS data_referencia,
           d.etapa_nome, d.observacao, d.autor_email, d.criado_em
      FROM detalhe d
      JOIN public.cargas_concreto c ON c.id = d.registro_id
     WHERE d.entidade = 'carga_concreto'
       AND c.criado_por = auth.uid()
       AND c.validacao_status = 'rejeitado'
  ),
  apontamento AS (
    SELECT d.entidade, d.registro_id,
           a.atividade_nome || ' — ' || a.setor_nome ||
             COALESCE(' / ' || a.area_nome, '') AS identificacao,
           a.data AS data_referencia,
           d.etapa_nome, d.observacao, d.autor_email, d.criado_em
      FROM detalhe d
      JOIN public.apontamentos_diarios a ON a.id = d.registro_id
     WHERE d.entidade = 'apontamento'
       AND a.criado_por = auth.uid()
       AND a.validacao_status = 'rejeitado'
  ),
  programacao AS (
    SELECT d.entidade, d.registro_id,
           'Semana ' || w.iso_week || '/' || w.iso_year AS identificacao,
           w.start_date AS data_referencia,
           d.etapa_nome, d.observacao, d.autor_email, d.criado_em
      FROM detalhe d
      JOIN public.programacao_submissoes s ON s.id = d.registro_id
      JOIN public.weeks w ON w.id = s.week_id
     WHERE d.entidade = 'programacao'
       AND s.engenheiro_usuario_id = auth.uid()
       AND s.validacao_status = 'rejeitado'
  ),
  tudo AS (
    SELECT * FROM concreto
    UNION ALL SELECT * FROM apontamento
    UNION ALL SELECT * FROM programacao
  )
  SELECT entidade, registro_id, identificacao, data_referencia,
         COALESCE(etapa_nome, 'Etapa removida') AS etapa_nome,
         observacao AS motivo,
         COALESCE(autor_email, 'Usuário removido') AS rejeitado_por,
         criado_em AS rejeitado_em
    FROM tudo
   ORDER BY criado_em DESC;
$$;

GRANT EXECUTE ON FUNCTION public.meus_lancamentos_rejeitados() TO authenticated;

NOTIFY pgrst, 'reload schema';
