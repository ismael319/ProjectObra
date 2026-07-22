import { useState, useRef, useEffect } from 'react'
import { X, Upload, FileText } from 'lucide-react'
import { parseMSProjectXML, decodeXmlBytes } from '@/lib/xml-parser'
import type { CronogramaInfo } from '@/lib/project-store'
import { CRON_COLORS_CONST } from '@/lib/project-store'

interface Props {
  open: boolean
  onClose: () => void
  onUpload: (cronograma: CronogramaInfo) => void
  existingCount: number
}

const TIPOS = ['Geral', 'Frente', 'Disciplina', 'Contratado', 'Outro'] as const

type FileStage = 'idle' | 'reading' | 'parsing' | 'done'

export default function CronogramaUploadModal({ open, onClose, onUpload, existingCount }: Props) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<CronogramaInfo['tipo']>('Geral')
  const [peso, setPeso] = useState(1)
  const [fileName, setFileName] = useState('')
  const [fileSizeMB, setFileSizeMB] = useState(0)
  const [stage, setStage] = useState<FileStage>('idle')
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const parsedRef = useRef<ReturnType<typeof parseMSProjectXML> | null>(null)
  const nomeInputRef = useRef<HTMLInputElement>(null)

  const cor = CRON_COLORS_CONST[existingCount % CRON_COLORS_CONST.length]

  // ESC para fechar
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Focar no campo nome ao abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => nomeInputRef.current?.focus(), 100)
    }
  }, [open])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setFileSizeMB(file.size / 1024 / 1024)
    setError('')
    setStage('reading')
    setProgressPct(0)
    parsedRef.current = null

    // Preencher nome automaticamente com o nome do arquivo (sem .xml)
    const nomeFromFileName = file.name.replace(/\.xml$/i, '')
    setNome(nomeFromFileName)

    const reader = new FileReader()
    reader.onprogress = (ev) => {
      if (ev.lengthComputable) setProgressPct(Math.round((ev.loaded / ev.total) * 100))
    }
    reader.onload = (ev) => {
      setStage('parsing')
      setProgressPct(100)
      // Adia pro próximo tick — deixa o React pintar "Processando..." antes do parse
      // síncrono (pode ser pesado em arquivos grandes) travar a thread principal.
      setTimeout(() => {
        try {
          // Detecta o encoding pelo BOM em vez de assumir UTF-8 — exports do MS
          // Project costumam vir em UTF-16, e ler como UTF-8 corrompe o arquivo.
          const buffer = ev.target?.result as ArrayBuffer
          const text = decodeXmlBytes(buffer)
          parsedRef.current = parseMSProjectXML(text)
          setStage('done')
        } catch (err) {
          console.error('[CronogramaUpload] Falha ao parsear XML:', err)
          const detail = err instanceof Error ? err.message : String(err)
          setError(`Erro ao parsear o arquivo XML: ${detail}`)
          parsedRef.current = null
          setFileName('')
          setStage('idle')
        }
      }, 30)
    }
    reader.onerror = () => {
      console.error('[CronogramaUpload] Falha ao ler o arquivo:', reader.error)
      setError(`Erro ao ler o arquivo (${(file.size / 1024 / 1024).toFixed(1)} MB): ${reader.error?.message || 'motivo desconhecido'}.`)
      parsedRef.current = null
      setFileName('')
      setStage('idle')
    }
    reader.readAsArrayBuffer(file)
  }

  const handleUpload = () => {
    if (!nome.trim()) { setError('Informe o nome do cronograma.'); return }
    if (!parsedRef.current) { setError('Selecione um arquivo XML válido.'); return }

    setLoading(true)
    const cronograma: CronogramaInfo = {
      id: crypto.randomUUID(),
      nome: nome.trim(),
      descricao: descricao.trim(),
      tipo,
      versao: 1,
      ativo: true,
      peso,
      cor,
      dataUpload: new Date().toISOString(),
      dados: parsedRef.current,
    }
    onUpload(cronograma)
    setLoading(false)
    resetForm()
    onClose()
  }

  const resetForm = () => {
    setNome('')
    setDescricao('')
    setTipo('Geral')
    setPeso(1)
    setFileName('')
    setFileSizeMB(0)
    setStage('idle')
    setProgressPct(0)
    setError('')
    parsedRef.current = null
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upload de Cronograma</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Upload da arquivo */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Arquivo XML *</label>
            <input ref={fileRef} type="file" accept=".xml" onChange={handleFile} className="hidden" disabled={stage === 'reading' || stage === 'parsing'} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={stage === 'reading' || stage === 'parsing'}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:text-gray-600"
            >
              {fileName ? (
                <>
                  <FileText size={18} className={stage === 'done' ? 'text-green-500' : 'text-blue-500'} />
                  <span className={stage === 'done' ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}>{fileName}</span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Selecionar arquivo XML
                </>
              )}
            </button>

            {fileName && stage !== 'idle' && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>{fileSizeMB.toFixed(1)} MB</span>
                  <span>
                    {stage === 'reading' && `Lendo arquivo... ${progressPct}%`}
                    {stage === 'parsing' && 'Processando cronograma...'}
                    {stage === 'done' && 'Concluído'}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      stage === 'done' ? 'bg-green-500' : stage === 'parsing' ? 'bg-blue-500 animate-pulse' : 'bg-blue-500'
                    }`}
                    style={{ width: stage === 'reading' ? `${progressPct}%` : '100%' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Nome do Cronograma *</label>
            <input
              ref={nomeInputRef}
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Frente A - Estruturas"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {fileName && !nome && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">O nome será preenchido automaticamente ao selecionar o arquivo</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Descrição (opcional)</label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição do cronograma"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as CronogramaInfo['tipo'])}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Peso (peso contratual/orçamentário)</label>
              <input
                type="number"
                min={0.01}
                step={0.1}
                value={peso}
                onChange={(e) => setPeso(parseFloat(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cor }} />
            <span>Cor de identificação: {cor}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={() => { resetForm(); onClose() }} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">
            Cancelar
          </button>
          <button
            onClick={handleUpload}
            disabled={loading || !parsedRef.current}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Enviando...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
