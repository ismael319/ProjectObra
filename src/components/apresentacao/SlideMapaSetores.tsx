import { Map } from 'lucide-react'

// Gestão à Vista (mapa-avanco: planta em imagem + grade de células coloridas
// por setor) não tem versão pública ainda — replicar o overlay de células
// numa função SECURITY DEFINER + renderer público é trabalho à parte, fora
// desta fase. Fica reservado no enum (tipo_tela já aceita) pra não exigir
// migração de novo quando isso for implementado.
export default function SlideMapaSetores() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gray-950 text-white/40">
      <Map size={48} />
      <p className="text-lg">Mapa de Setores — em breve</p>
    </div>
  )
}
