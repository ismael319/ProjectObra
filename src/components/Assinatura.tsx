import { resolverAssinatura, type AssinaturaEstilo } from '@/lib/assinatura'

interface Props {
  nome: string | null | undefined
  estilo: AssinaturaEstilo | null | undefined
  /** Função/cargo, impressa abaixo do traço. É o que dá valor ao carimbo num
   * documento: quem assinou e em que qualidade. */
  funcao?: string | null
  /** Data/hora da validação, ao lado da função. */
  data?: string | null
  tamanho?: 'sm' | 'md' | 'lg'
  /** Sem a linha horizontal e sem os dados de baixo — pra pré-visualizar o
   * traço na hora de escolher o estilo. */
  soTraco?: boolean
  className?: string
}

const ALTURA: Record<NonNullable<Props['tamanho']>, number> = {
  sm: 20,
  md: 28,
  lg: 40,
}

/**
 * Assinatura visual: o nome da pessoa na letra cursiva que ela escolheu.
 *
 * Não é assinatura digital com validade jurídica (certificado ICP-Brasil) — é o
 * equivalente ao carimbo/rubrica no papel, identificando quem respondeu por
 * aquele lançamento. Quem garante a autoria de verdade é o registro no banco
 * (usuario_id + data), que não passa por aqui.
 */
export default function Assinatura({
  nome,
  estilo,
  funcao,
  data,
  tamanho = 'md',
  soTraco = false,
  className = '',
}: Props) {
  const resolvido = resolverAssinatura(nome, estilo)
  if (!resolvido) return null

  const px = ALTURA[tamanho]
  // Usuário de antes desta tela existir não tem estilo: mostra o nome em letra
  // comum em vez de sumir com a autoria do documento.
  const semEstilo = !resolvido.estilo

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span
        style={
          resolvido.estilo
            ? {
                fontFamily: resolvido.estilo.fontFamily,
                fontSize: `${px * resolvido.estilo.escala}px`,
                lineHeight: 1.35,
              }
            : { fontSize: `${px * 0.6}px`, lineHeight: 1.35 }
        }
        className={semEstilo ? 'font-medium text-gray-700 dark:text-gray-200' : 'text-gray-900 dark:text-white'}
      >
        {resolvido.nome}
      </span>

      {!soTraco && (
        <>
          <span className="mt-0.5 border-t border-gray-400 dark:border-gray-500" />
          <span className="mt-0.5 text-[10px] leading-tight text-gray-500 dark:text-gray-400">
            {[funcao?.trim(), data?.trim()].filter(Boolean).join(' · ')}
          </span>
        </>
      )}
    </span>
  )
}
