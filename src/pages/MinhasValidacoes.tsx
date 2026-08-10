import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Loader2, ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { usePendenciasValidacao, useMeusRejeitados } from '@/lib/validacao/validacao-db'
import type { ValidacaoEntidade } from '@/lib/validacao/status'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatBR } from '@/lib/utils'

// Cada fluxo tem sua própria tela de validação, com o contexto que a decisão
// exige (destinos da carga, quantidades do apontamento, atividades da semana).
// Esta página só direciona — não duplica a ação.
const FLUXOS: Record<
  ValidacaoEntidade,
  { titulo: string; destino: string; correcao: string; descricao: string }
> = {
  carga_concreto: {
    titulo: 'Cargas de concreto',
    destino: '/dashboard/qualidade/concreto/validacao',
    // Corrigir é editar, e a edição da carga vive na tela de lançamento — não
    // na de validação, que só decide.
    correcao: '/dashboard/qualidade/concreto/lancamento',
    descricao: 'Conferir cargas lançadas e seus destinos.',
  },
  apontamento: {
    titulo: 'Apontamento de funcionários',
    destino: '/dashboard/people/validacao',
    // Aqui os dois caminhos coincidem: a tela de validação do apontamento tem
    // edição inline de cada registro.
    correcao: '/dashboard/people/validacao',
    descricao: 'Conferir efetivo e locais apontados por dia.',
  },
  programacao: {
    titulo: 'Programação semanal',
    destino: '/dashboard/daily',
    correcao: '/dashboard/daily',
    descricao: 'Confirmar a programação da semana.',
  },
}

export default function MinhasValidacoes() {
  const { data: pendencias = [], isLoading } = usePendenciasValidacao()
  const { data: rejeitados = [] } = useMeusRejeitados()

  const porEntidade = useMemo(() => {
    const mapa = new Map<ValidacaoEntidade, { etapa_nome: string; total: number }[]>()
    for (const p of pendencias) {
      const atual = mapa.get(p.entidade)
      const linha = { etapa_nome: p.etapa_nome, total: p.total }
      if (atual) atual.push(linha)
      else mapa.set(p.entidade, [linha])
    }
    return mapa
  }, [pendencias])

  const total = pendencias.reduce((soma, p) => soma + p.total, 0)

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck size={24} className="text-blue-600" />
          Minhas validações
        </h1>
        <p className="text-sm text-muted-foreground">
          Tudo que espera a sua conferência, nos três fluxos.
        </p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={16} /> Carregando…
        </div>
      )}

      {/* Primeiro o que voltou pra VOCÊ corrigir: é a única coisa aqui que está
          parada esperando uma ação sua e que ninguém mais pode destravar. */}
      {rejeitados.length > 0 && (
        <Card className="p-4 space-y-3 border-red-300 dark:border-red-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-medium flex items-center gap-2">
                <XCircle size={18} className="text-red-600" />
                Seus lançamentos rejeitados
              </h2>
              <p className="text-sm text-muted-foreground">
                Corrija o que foi apontado — ao editar o registro, ele volta para conferência
                automaticamente.
              </p>
            </div>
            <Badge variant="destructive" className="shrink-0">
              {rejeitados.length}
            </Badge>
          </div>

          <ul className="space-y-2">
            {rejeitados.map((r) => (
              <li
                key={`${r.entidade}-${r.registro_id}-${r.etapa_nome}`}
                className="rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 space-y-1"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-sm">{r.identificacao}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatBR(r.data_referencia)}
                  </span>
                </div>
                {r.motivo && <p className="text-sm">{r.motivo}</p>}
                <p className="text-xs text-muted-foreground">
                  {r.etapa_nome} · rejeitado por {r.rejeitado_por} em{' '}
                  {new Date(r.rejeitado_em).toLocaleString('pt-BR')}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-1">
                  <Link to={FLUXOS[r.entidade].correcao}>
                    Corrigir
                    <ArrowRight size={14} className="ml-1" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!isLoading && total === 0 && rejeitados.length === 0 && (
        <Card className="p-8 text-center space-y-2">
          <CheckCircle2 size={32} className="mx-auto text-green-600" />
          <p className="font-medium">Nada esperando por você.</p>
          <p className="text-sm text-muted-foreground">
            Quando algum lançamento precisar da sua conferência, ele aparece aqui.
          </p>
        </Card>
      )}

      {total > 0 && (
        <h2 className="text-sm font-medium text-muted-foreground pt-2">
          Aguardando sua conferência
        </h2>
      )}

      {[...porEntidade.entries()].map(([entidade, etapas]) => {
        const fluxo = FLUXOS[entidade]
        const somaFluxo = etapas.reduce((soma, e) => soma + e.total, 0)
        return (
          <Card key={entidade} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-medium">{fluxo.titulo}</h2>
                <p className="text-sm text-muted-foreground">{fluxo.descricao}</p>
              </div>
              <Badge variant="destructive" className="shrink-0">
                {somaFluxo}
              </Badge>
            </div>

            <ul className="space-y-1">
              {etapas.map((e) => (
                <li key={e.etapa_nome} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{e.etapa_nome}</span>
                  <span className="font-medium">{e.total}</span>
                </li>
              ))}
            </ul>

            <Button asChild variant="outline" size="sm">
              <Link to={fluxo.destino}>
                Ir para a tela
                <ArrowRight size={15} className="ml-1" />
              </Link>
            </Button>
          </Card>
        )
      })}
    </div>
  )
}
