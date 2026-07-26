import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type PapelUsuario = 'admin' | 'gestor' | 'engenheiro' | 'campo'
export type StatusSolicitacao = 'pendente' | 'aprovado' | 'rejeitado'

interface UserProfile {
  papel: PapelUsuario | null
  status_solicitacao: StatusSolicitacao
  organizacao_id: string | null
  is_super_admin: boolean
  organizacao_piloto: boolean
}

interface AuthContextType {
  session: Session | null
  user: User | null
  isLoading: boolean
  userProfile: UserProfile | null
  isLoadingProfile: boolean
  refetchProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error?: string }>
  updatePassword: (password: string) => Promise<{ error?: string }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    setIsLoadingProfile(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('papel, status_solicitacao, organizacao_id, is_super_admin, organizacoes(is_piloto)')
      .eq('id', userId)
      .single()

    if (data) {
      const organizacaoEmbutida = Array.isArray(data.organizacoes) ? data.organizacoes[0] : data.organizacoes
      setUserProfile({
        papel: data.papel,
        status_solicitacao: data.status_solicitacao,
        organizacao_id: data.organizacao_id,
        is_super_admin: data.is_super_admin,
        organizacao_piloto: organizacaoEmbutida?.is_piloto ?? false,
      })
    } else {
      setUserProfile(null)
    }
    setIsLoadingProfile(false)
  }

  useEffect(() => {
    if (!session?.user) {
      setUserProfile(null)
      setIsLoadingProfile(false)
      return
    }

    fetchProfile(session.user.id).catch(() => {
      setUserProfile(null)
      setIsLoadingProfile(false)
    })
  }, [session?.user])

  const refetchProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message }
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })
    return { error: error?.message }
  }

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    return { error: error?.message }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isLoading,
        userProfile,
        isLoadingProfile,
        refetchProfile,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
