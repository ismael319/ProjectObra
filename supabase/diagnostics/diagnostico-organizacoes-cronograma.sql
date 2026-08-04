-- Diagnóstico (somente leitura) — confirma se Ismael e Gustavo estão na
-- mesma organização, e a qual organização o projeto "FS CNP" pertence.
-- Execute no Supabase SQL Editor e me mande os dois resultados.

-- 1) Usuários e a organização de cada um
SELECT up.email, up.papel, up.status_solicitacao, up.organizacao_id, o.nome AS organizacao_nome, o.is_piloto
FROM public.user_profiles up
LEFT JOIN public.organizacoes o ON o.id = up.organizacao_id
WHERE up.email IN ('ismaelpereirafranca8@gmail.com', 'gusilveira97@hotmail.com', 'frigotto@bdrmt.com.br')
ORDER BY up.email;

-- 2) Projeto(s) "FS CNP" e a organização de cada um, com contagem de cronogramas
SELECT p.id, p.nome, p.organizacao_id, o.nome AS organizacao_nome,
  (SELECT count(*) FROM public.projeto_cronogramas pc WHERE pc.projeto_id = p.id) AS qtd_cronogramas
FROM public.projetos p
LEFT JOIN public.organizacoes o ON o.id = p.organizacao_id
WHERE p.nome ILIKE '%FS CNP%' OR p.nome ILIKE '%FS%';
