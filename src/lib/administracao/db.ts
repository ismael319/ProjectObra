import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "./parse-shared";
import { normalizarMatricula } from "./parse-ponto";
import type { FuncionarioParseado } from "./parse-efetivo";
import type { PontoParseado } from "./parse-ponto";

const TAMANHO_LOTE = 500;

type CatalogoRow = { id: string; nome: string };

async function carregarCatalogo(tabela: string, organizacaoId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from(tabela).select("id,nome").eq("organizacao_id", organizacaoId);
  if (error) throw new Error(error.message);
  const mapa = new Map<string, string>();
  for (const row of (data as CatalogoRow[] | null) ?? []) {
    mapa.set(normalizarTexto(row.nome), row.id);
  }
  return mapa;
}

/** Resolve pelo nome (normalizado) num cache já carregado, criando a linha se não existir. */
async function resolverOuCriarCatalogo(tabela: string, organizacaoId: string, nome: string, cache: Map<string, string>): Promise<string> {
  const chave = normalizarTexto(nome);
  const existente = cache.get(chave);
  if (existente) return existente;

  const { data, error } = await supabase
    .from(tabela)
    .insert({ organizacao_id: organizacaoId, nome })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? `Falha ao criar em ${tabela}: "${nome}".`);
  cache.set(chave, (data as { id: string }).id);
  return (data as { id: string }).id;
}

function subtrairDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export type ResumoImportacaoEfetivo = {
  totalLinhas: number;
  novos: number;
  atualizados: number;
  documentosGravados: number;
  catalogosCriados: { tabela: string; nome: string }[];
  documentosSemTipoConhecido: string[];
};

export async function importarEfetivo(params: {
  organizacaoId: string;
  projetoId: string;
  userId?: string | null;
  arquivoNome: string;
  linhas: FuncionarioParseado[];
}): Promise<ResumoImportacaoEfetivo> {
  const { organizacaoId, projetoId, userId, arquivoNome, linhas } = params;
  if (linhas.length === 0) {
    return { totalLinhas: 0, novos: 0, atualizados: 0, documentosGravados: 0, catalogosCriados: [], documentosSemTipoConhecido: [] };
  }

  const [cacheSetores, cacheCargos, cacheEncarregados, cacheGrupos, tiposDocumentoResp, funcionariosExistentesResp, cargosCompletosResp] =
    await Promise.all([
      carregarCatalogo("rh_setores", organizacaoId),
      carregarCatalogo("rh_cargos", organizacaoId),
      carregarCatalogo("rh_encarregados", organizacaoId),
      carregarCatalogo("rh_grupos", organizacaoId),
      supabase.from("tipos_documento").select("id,key,validade_dias").eq("organizacao_id", organizacaoId),
      supabase.from("funcionarios").select("*").eq("organizacao_id", organizacaoId),
      supabase.from("rh_cargos").select("id,setor_padrao_id,grupo_id,categoria").eq("organizacao_id", organizacaoId),
    ]);

  if (tiposDocumentoResp.error) throw new Error(tiposDocumentoResp.error.message);
  if (funcionariosExistentesResp.error) throw new Error(funcionariosExistentesResp.error.message);
  if (cargosCompletosResp.error) throw new Error(cargosCompletosResp.error.message);

  const tipoDocPorKey = new Map(
    (tiposDocumentoResp.data as { id: string; key: string; validade_dias: number }[]).map((t) => [t.key, t])
  );
  // Reimportar não deve desfazer o que já foi corrigido/preenchido na
  // plataforma — pra cada funcionário já existente (por matrícula), o valor
  // que já está no banco tem prioridade sobre o que vem da planilha; só
  // preenche do arquivo o que ainda estiver vazio. Só documentos_funcionario
  // (vencimento de ASO/Integração) continua sempre atualizando pela
  // planilha — isso é o dado que faz sentido vir sempre mais fresco.
  const existentePorMatricula = new Map(
    (funcionariosExistentesResp.data as FuncionarioRow[]).map((f) => [f.matricula, f])
  );
  const matriculasJaExistiam = new Set(existentePorMatricula.keys());

  function comPrioridadeExistente<T>(valorExistente: T | null | undefined, valorPlanilha: T | null): T | null {
    if (valorExistente === null || valorExistente === undefined || (valorExistente as unknown) === "") return valorPlanilha;
    return valorExistente;
  }
  // Retaguarda pra Setor/Grupo/Categoria: quando a planilha não traz esses
  // campos pra uma linha (ex.: sem coluna SETOR), usa o padrão já cadastrado
  // pro Cargo (Cadastro de Cargos) em vez de deixar em branco — mesma lógica
  // de autopreenchimento já usada no formulário manual de Funcionário.
  const padraoDoCargoPorId = new Map(
    (cargosCompletosResp.data as { id: string; setor_padrao_id: string | null; grupo_id: string | null; categoria: Categoria | null }[]).map(
      (c) => [c.id, c]
    )
  );

  const catalogosCriados: { tabela: string; nome: string }[] = [];
  const documentosSemTipoConhecido: string[] = [];

  async function resolver(tabela: string, nome: string | null, cache: Map<string, string>): Promise<string | null> {
    if (!nome) return null;
    const chave = normalizarTexto(nome);
    const jaExiste = cache.has(chave);
    const id = await resolverOuCriarCatalogo(tabela, organizacaoId, nome, cache);
    if (!jaExiste) catalogosCriados.push({ tabela, nome });
    return id;
  }

  const linhasParaGravar: Record<string, unknown>[] = [];
  const documentosPorMatricula = new Map<
    string,
    { tipo_documento_id: string; data_emissao: string; validade_dias_no_momento: number }[]
  >();

  for (const f of linhas) {
    const [cargoId, setorIdDaPlanilha, encarregadoId, grupoIdDaPlanilha] = await Promise.all([
      resolver("rh_cargos", f.cargoNome, cacheCargos),
      resolver("rh_setores", f.setorNome, cacheSetores),
      resolver("rh_encarregados", f.encarregadoNome, cacheEncarregados),
      resolver("rh_grupos", f.grupoNome, cacheGrupos),
    ]);

    const padraoCargo = cargoId ? padraoDoCargoPorId.get(cargoId) : undefined;
    const setorId = setorIdDaPlanilha ?? padraoCargo?.setor_padrao_id ?? null;
    const grupoId = grupoIdDaPlanilha ?? padraoCargo?.grupo_id ?? null;
    const categoria = f.categoria ?? padraoCargo?.categoria ?? null;
    // NOT NULL no banco — quando a planilha não traz um status reconhecido,
    // entra com um padrão conservador (a definir depois direto na
    // plataforma), em vez de travar a linha fora do sistema.
    const statusBdr = f.statusBdr ?? "aguardando_documentacao";
    const statusFs = f.statusFs ?? "bloqueado";

    const existente = existentePorMatricula.get(f.matricula);

    linhasParaGravar.push({
      organizacao_id: organizacaoId,
      // Importar é uma ação de "esta planilha é o efetivo desta obra" — ao
      // contrário dos outros campos, projeto_id não preserva o valor
      // anterior, sempre confirma a obra sendo importada agora.
      projeto_id: projetoId,
      matricula: f.matricula,
      nome: comPrioridadeExistente(existente?.nome, f.nome),
      cpf: comPrioridadeExistente(existente?.cpf, f.cpf),
      cargo_id: comPrioridadeExistente(existente?.cargo_id, cargoId),
      setor_id: comPrioridadeExistente(existente?.setor_id, setorId),
      encarregado_id: comPrioridadeExistente(existente?.encarregado_id, encarregadoId),
      indicacao: comPrioridadeExistente(existente?.indicacao, f.indicacao),
      data_admissao: comPrioridadeExistente(existente?.data_admissao, f.admissao),
      local: comPrioridadeExistente(existente?.local, f.local),
      status_bdr: comPrioridadeExistente(existente?.status_bdr, statusBdr),
      status_fs: comPrioridadeExistente(existente?.status_fs, statusFs),
      grupo_id: comPrioridadeExistente(existente?.grupo_id, grupoId),
      categoria: comPrioridadeExistente(existente?.categoria, categoria),
      criado_por: existente?.criado_por ?? userId ?? null,
    });

    const docs: { tipo_documento_id: string; data_emissao: string; validade_dias_no_momento: number }[] = [];
    for (const doc of f.documentos) {
      const tipo = tipoDocPorKey.get(doc.tipoKey);
      if (!tipo) {
        documentosSemTipoConhecido.push(`${f.nome} (${f.matricula}): tipo "${doc.tipoKey}" não está cadastrado nesta empresa.`);
        continue;
      }
      docs.push({
        tipo_documento_id: tipo.id,
        data_emissao: subtrairDias(doc.dataVencimento, tipo.validade_dias),
        validade_dias_no_momento: tipo.validade_dias,
      });
    }
    if (docs.length > 0) documentosPorMatricula.set(f.matricula, docs);
  }

  const novos = linhasParaGravar.filter((l) => !matriculasJaExistiam.has(l.matricula as string)).length;
  const atualizados = linhasParaGravar.length - novos;

  const idsNovosParaRollback: string[] = [];
  try {
    const funcionarioIdPorMatricula = new Map<string, string>();
    for (let i = 0; i < linhasParaGravar.length; i += TAMANHO_LOTE) {
      const lote = linhasParaGravar.slice(i, i + TAMANHO_LOTE);
      const { data, error } = await supabase
        .from("funcionarios")
        .upsert(lote, { onConflict: "organizacao_id,matricula" })
        .select("id,matricula");
      if (error) throw new Error(error.message);
      for (const row of data as { id: string; matricula: string }[]) {
        funcionarioIdPorMatricula.set(row.matricula, row.id);
        if (!matriculasJaExistiam.has(row.matricula)) idsNovosParaRollback.push(row.id);
      }
    }

    const documentosParaGravar: Record<string, unknown>[] = [];
    for (const [matricula, docs] of documentosPorMatricula) {
      const funcionarioId = funcionarioIdPorMatricula.get(matricula);
      if (!funcionarioId) continue;
      for (const doc of docs) {
        documentosParaGravar.push({
          organizacao_id: organizacaoId,
          projeto_id: projetoId,
          funcionario_id: funcionarioId,
          tipo_documento_id: doc.tipo_documento_id,
          data_emissao: doc.data_emissao,
          validade_dias_no_momento: doc.validade_dias_no_momento,
          atualizado_por: userId ?? null,
        });
      }
    }

    let documentosGravados = 0;
    for (let i = 0; i < documentosParaGravar.length; i += TAMANHO_LOTE) {
      const lote = documentosParaGravar.slice(i, i + TAMANHO_LOTE);
      const { error } = await supabase
        .from("documentos_funcionario")
        .upsert(lote, { onConflict: "funcionario_id,tipo_documento_id" });
      if (error) throw new Error(error.message);
      documentosGravados += lote.length;
    }

    // Só pra exibir "última importação" na tela — se isso falhar, não
    // desfaz o import (os funcionários já foram gravados de verdade).
    await supabase.from("efetivo_importacoes").insert({
      organizacao_id: organizacaoId,
      projeto_id: projetoId,
      arquivo_nome: arquivoNome,
      total_linhas: linhasParaGravar.length,
      novos,
      atualizados,
      importado_por: userId ?? null,
    });

    return { totalLinhas: linhasParaGravar.length, novos, atualizados, documentosGravados, catalogosCriados, documentosSemTipoConhecido };
  } catch (erro) {
    // Upsert não é tão simples de desfazer quanto um insert puro (podia estar
    // atualizando uma linha que já existia antes desta importação) — só
    // reverte funcionários criados NESTA importação. documentos_funcionario
    // some sozinho por ON DELETE CASCADE.
    if (idsNovosParaRollback.length > 0) {
      await supabase.from("funcionarios").delete().in("id", idsNovosParaRollback);
    }
    throw erro;
  }
}

export type ResumoImportacaoPonto = {
  totalLinhas: number;
  matriculasEncontradas: number;
  matriculasNaoEncontradas: number;
  diasDistintos: number;
};

export async function importarPonto(params: {
  organizacaoId: string;
  projetoId: string;
  userId?: string | null;
  arquivoNome: string;
  linhas: PontoParseado[];
}): Promise<ResumoImportacaoPonto> {
  const { organizacaoId, projetoId, userId, arquivoNome, linhas } = params;
  if (linhas.length === 0) {
    return { totalLinhas: 0, matriculasEncontradas: 0, matriculasNaoEncontradas: 0, diasDistintos: 0 };
  }

  // Só reconcilia contra funcionários DESTA obra — uma matrícula que existe
  // só em outra obra da mesma empresa conta como "não encontrada" aqui, com
  // razão (ela pertence a outro efetivo).
  const { data: funcionariosData, error: erroFuncionarios } = await supabase
    .from("funcionarios")
    .select("id,matricula,setor_id,cargo_id")
    .eq("organizacao_id", organizacaoId)
    .eq("projeto_id", projetoId);
  if (erroFuncionarios) throw new Error(erroFuncionarios.message);

  const funcionarioPorMatricula = new Map(
    (funcionariosData as { id: string; matricula: string; setor_id: string | null; cargo_id: string | null }[]).map(
      (f) => [normalizarMatricula(f.matricula), f]
    )
  );

  let matriculasEncontradas = 0;
  const linhasParaGravar = linhas.map((p) => {
    const funcionario = funcionarioPorMatricula.get(p.matriculaNormalizada);
    if (funcionario) matriculasEncontradas += 1;
    return {
      organizacao_id: organizacaoId,
      projeto_id: projetoId,
      matricula: p.matricula,
      matricula_normalizada: p.matriculaNormalizada,
      funcionario_id: funcionario?.id ?? null,
      data: p.data,
      presente: p.presente,
      horario_entrada: p.horarioEntrada,
      horario_saida: p.horarioSaida,
      arquivo_origem: arquivoNome,
      importado_por: userId ?? null,
    };
  });

  const idsPontosNovos: string[] = [];
  const idsAgregadosNovos: string[] = [];
  try {
    for (let i = 0; i < linhasParaGravar.length; i += TAMANHO_LOTE) {
      const lote = linhasParaGravar.slice(i, i + TAMANHO_LOTE);
      const { data, error } = await supabase.from("pontos_importados").insert(lote).select("id");
      if (error) throw new Error(error.message);
      idsPontosNovos.push(...(data as { id: string }[]).map((r) => r.id));
    }

    // Agrega presentes por (setor, cargo, data) pra rh_efetivo_ponto_diario —
    // é o snapshot persistido usado depois na comparação Ponto x Campo.
    const agregado = new Map<string, { data: string; setor_id: string | null; cargo_id: string | null; total: number }>();
    for (const p of linhas) {
      if (!p.presente) continue;
      const funcionario = funcionarioPorMatricula.get(p.matriculaNormalizada);
      const chave = `${p.data}|${funcionario?.setor_id ?? ""}|${funcionario?.cargo_id ?? ""}`;
      const atual = agregado.get(chave) ?? {
        data: p.data,
        setor_id: funcionario?.setor_id ?? null,
        cargo_id: funcionario?.cargo_id ?? null,
        total: 0,
      };
      atual.total += 1;
      agregado.set(chave, atual);
    }

    const linhasAgregadas = [...agregado.values()].map((a) => ({
      organizacao_id: organizacaoId,
      projeto_id: projetoId,
      data: a.data,
      setor_id: a.setor_id,
      cargo_id: a.cargo_id,
      total_presentes: a.total,
    }));

    for (let i = 0; i < linhasAgregadas.length; i += TAMANHO_LOTE) {
      const lote = linhasAgregadas.slice(i, i + TAMANHO_LOTE);
      const { data, error } = await supabase.from("rh_efetivo_ponto_diario").insert(lote).select("id");
      if (error) throw new Error(error.message);
      idsAgregadosNovos.push(...(data as { id: string }[]).map((r) => r.id));
    }

    const diasDistintos = new Set(linhas.map((p) => p.data)).size;
    return {
      totalLinhas: linhas.length,
      matriculasEncontradas,
      matriculasNaoEncontradas: linhas.length - matriculasEncontradas,
      diasDistintos,
    };
  } catch (erro) {
    if (idsAgregadosNovos.length > 0) {
      await supabase.from("rh_efetivo_ponto_diario").delete().in("id", idsAgregadosNovos);
    }
    if (idsPontosNovos.length > 0) {
      await supabase.from("pontos_importados").delete().in("id", idsPontosNovos);
    }
    throw erro;
  }
}

// ============================================================
// Telas (Etapa 3): funcionários, desligamento, documentos, alertas,
// Efetivo do Dia.
// ============================================================

export type Local = "obra" | "alojamento" | "em_viagem" | "turno_noite";
export type StatusBdr = "liberado_fs" | "integracao" | "aguardando_documentacao";
export type StatusFs = "liberado" | "bloqueado";
export type Categoria = "D" | "I";
export type MotivoDemissao = "pedido_demissao" | "justa_causa" | "termino_contrato" | "sem_justa_causa";

export type FuncionarioRow = {
  id: string;
  organizacao_id: string;
  matricula: string;
  nome: string;
  cpf: string | null;
  cargo_id: string | null;
  setor_id: string | null;
  encarregado_id: string | null;
  indicacao: string | null;
  data_admissao: string;
  projeto_id: string | null;
  local: Local | null;
  status_bdr: StatusBdr;
  status_fs: StatusFs;
  ativo: boolean;
  grupo_id: string | null;
  categoria: Categoria | null;
  foto_url: string | null;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
};

// Cria um item novo num catálogo (rh_setores/rh_cargos/rh_encarregados/
// rh_grupos) direto da UI — ex.: botão "+" no form de Funcionário pra um
// Cargo/Setor que ainda não existe. Ao contrário de resolverOuCriarCatalogo
// (usado no importador em lote), não busca primeiro: aqui é sempre uma
// criação explícita, decidida pelo usuário clicando em "+".
export async function criarItemCatalogo(
  tabela: "rh_setores" | "rh_cargos" | "rh_encarregados" | "rh_grupos",
  organizacaoId: string,
  nome: string
): Promise<{ id: string; nome: string }> {
  const { data, error } = await supabase
    .from(tabela)
    .insert({ organizacao_id: organizacaoId, nome })
    .select("id,nome")
    .single();
  if (error || !data) throw new Error(error?.message ?? `Falha ao criar em ${tabela}.`);
  return data as { id: string; nome: string };
}

// Traz todo mundo (ativo ou não) — a aba Funcionários mostra o quadro
// completo; quem precisa só de ativos (Dashboard/Efetivo do Dia/alertas de
// Documentação) filtra por conta própria ou já filtra na própria query.
export async function listarFuncionarios(organizacaoId: string, projetoId: string): Promise<FuncionarioRow[]> {
  const { data, error } = await supabase
    .from("funcionarios")
    .select("*")
    .eq("organizacao_id", organizacaoId)
    .eq("projeto_id", projetoId)
    .order("nome");
  if (error) throw new Error(error.message);
  return data as FuncionarioRow[];
}

export type UltimaImportacaoEfetivo = {
  arquivoNome: string;
  totalLinhas: number;
  novos: number;
  atualizados: number;
  importadoEm: string;
};

export async function listarUltimaImportacaoEfetivo(organizacaoId: string, projetoId: string): Promise<UltimaImportacaoEfetivo | null> {
  const { data, error } = await supabase
    .from("efetivo_importacoes")
    .select("arquivo_nome, total_linhas, novos, atualizados, importado_em")
    .eq("organizacao_id", organizacaoId)
    .eq("projeto_id", projetoId)
    .order("importado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    arquivoNome: data.arquivo_nome,
    totalLinhas: data.total_linhas,
    novos: data.novos,
    atualizados: data.atualizados,
    importadoEm: data.importado_em,
  };
}

export type FuncionarioInput = {
  id?: string;
  matricula: string;
  nome: string;
  cpf: string | null;
  cargoId: string | null;
  setorId: string | null;
  encarregadoId: string | null;
  indicacao: string | null;
  dataAdmissao: string;
  projetoId: string;
  local: Local | null;
  statusBdr: StatusBdr;
  statusFs: StatusFs;
  grupoId: string | null;
  categoria: Categoria | null;
  fotoUrl: string | null;
};

export async function salvarFuncionario(params: {
  organizacaoId: string;
  userId?: string | null;
  input: FuncionarioInput;
}): Promise<void> {
  const { organizacaoId, userId, input } = params;
  const camposComuns = {
    matricula: input.matricula,
    nome: input.nome,
    cpf: input.cpf,
    cargo_id: input.cargoId,
    setor_id: input.setorId,
    encarregado_id: input.encarregadoId,
    indicacao: input.indicacao,
    data_admissao: input.dataAdmissao,
    projeto_id: input.projetoId,
    local: input.local,
    status_bdr: input.statusBdr,
    status_fs: input.statusFs,
    grupo_id: input.grupoId,
    categoria: input.categoria,
    foto_url: input.fotoUrl,
  };

  if (input.id) {
    const { error } = await supabase
      .from("funcionarios")
      .update({ ...camposComuns, atualizado_em: new Date().toISOString() })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("funcionarios")
      .insert({ ...camposComuns, organizacao_id: organizacaoId, criado_por: userId ?? null });
    if (error) throw new Error(error.message);
  }
}

// Transação em duas etapas (não há transação real via PostgREST): grava a
// cópia em demissoes ANTES de marcar ativo=false — se algo falhar entre as
// duas, o pior caso é uma linha de demissoes "solta" pra limpar depois,
// nunca perder o vínculo sem deixar rastro. Não apaga mais o funcionário
// (era ON DELETE CASCADE em documentos_funcionario — desligar apagava o
// histórico de ASO/NRs da pessoa pra sempre); agora ele só fica inativo,
// continua na aba Funcionários e pode ser reativado sem perder nada.
export async function desligarFuncionario(params: {
  organizacaoId: string;
  funcionario: FuncionarioRow;
  cargoNome: string | null;
  setorNome: string | null;
  motivo: MotivoDemissao;
  dataDemissao: string;
}): Promise<void> {
  const { organizacaoId, funcionario, cargoNome, setorNome, motivo, dataDemissao } = params;

  const { error: erroInsert } = await supabase.from("demissoes").insert({
    organizacao_id: organizacaoId,
    projeto_id: funcionario.projeto_id,
    funcionario_origem_id: funcionario.id,
    matricula: funcionario.matricula,
    nome: funcionario.nome,
    cargo_nome: cargoNome,
    setor_nome: setorNome,
    data_admissao: funcionario.data_admissao,
    data_demissao: dataDemissao,
    cpf: funcionario.cpf,
    indicacao: funcionario.indicacao,
    local: funcionario.local,
    motivo,
    categoria: funcionario.categoria,
  });
  if (erroInsert) throw new Error(erroInsert.message);

  const { error: erroUpdate } = await supabase.from("funcionarios").update({ ativo: false }).eq("id", funcionario.id);
  if (erroUpdate) throw new Error(erroUpdate.message);
}

export async function reativarFuncionario(funcionarioId: string): Promise<void> {
  const { error } = await supabase.from("funcionarios").update({ ativo: true }).eq("id", funcionarioId);
  if (error) throw new Error(error.message);
}

// Mesma ordem defensiva de desligarFuncionario: grava a cópia em
// transferencias ANTES de mover o funcionário — se algo falhar entre as
// duas, o pior caso é uma linha de histórico "solta", nunca perder o
// vínculo sem deixar rastro. projeto_origem_id vem do funcionário (obra
// atual), não é escolhido na tela.
export async function transferirFuncionario(params: {
  organizacaoId: string;
  funcionario: FuncionarioRow;
  cargoNome: string | null;
  setorNome: string | null;
  projetoDestinoId: string;
  dataTransferencia: string;
  motivo: string | null;
}): Promise<void> {
  const { organizacaoId, funcionario, cargoNome, setorNome, projetoDestinoId, dataTransferencia, motivo } = params;
  if (!funcionario.projeto_id) throw new Error("Funcionário sem obra atual definida.");

  const { error: erroInsert } = await supabase.from("transferencias").insert({
    organizacao_id: organizacaoId,
    funcionario_id: funcionario.id,
    matricula: funcionario.matricula,
    nome: funcionario.nome,
    cargo_nome: cargoNome,
    setor_nome: setorNome,
    projeto_origem_id: funcionario.projeto_id,
    projeto_destino_id: projetoDestinoId,
    data_transferencia: dataTransferencia,
    motivo,
  });
  if (erroInsert) throw new Error(erroInsert.message);

  const { error: erroUpdate } = await supabase
    .from("funcionarios")
    .update({ projeto_id: projetoDestinoId, atualizado_em: new Date().toISOString() })
    .eq("id", funcionario.id);
  if (erroUpdate) throw new Error(erroUpdate.message);
}

export type TransferenciaRow = {
  id: string;
  matricula: string;
  nome: string;
  cargo_nome: string | null;
  setor_nome: string | null;
  projeto_origem_id: string;
  projeto_destino_id: string;
  data_transferencia: string;
  motivo: string | null;
  criado_em: string;
};

export async function listarTransferencias(organizacaoId: string, projetoId: string): Promise<TransferenciaRow[]> {
  const { data, error } = await supabase
    .from("transferencias")
    .select("*")
    .eq("organizacao_id", organizacaoId)
    .eq("projeto_origem_id", projetoId)
    .order("data_transferencia", { ascending: false });
  if (error) throw new Error(error.message);
  return data as TransferenciaRow[];
}

export type DemissaoRow = {
  id: string;
  matricula: string;
  nome: string;
  cargo_nome: string | null;
  setor_nome: string | null;
  data_admissao: string | null;
  data_demissao: string;
  cpf: string | null;
  indicacao: string | null;
  local: string | null;
  motivo: MotivoDemissao;
  categoria: string | null;
  criado_em: string;
};

export async function listarDemissoes(organizacaoId: string, projetoId: string): Promise<DemissaoRow[]> {
  const { data, error } = await supabase
    .from("demissoes")
    .select("*")
    .eq("organizacao_id", organizacaoId)
    .eq("projeto_id", projetoId)
    .order("data_demissao", { ascending: false });
  if (error) throw new Error(error.message);
  return data as DemissaoRow[];
}

export type DocumentoFuncionarioRow = {
  id: string;
  funcionario_id: string;
  tipo_documento_id: string;
  data_emissao: string;
  validade_dias_no_momento: number;
  data_vencimento: string;
};

export async function listarDocumentosPorFuncionario(funcionarioId: string): Promise<DocumentoFuncionarioRow[]> {
  const { data, error } = await supabase.from("documentos_funcionario").select("id, funcionario_id, tipo_documento_id, data_emissao, validade_dias_no_momento, data_vencimento").eq("funcionario_id", funcionarioId);
  if (error) throw new Error(error.message);
  return data as DocumentoFuncionarioRow[];
}

export async function renovarDocumento(params: {
  organizacaoId: string;
  projetoId: string;
  funcionarioId: string;
  tipoDocumentoId: string;
  validadeDias: number;
  dataEmissao: string;
  userId?: string | null;
}): Promise<void> {
  const { organizacaoId, projetoId, funcionarioId, tipoDocumentoId, validadeDias, dataEmissao, userId } = params;
  const { error } = await supabase.from("documentos_funcionario").upsert(
    {
      organizacao_id: organizacaoId,
      projeto_id: projetoId,
      funcionario_id: funcionarioId,
      tipo_documento_id: tipoDocumentoId,
      data_emissao: dataEmissao,
      validade_dias_no_momento: validadeDias,
      atualizado_por: userId ?? null,
    },
    { onConflict: "funcionario_id,tipo_documento_id" }
  );
  if (error) throw new Error(error.message);
}

export type AlertaDocumento = {
  funcionarioId: string;
  funcionarioNome: string;
  tipoDocumentoNome: string;
  dataVencimento: string;
  diasParaVencer: number;
};

// "Vencido"/"vencendo em X dias" é calculado aqui (lógica de app sobre a
// data atual), não no banco — data_vencimento é a única coisa persistida
// (coluna gerada), como já decidido no schema.
export async function listarAlertasDocumentos(organizacaoId: string, projetoId: string, diasJanela = 30): Promise<AlertaDocumento[]> {
  const { data, error } = await supabase
    .from("documentos_funcionario")
    .select("funcionario_id, data_vencimento, funcionarios!inner(nome, organizacao_id, projeto_id, ativo), tipos_documento(nome)")
    .eq("funcionarios.organizacao_id", organizacaoId)
    .eq("funcionarios.projeto_id", projetoId)
    .eq("funcionarios.ativo", true);
  if (error) throw new Error(error.message);

  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);

  const alertas: AlertaDocumento[] = [];
  for (const row of (data ?? []) as unknown as {
    funcionario_id: string;
    data_vencimento: string;
    funcionarios: { nome: string } | { nome: string }[];
    tipos_documento: { nome: string } | { nome: string }[];
  }[]) {
    const funcionario = Array.isArray(row.funcionarios) ? row.funcionarios[0] : row.funcionarios;
    const tipoDoc = Array.isArray(row.tipos_documento) ? row.tipos_documento[0] : row.tipos_documento;
    const venc = new Date(`${row.data_vencimento}T00:00:00Z`);
    const diasParaVencer = Math.round((venc.getTime() - hoje.getTime()) / 86_400_000);
    if (diasParaVencer <= diasJanela) {
      alertas.push({
        funcionarioId: row.funcionario_id,
        funcionarioNome: funcionario?.nome ?? "—",
        tipoDocumentoNome: tipoDoc?.nome ?? "—",
        dataVencimento: row.data_vencimento,
        diasParaVencer,
      });
    }
  }
  return alertas.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
}

export type EfetivoDoDiaLinha = {
  setorId: string;
  setorNome: string;
  cadastro: number;
  ponto: number | null;
  campo: number | null;
};

// Cadastro e Ponto já compartilham rh_setores.id (o snapshot de Ponto grava
// setor_id resolvido na importação). Só Campo (apontamentos_diarios) usa o
// catálogo global antigo, sem organizacao_id — casa por NOME normalizado,
// mesma decisão já tomada no schema pra essa reconciliação.
export async function efetivoDoDia(organizacaoId: string, projetoId: string, data: string): Promise<EfetivoDoDiaLinha[]> {
  const [setoresResp, funcionariosResp, pontoResp, campoResp] = await Promise.all([
    supabase.from("rh_setores").select("id,nome").eq("organizacao_id", organizacaoId).eq("ativo", true),
    supabase.from("funcionarios").select("setor_id").eq("organizacao_id", organizacaoId).eq("projeto_id", projetoId).eq("ativo", true),
    supabase.from("rh_efetivo_ponto_diario").select("setor_id,total_presentes").eq("organizacao_id", organizacaoId).eq("projeto_id", projetoId).eq("data", data),
    supabase
      .from("apontamentos_diarios")
      .select("setor_nome,pedreiro,servente,carpinteiro,qntdd_funcao")
      .eq("organizacao_id", organizacaoId)
      .eq("projeto_id", projetoId)
      .eq("data", data),
  ]);
  if (setoresResp.error) throw new Error(setoresResp.error.message);
  if (funcionariosResp.error) throw new Error(funcionariosResp.error.message);
  if (pontoResp.error) throw new Error(pontoResp.error.message);
  if (campoResp.error) throw new Error(campoResp.error.message);

  const setores = setoresResp.data as { id: string; nome: string }[];

  const cadastroPorSetor = new Map<string, number>();
  for (const f of funcionariosResp.data as { setor_id: string | null }[]) {
    if (!f.setor_id) continue;
    cadastroPorSetor.set(f.setor_id, (cadastroPorSetor.get(f.setor_id) ?? 0) + 1);
  }

  let houvePonto = false;
  const pontoPorSetor = new Map<string, number>();
  for (const p of pontoResp.data as { setor_id: string | null; total_presentes: number }[]) {
    houvePonto = true;
    if (!p.setor_id) continue;
    pontoPorSetor.set(p.setor_id, (pontoPorSetor.get(p.setor_id) ?? 0) + p.total_presentes);
  }

  let houveCampo = false;
  const campoPorSetorNome = new Map<string, number>();
  for (const c of campoResp.data as {
    setor_nome: string;
    pedreiro: number;
    servente: number;
    carpinteiro: number;
    qntdd_funcao: number;
  }[]) {
    houveCampo = true;
    const chave = normalizarTexto(c.setor_nome);
    const total = (c.pedreiro || 0) + (c.servente || 0) + (c.carpinteiro || 0) + (c.qntdd_funcao || 0);
    campoPorSetorNome.set(chave, (campoPorSetorNome.get(chave) ?? 0) + total);
  }

  return setores
    .map((s) => ({
      setorId: s.id,
      setorNome: s.nome,
      cadastro: cadastroPorSetor.get(s.id) ?? 0,
      ponto: houvePonto ? pontoPorSetor.get(s.id) ?? 0 : null,
      campo: houveCampo ? campoPorSetorNome.get(normalizarTexto(s.nome)) ?? 0 : null,
    }))
    .sort((a, b) => a.setorNome.localeCompare(b.setorNome, "pt-BR"));
}

// ============================================================
// Cadastro de Cargos (tabela de referência Função x Setor x Categoria)
// ============================================================

export type CargoInput = {
  id?: string;
  nome: string;
  setorPadraoId: string | null;
  grupoId: string | null;
  categoria: Categoria | null;
};

export async function salvarCargo(params: { organizacaoId: string; input: CargoInput }): Promise<void> {
  const { organizacaoId, input } = params;
  const campos = {
    nome: input.nome,
    setor_padrao_id: input.setorPadraoId,
    grupo_id: input.grupoId,
    categoria: input.categoria,
  };
  if (input.id) {
    const { error } = await supabase.from("rh_cargos").update(campos).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("rh_cargos").insert({ ...campos, organizacao_id: organizacaoId });
    if (error) throw new Error(error.message);
  }
}

export async function alternarAtivoCargo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("rh_cargos").update({ ativo }).eq("id", id);
  if (error) throw new Error(error.message);
}

// Popula os cargos de referência (Função x Setor x Categoria) que hoje
// existem na planilha da empresa — idempotente, seguro rodar mais de uma
// vez (não duplica nem sobrescreve cargo já existente/editado).
export async function seedCargosReferenciaPadrao(organizacaoId: string): Promise<void> {
  const { error } = await supabase.rpc("seed_cargos_referencia_padrao", { p_organizacao_id: organizacaoId });
  if (error) throw new Error(error.message);
}

// ============================================================
// Cadastro de Tipos de Documento (ASO, NRs, Integração, Gota espessa etc.)
// ============================================================

export type TipoDocumentoInput = {
  id?: string;
  nome: string;
  validadeDias: number;
};

// key só é gravada na criação (constraint UNIQUE organizacao_id+key, ver
// seed_tipos_documento_padrao) — nunca reaproveitada na edição, então renomear um
// tipo depois não quebra nada: documentos já emitidos referenciam tipo_documento_id,
// não a key.
function slugKeyTipoDocumento(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export async function salvarTipoDocumento(params: { organizacaoId: string; input: TipoDocumentoInput }): Promise<void> {
  const { organizacaoId, input } = params;
  if (input.id) {
    const { error } = await supabase
      .from("tipos_documento")
      .update({ nome: input.nome, validade_dias: input.validadeDias })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("tipos_documento").insert({
      organizacao_id: organizacaoId,
      key: slugKeyTipoDocumento(input.nome),
      nome: input.nome,
      validade_dias: input.validadeDias,
    });
    if (error) throw new Error(error.code === "23505" ? "Já existe um tipo de documento com esse nome." : error.message);
  }
}

export async function alternarAtivoTipoDocumento(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("tipos_documento").update({ ativo }).eq("id", id);
  if (error) throw new Error(error.message);
}

// Popula os 9 tipos padrão (ASO, NR 01/06/12/18/20/35, Malária/gota espessa,
// Integração FS) — idempotente (ON CONFLICT DO NOTHING na key), seguro chamar de
// novo mesmo que a empresa já tenha alguns tipos cadastrados/editados.
export async function seedTiposDocumentoPadrao(organizacaoId: string): Promise<void> {
  const { error } = await supabase.rpc("seed_tipos_documento_padrao", { p_organizacao_id: organizacaoId });
  if (error) throw new Error(error.message);
}
