-- ============================================================
-- MIGRAÇÃO: Função de seed da tabela de referência Função x Setor x Categoria
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS administracao-grupos-catalogo-migration.sql
-- ============================================================
-- Mesmo espírito de seed_tipos_documento_padrao (administracao-schema-
-- migration.sql): não roda sozinha por trigger, é chamada explicitamente
-- pela tela "Cadastro de Cargos" (botão "Carregar lista padrão"). Idempotente
-- (WHERE NOT EXISTS) — rodar de novo não duplica nem sobrescreve edições que
-- o usuário já tenha feito num cargo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_cargos_referencia_padrao(p_organizacao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_setor record;
BEGIN
  FOR v_setor IN
    SELECT * FROM (VALUES
      ('Administrativo'), ('Coordenação'), ('Liderança'), ('Logística'), ('Operacional'), ('Técnico')
    ) AS s(nome)
  LOOP
    INSERT INTO public.rh_setores (organizacao_id, nome)
    SELECT p_organizacao_id, v_setor.nome
    WHERE NOT EXISTS (
      SELECT 1 FROM public.rh_setores WHERE organizacao_id = p_organizacao_id AND nome = v_setor.nome
    );
  END LOOP;

  INSERT INTO public.rh_cargos (organizacao_id, nome, setor_padrao_id, categoria)
  SELECT p_organizacao_id, v.nome, s.id, v.categoria
  FROM (VALUES
    ('Agente Administrativo', 'Administrativo', 'I'),
    ('Almoxarife', 'Administrativo', 'I'),
    ('Analista Administrativo', 'Administrativo', 'I'),
    ('Analista de Compras', 'Administrativo', 'I'),
    ('Analista de Recursos Humanos', 'Administrativo', 'I'),
    ('Assistente Administrativo', 'Administrativo', 'I'),
    ('Auxiliar Administrativo', 'Administrativo', 'I'),
    ('Auxiliar de Almoxarife', 'Administrativo', 'I'),
    ('Auxiliar de Engenharia', 'Administrativo', 'I'),
    ('Auxiliar de Engenheiraria Pl', 'Administrativo', 'I'),
    ('Contra Mestre de Obras', 'Liderança', 'I'),
    ('Engenheiro Civil', 'Coordenação', 'I'),
    ('Engenheiro de Segurança do Trabalho', 'Coordenação', 'I'),
    ('Engenheiro Mecânico', 'Coordenação', 'I'),
    ('Líder de Obra', 'Liderança', 'I'),
    ('Mestre de Obras', 'Coordenação', 'I'),
    ('Supervisor Administrativo', 'Coordenação', 'I'),
    ('Supervisor de Qualidade', 'Coordenação', 'I'),
    ('Supervisor de Segurança do Trabalho', 'Coordenação', 'I'),
    ('Supervisora da qualidade', 'Coordenação', 'I'),
    ('Planner', 'Coordenação', 'I'),
    ('Coordenador de Obras', 'Coordenação', 'I'),
    ('Contra Mestre de Obras Jr', 'Liderança', 'I'),
    ('Encarregado Carpintaria', 'Liderança', 'I'),
    ('Encarregado de Ferragem', 'Liderança', 'I'),
    ('Encarregado de Obras', 'Liderança', 'I'),
    ('Encarregado Terraplanagem', 'Liderança', 'I'),
    ('Motorista de Caminhão 3/4', 'Logística', 'I'),
    ('Motorista de Caminhão Basculante', 'Logística', 'I'),
    ('Motorista de Caminhão Betoneira', 'Logística', 'I'),
    ('Motorista de Caminhão Bomba', 'Logística', 'I'),
    ('Motorista de Caminhão Caçamba', 'Logística', 'I'),
    ('Motorista de Caminhão Guincho', 'Logística', 'I'),
    ('Operador de Guindaste', 'Logística', 'I'),
    ('Operador de Pá Carregadeira', 'Logística', 'I'),
    ('Operador de Retroescavadeira', 'Logística', 'I'),
    ('Operador de Trator', 'Logística', 'I'),
    ('Operador Escavadeira Hidráulica', 'Logística', 'I'),
    ('Operador Mini Pá Carregadeira', 'Logística', 'I'),
    ('Operador Rolo Compactador', 'Logística', 'I'),
    ('Operador de munck', 'Logística', 'I'),
    ('Apontador de Obras', 'Operacional', 'I'),
    ('Armador', 'Operacional', 'I'),
    ('Auxiliar de Eletricista', 'Operacional', 'D'),
    ('Auxiliar de Expedição', 'Operacional', 'D'),
    ('Auxiliar de Limpeza', 'Operacional', 'I'),
    ('Auxiliar de Montagem', 'Operacional', 'D'),
    ('Auxiliar Técnico de Segurança do Trabalho', 'Operacional', 'I'),
    ('Carpinteiro', 'Operacional', 'D'),
    ('Eletricista', 'Operacional', 'D'),
    ('Meio Oficial de Carpinteiro', 'Operacional', 'D'),
    ('Meio Oficial de Pedreiro', 'Operacional', 'D'),
    ('Monitor de Alojamento', 'Operacional', 'I'),
    ('Montador', 'Operacional', 'D'),
    ('Operador de Central de Concreto', 'Operacional', 'D'),
    ('Pedreiro', 'Operacional', 'D'),
    ('Porteiro', 'Operacional', 'I'),
    ('Servente de Obras', 'Operacional', 'D'),
    ('Sinaleiro', 'Operacional', 'I'),
    ('Soldador', 'Operacional', 'I'),
    ('Supervisor de Usina', 'Operacional', 'D'),
    ('Op. De Central de Concreto Jr', 'Operacional', 'I'),
    ('Técnico de Enfermagem do Trabalho', 'Técnico', 'I'),
    ('Técnico de Segurança do Trabalho', 'Técnico', 'I'),
    ('Enfermeira do trabalho', 'Técnico', 'I'),
    ('Almoxarife Jr', 'Administrativo', 'I')
  ) AS v(nome, setor_nome, categoria)
  JOIN public.rh_setores s ON s.organizacao_id = p_organizacao_id AND s.nome = v.setor_nome
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rh_cargos c WHERE c.organizacao_id = p_organizacao_id AND c.nome = v.nome
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_cargos_referencia_padrao(uuid) TO authenticated;
