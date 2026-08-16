import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface ChatbotPreferenceContextType {
  chatbotEnabled: boolean
  toggleChatbot: () => void
}

const ChatbotPreferenceContext = createContext<ChatbotPreferenceContextType | undefined>(undefined)

// Por padrão o chatbot vem desativado para todo mundo — só liga quem
// escolher isso explicitamente no menu do perfil.
export function ChatbotPreferenceProvider({ children }: { children: ReactNode }) {
  const [chatbotEnabled, setChatbotEnabled] = useState(() => {
    return localStorage.getItem('chatbotEnabled') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('chatbotEnabled', String(chatbotEnabled))
  }, [chatbotEnabled])

  const toggleChatbot = () => setChatbotEnabled((prev) => !prev)

  return (
    <ChatbotPreferenceContext.Provider value={{ chatbotEnabled, toggleChatbot }}>
      {children}
    </ChatbotPreferenceContext.Provider>
  )
}

export function useChatbotPreference() {
  const context = useContext(ChatbotPreferenceContext)
  if (!context) throw new Error('useChatbotPreference must be used within ChatbotPreferenceProvider')
  return context
}
