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
  userId?: string | null;
  linhas: FuncionarioParseado[];
}): Promise<ResumoImportacaoEfetivo> {
  const { organizacaoId, userId, linhas } = params;
  if (linhas.length === 0) {
    return { totalLinhas: 0, novos: 0, atualizados: 0, documentosGravados: 0, catalogosCriados: [], documentosSemTipoConhecido: [] };
  }

  const [cacheSetores, cacheCargos, cacheEncarregados, cacheGrupos, tiposDocumentoResp, funcionariosExistentesResp] = await Promise.all([
    carregarCatalogo("rh_setores", organizacaoId),
    carregarCatalogo("rh_cargos", organizacaoId),
    carregarCatalogo("rh_encarregados", organizacaoId),
    carregarCatalogo("rh_grupos", organizacaoId),
    supabase.from("tipos_documento").select("id,key,validade_dias").eq("organizacao_id", organizacaoId),
    supabase.from("funcionarios").select("matricula").eq("organizacao_id", organizacaoId),
  ]);

  if (tiposDocumentoResp.error) throw new Error(tiposDocumentoResp.error.message);
  if (funcionariosExistentesResp.error) throw new Error(funcionariosExistentesResp.error.message);

  const tipoDocPorKey = new Map(
    (tiposDocumentoResp.data as { id: string; key: string; validade_dias: number }[]).map((t) => [t.key, t])
  );
  const matriculasJaExistiam = new Set(
    (funcionariosExistentesResp.data as { matricula: string }[]).map((f) => f.matricula)
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
    const [cargoId, setorId, encarregadoId, grupoId] = await Promise.all([
      resolver("rh_cargos", f.cargoNome, cacheCargos),
      resolver("rh_setores", f.setorNome, cacheSetores),
      resolver("rh_encarregados", f.encarregadoNome, cacheEncarregados),
      resolver("rh_grupos", f.grupoNome, cacheGrupos),
    ]);

    linhasParaGravar.push({
      organizacao_id: organizacaoId,
      matricula: f.matricula,
      nome: f.nome,
      cpf: f.cpf,
      cargo_id: cargoId,
      setor_id: setorId,
      encarregado_id: encarregadoId,
      indicacao: f.indicacao,
      data_admissao: f.admissao,
      obra_codigo: f.obraCodigo,
      local: f.local,
      status_bdr: f.statusBdr,
      status_fs: f.statusFs,
      grupo_id: grupoId,
      categoria: f.categoria,
      criado_por: userId ?? null,
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
  userId?: string | null;
  arquivoNome: string;
  linhas: PontoParseado[];
}): Promise<ResumoImportacaoPonto> {
  const { organizacaoId, userId, arquivoNome, linhas } = params;
  if (linhas.length === 0) {
    return { totalLinhas: 0, matriculasEncontradas: 0, matriculasNaoEncontradas: 0, diasDistintos: 0 };
  }

  const { data: funcionariosData, error: erroFuncionarios } = await supabase
    .from("funcionarios")
    .select("id,matricula,setor_id,cargo_id")
    .eq("organizacao_id", organizacaoId);
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
  obra_codigo: string | null;
  local: Local | null;
  status_bdr: StatusBdr;
  status_fs: StatusFs;
  grupo_id: string | null;
  categoria: Categoria | null;
  criado_em: string;
  atualizado_em: string;
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

export async function listarFuncionarios(organizacaoId: string): Promise<FuncionarioRow[]> {
  const { data, error } = await supabase.from("funcionarios").select("*").eq("organizacao_id", organizacaoId).order("nome");
  if (error) throw new Error(error.message);
  return data as FuncionarioRow[];
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
  obraCodigo: string | null;
  local: Local | null;
  statusBdr: StatusBdr;
  statusFs: StatusFs;
  grupoId: string | null;
  categoria: Categoria | null;
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
    obra_codigo: input.obraCodigo,
    local: input.local,
    status_bdr: input.statusBdr,
    status_fs: input.statusFs,
    grupo_id: input.grupoId,
    categoria: input.categoria,
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
// cópia em demissoes ANTES de apagar de funcionarios — se algo falhar entre
// as duas, o pior caso é uma linha de demissoes "solta" pra limpar depois,
// nunca perder o registro do funcionário sem deixar rastro.
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

  const { error: erroDelete } = await supabase.from("funcionarios").delete().eq("id", funcionario.id);
  if (erroDelete) throw new Error(erroDelete.message);
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

export async function listarDemissoes(organizacaoId: string): Promise<DemissaoRow[]> {
  const { data, error } = await supabase
    .from("demissoes")
    .select("*")
    .eq("organizacao_id", organizacaoId)
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
  const { data, error } = await supabase.from("documentos_funcionario").select("*").eq("funcionario_id", funcionarioId);
  if (error) throw new Error(error.message);
  return data as DocumentoFuncionarioRow[];
}

export async function renovarDocumento(params: {
  organizacaoId: string;
  funcionarioId: string;
  tipoDocumentoId: string;
  validadeDias: number;
  dataEmissao: string;
  userId?: string | null;
}): Promise<void> {
  const { organizacaoId, funcionarioId, tipoDocumentoId, validadeDias, dataEmissao, userId } = params;
  const { error } = await supabase.from("documentos_funcionario").upsert(
    {
      organizacao_id: organizacaoId,
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
export async function listarAlertasDocumentos(organizacaoId: string, diasJanela = 30): Promise<AlertaDocumento[]> {
  const { data, error } = await supabase
    .from("documentos_funcionario")
    .select("funcionario_id, data_vencimento, funcionarios!inner(nome, organizacao_id), tipos_documento(nome)")
    .eq("funcionarios.organizacao_id", organizacaoId);
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
export async function efetivoDoDia(organizacaoId: string, data: string): Promise<EfetivoDoDiaLinha[]> {
  const [setoresResp, funcionariosResp, pontoResp, campoResp] = await Promise.all([
    supabase.from("rh_setores").select("id,nome").eq("organizacao_id", organizacaoId).eq("ativo", true),
    supabase.from("funcionarios").select("setor_id").eq("organizacao_id", organizacaoId),
    supabase.from("rh_efetivo_ponto_diario").select("setor_id,total_presentes").eq("organizacao_id", organizacaoId).eq("data", data),
    supabase.from("apontamentos_diarios").select("setor_nome,pedreiro,servente,carpinteiro,qntdd_funcao").eq("data", data),
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
