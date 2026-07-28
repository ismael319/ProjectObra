import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'
import { useProjects } from '@/lib/project-store'
import { askChatbot, type ChatMessage } from '@/lib/chat-api'

// Assistente de IA flutuante — consulta dados reais do cronograma do projeto
// atual via tool-calling no servidor (api/chat.ts), nunca "inventa" resposta.
export default function ChatWidget() {
  const { currentProject } = useProjects()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  if (!currentProject) return null

  const handleSend = async () => {
    const texto = input.trim()
    if (!texto || loading) return
    const historico = messages
    setMessages((prev) => [...prev, { role: 'user', content: texto }])
    setInput('')
    setLoading(true)
    try {
      const resposta = await askChatbot(currentProject.id, texto, historico)
      setMessages((prev) => [...prev, { role: 'assistant', content: resposta }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao consultar o assistente'
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] max-h-[560px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3.5 bg-gray-900 dark:bg-gray-950 text-white">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold truncate">Assistente do Projeto</p>
              <p className="text-[11px] text-gray-400">Consulta dados em tempo real</p>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto text-gray-400 hover:text-white shrink-0">
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[11px] font-medium border-b border-blue-100 dark:border-blue-900/40 truncate">
            📌 Escopo atual: {currentProject.nome}
          </div>

          <div ref={bodyRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-gray-50 dark:bg-gray-900/40 min-h-[240px]">
            {messages.length === 0 && (
              <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-8">
                Pergunte sobre atividades, prazos e atrasos do cronograma deste projeto.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] text-[13px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-auto bg-blue-600 text-white rounded-2xl rounded-br-sm px-3.5 py-2'
                    : 'mr-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5'
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="mr-auto flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 px-1">
                <Loader2 size={13} className="animate-spin" /> pensando...
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 p-2.5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Pergunte sobre o projeto..."
              disabled={loading}
              className="flex-1 border border-gray-200 dark:border-gray-600 rounded-full px-3.5 py-2 text-[13px] bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="w-9 h-9 shrink-0 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center transition"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center hover:scale-105 transition"
        title="Assistente do Projeto"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  )
}
