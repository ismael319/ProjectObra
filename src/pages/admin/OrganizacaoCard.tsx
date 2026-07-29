import { Settings2, Bell, Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuloRow {
  key: string
  nome: string
}

interface OrganizacaoRow {
  id: string
  nome: string
  is_piloto: boolean
  ativo: boolean
  criado_em: string
}

interface Props {
  organizacao: OrganizacaoRow
  modulosCatalogo: ModuloRow[]
  modulosAtivos: Set<string>
  pendentes: number
  convitesPendentes: number
  onGerenciar: () => void
}

export default function OrganizacaoCard({ organizacao, modulosCatalogo, modulosAtivos, pendentes, convitesPendentes, onGerenciar }: Props) {
  const modulosNomes = modulosCatalogo.filter((m) => modulosAtivos.has(m.key))

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition p-6 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        {organizacao.is_piloto ? <Badge variant="secondary">Piloto</Badge> : <Badge variant="outline">Cliente</Badge>}
        {organizacao.ativo ? <Badge variant="secondary">Ativa</Badge> : <Badge variant="destructive">Inativa</Badge>}
      </div>

      <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-1 mb-1">{organizacao.nome}</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
        Criada em {new Date(organizacao.criado_em).toLocaleDateString('pt-BR')}
      </p>

      {(pendentes > 0 || convitesPendentes > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {pendentes > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              <Bell size={11} /> {pendentes} solicitação{pendentes !== 1 ? 'ões' : ''} pendente{pendentes !== 1 ? 's' : ''}
            </span>
          )}
          {convitesPendentes > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              <Mail size={11} /> {convitesPendentes} convite{convitesPendentes !== 1 ? 's' : ''} aguardando
            </span>
          )}
        </div>
      )}

      <div className="mb-5 flex-1">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Módulos contratados</p>
        {modulosNomes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {modulosNomes.map((m) => (
              <span
                key={m.key}
                className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              >
                {m.nome}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Nenhum módulo contratado</p>
        )}
      </div>

      <button
        onClick={onGerenciar}
        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition text-sm"
      >
        <Settings2 size={16} /> Gerenciar
      </button>
    </div>
  )
}
