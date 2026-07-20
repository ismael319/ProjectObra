import { useState, useRef, useEffect } from 'react'
import { X, Upload, FileText } from 'lucide-react'
import { parseMSProjectXML } from '@/lib/xml-parser'
import type { CronogramaInfo } from '@/lib/project-store'
import { CRON_COLORS_CONST } from '@/lib/project-store'

interface Props {
  open: boolean
  onClose: () => void
  onUpload: (cronograma: CronogramaInfo) => void
  existingCount: number
}

const TIPOS = ['Geral', 'Frente', 'Disciplina', 'Contratado', 'Outro'] as const

export default function CronogramaUploadModal({ open, onClose, onUpload, existingCount }: Props) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<CronogramaInfo['tipo']>('Geral')
  const [peso, setPeso] = useState(1)
  const [fileName, setFileName] = useState('')
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
    setError('')

    // Preencher nome automaticamente com o nome do arquivo (sem .xml)
    const nomeFromFileName = file.name.replace(/\.xml$/i, '')
    setNome(nomeFromFileName)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        parsedRef.current = parseMSProjectXML(text)
      } catch {
        setError('Erro ao parsear o arquivo XML. Verifique se é um arquivo MSPDI válido.')
        parsedRef.current = null
        setFileName('')
      }
    }
    reader.readAsText(file)
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
            <input ref={fileRef} type="file" accept=".xml" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition"
            >
              {fileName ? (
                <>
                  <FileText size={18} className="text-green-500" />
                  <span className="text-green-600 dark:text-green-400">{fileName}</span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Selecionar arquivo XML
                </>
              )}
            </button>
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
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Peso (0.1 - 10.0)</label>
              <input
                type="number"
                min={0.1}
                max={10}
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
