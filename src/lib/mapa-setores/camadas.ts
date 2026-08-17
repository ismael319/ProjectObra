import { STATUS_SETORES, type SetorVisual } from './status'

export type CamadaMapaId = 'avanco' | 'status' | 'desvio' | 'programacao' | 'responsavel'
export type ProgramacaoHoje = 'sem_vinculo' | 'nao_programado' | 'programada' | 'em_execucao' | 'concluida' | 'nao_concluida'

export interface SetorComCamada extends SetorVisual {
  programacaoHoje: ProgramacaoHoje
}

export interface ItemLegendaCamada {
  id: string
  label: string
  cor: string
}

export interface ResultadoCamada {
  cor: string
  valor: string
}

export const CAMADAS_MAPA: { id: CamadaMapaId; label: string; descricao: string }[] = [
  { id: 'avanco', label: 'Avanço físico', descricao: 'Percentual realizado por setor' },
  { id: 'status', label: 'Status do cronograma', descricao: 'Situação em relação ao previsto' },
  { id: 'desvio', label: 'Desvio', descricao: 'Realizado versus planejado' },
  { id: 'programacao', label: 'Programação de hoje', descricao: 'Atividades planejadas para hoje' },
  { id: 'responsavel', label: 'Responsável', descricao: 'Engenheiro responsável pelo setor' },
]

const SEM_DADOS = '#64748b'

const PROGRAMACAO: Record<ProgramacaoHoje, ItemLegendaCamada> = {
  sem_vinculo: { id: 'sem_vinculo', label: 'Sem vínculo ao cronograma', cor: SEM_DADOS },
  nao_programado: { id: 'nao_programado', label: 'Sem atividade hoje', cor: '#94a3b8' },
  programada: { id: 'programada', label: 'Programada', cor: '#2563eb' },
  em_execucao: { id: 'em_execucao', label: 'Em execução', cor: '#d97706' },
  concluida: { id: 'concluida', label: 'Concluída', cor: '#16a34a' },
  nao_concluida: { id: 'nao_concluida', label: 'Não concluída', cor: '#dc2626' },
}

function formatarPercentual(valor: number | null) {
  return valor == null ? 'Sem dados' : `${valor.toFixed(0)}% realizado`
}

function resultadoAvanco(setor: SetorComCamada): ResultadoCamada {
  if (setor.concluido == null) return { cor: SEM_DADOS, valor: 'Sem dados' }
  if (setor.concluido >= 100) return { cor: '#166534', valor: formatarPercentual(setor.concluido) }
  if (setor.concluido >= 75) return { cor: '#2563eb', valor: formatarPercentual(setor.concluido) }
  if (setor.concluido >= 40) return { cor: '#38bdf8', valor: formatarPercentual(setor.concluido) }
  if (setor.concluido > 0) return { cor: '#7dd3fc', valor: formatarPercentual(setor.concluido) }
  return { cor: '#cbd5e1', valor: formatarPercentual(setor.concluido) }
}

function resultadoDesvio(setor: SetorComCamada): ResultadoCamada {
  if (setor.desvio == null) return { cor: SEM_DADOS, valor: 'Sem dados' }
  const valor = `${setor.desvio >= 0 ? '+' : ''}${setor.desvio.toFixed(1)} p.p.`
  if (setor.desvio < -5) return { cor: '#dc2626', valor }
  if (setor.desvio < -2) return { cor: '#f97316', valor }
  if (setor.desvio <= 2) return { cor: '#d97706', valor }
  return { cor: '#16a34a', valor }
}

export function resultadoDaCamada(camada: CamadaMapaId, setor: SetorComCamada): ResultadoCamada {
  if (camada === 'avanco') return resultadoAvanco(setor)
  if (camada === 'status') return { cor: STATUS_SETORES[setor.status].cor, valor: STATUS_SETORES[setor.status].label }
  if (camada === 'desvio') return resultadoDesvio(setor)
  if (camada === 'programacao') {
    const info = PROGRAMACAO[setor.programacaoHoje]
    return { cor: info.cor, valor: info.label }
  }
  return setor.engenheiro ? { cor: setor.corEngenheiro, valor: setor.engenheiro } : { cor: SEM_DADOS, valor: 'Sem responsável' }
}

export function legendaDaCamada(camada: CamadaMapaId, setores: SetorComCamada[]): ItemLegendaCamada[] {
  if (camada === 'status') return Object.values(STATUS_SETORES).map(({ id, label, cor }) => ({ id, label, cor }))
  if (camada === 'programacao') return Object.values(PROGRAMACAO)
  if (camada === 'avanco') return [
    { id: '0', label: '0%', cor: '#cbd5e1' },
    { id: '1-39', label: '1–39%', cor: '#7dd3fc' },
    { id: '40-74', label: '40–74%', cor: '#38bdf8' },
    { id: '75-99', label: '75–99%', cor: '#2563eb' },
    { id: '100', label: '100%', cor: '#166534' },
    { id: 'sem-dados', label: 'Sem dados', cor: SEM_DADOS },
  ]
  if (camada === 'desvio') return [
    { id: 'critico', label: 'Abaixo de -5 p.p.', cor: '#dc2626' },
    { id: 'atencao', label: '-5 a -2 p.p.', cor: '#f97316' },
    { id: 'limite', label: '-2 a +2 p.p.', cor: '#d97706' },
    { id: 'positivo', label: 'Acima de +2 p.p.', cor: '#16a34a' },
    { id: 'sem-dados', label: 'Sem dados', cor: SEM_DADOS },
  ]

  const responsaveis = new Map<string, ItemLegendaCamada>()
  for (const setor of setores) {
    if (setor.engenheiro) responsaveis.set(setor.engenheiro, { id: setor.engenheiro, label: setor.engenheiro, cor: setor.corEngenheiro })
  }
  return [...responsaveis.values(), { id: 'sem-responsavel', label: 'Sem responsável', cor: SEM_DADOS }]
}

export function resolverProgramacaoHoje(taskUids: Iterable<string>, atividades: { taskUid?: string | null; status: 'pendente' | 'concluida' | 'parcial' | 'nao_concluida' }[]): ProgramacaoHoje {
  const ids = new Set(taskUids)
  if (ids.size === 0) return 'sem_vinculo'
  const relacionadas = atividades.filter((atividade) => atividade.taskUid && ids.has(atividade.taskUid))
  if (relacionadas.length === 0) return 'nao_programado'
  if (relacionadas.some((atividade) => atividade.status === 'nao_concluida')) return 'nao_concluida'
  if (relacionadas.every((atividade) => atividade.status === 'concluida')) return 'concluida'
  if (relacionadas.some((atividade) => atividade.status === 'parcial')) return 'em_execucao'
  return 'programada'
}
