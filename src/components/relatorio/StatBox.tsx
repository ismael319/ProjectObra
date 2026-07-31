import { COR } from './paleta'

// Compartilhado entre o card por Área (diário) e o card por Engenheiro (semanal) —
// mesmo resumo de aderência (Concluídas/Não concluídas/Aderência) nos dois.
export default function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl py-4 text-center" style={{ backgroundColor: COR.white }}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[11px] mt-0.5" style={{ color: COR.gray500 }}>{label}</p>
    </div>
  )
}
