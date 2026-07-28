import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { MultiCombobox } from '@/components/ui/combobox'
import type { ColunaConfig } from '@/lib/sienge/report-config'
import type { ItemComClassificacao } from '@/lib/sienge/types'
import type { FiltroValor } from '@/lib/sienge/column-filters'
import { opcoesUnicas } from '@/lib/sienge/column-filters'

interface Props {
  colunas: ColunaConfig[]
  itens: ItemComClassificacao[]
  filtros: Record<string, FiltroValor>
  onChange: (filtros: Record<string, FiltroValor>) => void
}

const FAIXAS_DIAS = [
  { valor: '7' as const, rotulo: 'Mais de 7 dias' },
  { valor: '15' as const, rotulo: 'Mais de 15 dias' },
  { valor: '30' as const, rotulo: '30+ dias' },
]

function ChipButton({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded-full text-xs border transition-colors ${
        ativo
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-input text-gray-600 dark:text-gray-300 hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

export default function SiengeColumnFilters({ colunas, itens, filtros, onChange }: Props) {
  const colunasComFiltro = colunas.filter((c) => c.filtro)
  if (colunasComFiltro.length === 0) return null

  function set(key: string, valor: FiltroValor) {
    onChange({ ...filtros, [key]: valor })
  }

  const temFiltroAtivo = Object.values(filtros).some(
    (f) => f.texto || (f.selecionados && f.selecionados.length > 0) || f.de || f.ate || f.faixa
  )

  return (
    <div className="flex flex-wrap items-end gap-3">
      {colunasComFiltro.map((col) => {
        const filtro = filtros[col.key] ?? {}
        const tipoFiltro = col.filtro!

        if (tipoFiltro.kind === 'texto') {
          return (
            <div key={col.key} className="w-40">
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{col.label}</label>
              <Input
                value={filtro.texto ?? ''}
                onChange={(e) => set(col.key, { ...filtro, texto: e.target.value })}
                placeholder="Buscar..."
                className="h-8 text-xs"
              />
            </div>
          )
        }

        if (tipoFiltro.kind === 'dropdown') {
          const opcoes = opcoesUnicas(itens, col.key).map((v) => ({ value: v, label: v }))
          return (
            <div key={col.key} className="w-48">
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{col.label}</label>
              <MultiCombobox
                options={opcoes}
                value={filtro.selecionados ?? []}
                onChange={(v) => set(col.key, { ...filtro, selecionados: v })}
                className="h-8 text-xs"
              />
            </div>
          )
        }

        if (tipoFiltro.kind === 'chips') {
          const selecionados = new Set(filtro.selecionados ?? [])
          return (
            <div key={col.key} className="max-w-full">
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{col.label}</label>
              <div className="flex flex-wrap gap-1">
                {tipoFiltro.opcoes.map((op) => (
                  <ChipButton
                    key={op}
                    ativo={selecionados.has(op)}
                    onClick={() => {
                      const next = new Set(selecionados)
                      if (next.has(op)) next.delete(op)
                      else next.add(op)
                      set(col.key, { ...filtro, selecionados: [...next] })
                    }}
                  >
                    {op}
                  </ChipButton>
                ))}
              </div>
            </div>
          )
        }

        if (tipoFiltro.kind === 'dias-faixa') {
          return (
            <div key={col.key}>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{col.label}</label>
              <div className="flex gap-1">
                {FAIXAS_DIAS.map((f) => (
                  <ChipButton
                    key={f.valor}
                    ativo={filtro.faixa === f.valor}
                    onClick={() => set(col.key, { ...filtro, faixa: filtro.faixa === f.valor ? undefined : f.valor })}
                  >
                    {f.rotulo}
                  </ChipButton>
                ))}
              </div>
            </div>
          )
        }

        if (tipoFiltro.kind === 'data') {
          return (
            <div key={col.key} className="flex gap-1 items-end">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{col.label} de</label>
                <input
                  type="date"
                  value={filtro.de ?? ''}
                  onChange={(e) => set(col.key, { ...filtro, de: e.target.value })}
                  className="h-8 px-2 rounded-md border border-input bg-background text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">até</label>
                <input
                  type="date"
                  value={filtro.ate ?? ''}
                  onChange={(e) => set(col.key, { ...filtro, ate: e.target.value })}
                  className="h-8 px-2 rounded-md border border-input bg-background text-xs"
                />
              </div>
            </div>
          )
        }

        return null
      })}

      {temFiltroAtivo && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline mb-1.5"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}
