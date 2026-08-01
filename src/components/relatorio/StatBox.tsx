import { COR } from './paleta'

// Compartilhado entre o card por Área (diário) e o card por Engenheiro (semanal) —
// mesmo resumo de aderência (Concluídas/Não concluídas/Aderência) nos dois.
export default function StatBox({
  label,
  value,
  color,
  detalhe,
}: {
  label: string
  value: string
  color: string
  /** Legenda extra abaixo do rótulo — usada no box de Aderência pra mostrar a fração
   * "concluídas/total" por trás do percentual. */
  detalhe?: string
}) {
  return (
    <div className="rounded-2xl py-4 text-center" style={{ backgroundColor: COR.white }}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[11px] mt-0.5" style={{ color: COR.gray500 }}>{label}</p>
      {detalhe && <p className="text-[10px] mt-0.5" style={{ color: COR.gray400 }}>{detalhe}</p>}
    </div>
  )
}
