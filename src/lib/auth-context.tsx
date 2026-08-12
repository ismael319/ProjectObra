import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { idbGet, idbSet } from '@/lib/idb-kv'

export type PapelUsuario = 'edicao' | 'visualizacao' | 'insercao_pontual'
export type StatusSolicitacao = 'pendente' | 'aprovado' | 'rejeitado'

interface UserProfile {
  papel: PapelUsuario | null
  status_solicitacao: StatusSolicitacao
  organizacao_id: string | null
  is_super_admin: boolean
  organizacao_piloto: boolean
  modulos: string[]
  // Overrides de papel por módulo (chave = modulo_key) — ausência de chave
  // pra um módulo = usa `papel` (o padrão global). Ver papelEfetivo().
  papelPorModulo: Record<string, PapelUsuario>
  nome: string | null
  funcao: string | null
  termos_aceitos_em: string | null
  versao_termos: string | null
}

// Papel que vale de fato NUM módulo específico: o override, se existir, senão
// o papel global — mesma regra de public.user_papel_modulo() no banco (a UI
// só usa isso pra decidir o que mostrar/habilitar; a RLS é quem barra de
// verdade).
export function papelEfetivo(userProfile: UserProfile | null, moduloKey: string): PapelUsuario | null {
  if (!userProfile) return null
  // Optional chaining: perfil vindo do cache local (IndexedDB, sem rede) pode
  // ser de uma sessão anterior à existência de papelPorModulo — trata como
  // "sem override" em vez de quebrar a tela.
  return userProfile.papelPorModulo?.[moduloKey] ?? userProfile.papel
}

interface AuthContextType {
  session: Session | null
  user: User | null
  isLoading: boolean
  userProfile: UserProfile | null
  isLoadingProfile: boolean
  precisaAceitarTermos: boolean
  perfilCompleto: boolean
  refetchProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, nome?: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error?: string }>
  updatePassword: (password: string) => Promise<{ error?: string }>
  aceitarTermos: () => Promise<void>
  completarPerfil: (nome: string, funcao: string) => Promise<{ error?: string }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [precisaAceitarTermos, setPrecisaAceitarTermos] = useState(false)
  const [perfilCompleto, setPerfilCompleto] = useState(false)

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

  // v2: bump depois da migração de papel pra edicao/visualizacao/insercao_pontual
  // — um usuário offline com cache antigo (papel: 'admin' etc.) força um
  // fetch novo em vez de reusar um valor que não existe mais.
  // v3: bump depois de adicionar papelPorModulo — cache antigo não tem esse
  // campo (papelEfetivo() também tem optional chaining como segunda proteção).
  const profileCacheKey = (userId: string) => `auth:profile:v3:${userId}`

  // O Supabase costuma disparar onAuthStateChange mais de uma vez logo no
  // boot (INITIAL_SESSION, depois outro evento) mesmo pro MESMO usuário —
  // cada disparo criava uma chamada de fetchProfile concorrente. Se a mais
  // antiga demorasse mais e terminasse DEPOIS de uma mais nova já ter
  // preenchido o perfil certinho, ela sobrescrevia userProfile com null (ou
  // um cache antigo do IndexedDB) por cima do valor correto — o que fazia o
  // ProtectedRoute achar que o perfil sumiu, mandar pra
  // /aguardando-aprovacao, e de lá o efeito da PendingApproval mandava de
  // volta pra "/" assim que o perfil se corrigisse sozinho no próximo
  // disparo. Esse contador garante que só a resposta da chamada MAIS RECENTE
  // é aplicada.
  const profileRequestId = useRef(0)

  const fetchProfile = async (userId: string) => {
    const requestId = ++profileRequestId.current
    setIsLoadingProfile(true)
    // Um round-trip só: organizacao_modulos vem embutido via o relacionamento
    // organizacoes -> organizacao_modulos (mesma FK que já trazia is_piloto),
    // em vez de uma segunda consulta em série depois de saber o organizacao_id.
    // user_modulos_visiveis é a restrição adicional por usuário (além do
    // contrato da empresa) — ausência de linhas = sem restrição.
    // user_papel_modulos são os overrides de papel por módulo — ausência de
    // linhas = usa o papel global em todo módulo (comportamento de hoje).
    const SELECT_COMPLETO = 'papel, status_solicitacao, organizacao_id, is_super_admin, nome, funcao, termos_aceitos_em, versao_termos, organizacoes(is_piloto, organizacao_modulos(modulo_key, ativo)), user_modulos_visiveis(modulo_key), user_papel_modulos(modulo_key, papel)'
    const SELECT_SEM_PAPEL_MODULO = 'papel, status_solicitacao, organizacao_id, is_super_admin, nome, funcao, termos_aceitos_em, versao_termos, organizacoes(is_piloto, organizacao_modulos(modulo_key, ativo)), user_modulos_visiveis(modulo_key)'
    const SELECT_SEM_MODULOS_VISIVEIS = 'papel, status_solicitacao, organizacao_id, is_super_admin, nome, funcao, organizacoes(is_piloto, organizacao_modulos(modulo_key, ativo))'

    let { data, error } = await supabase.from('user_profiles').select(SELECT_COMPLETO).eq('id', userId).single()

    // PGRST205 = PostgREST não achou a tabela — acontece se o frontend novo
    // subiu antes de rodar a migration correspondente no Supabase. Sem esse
    // retry, TODO login quebrava (a consulta inteira falhava por causa de
    // uma tabela que só afeta uma restrição/override opcional). Cai em
    // cascata: primeiro tenta sem user_papel_modulos (a mais nova das duas,
    // caso mais provável de ainda faltar), depois sem nenhum dos dois embeds.
    if (error?.code === 'PGRST205') {
      console.warn('user_papel_modulos ainda não existe no banco (rode papel-por-modulo-fundacao-migration.sql) — perfil carregado sem overrides de papel por módulo.')
      ;({ data, error } = await supabase.from('user_profiles').select(SELECT_SEM_PAPEL_MODULO).eq('id', userId).single())
    }
    if (error?.code === 'PGRST205') {
      console.warn('user_modulos_visiveis ainda não existe no banco (rode modulos-visiveis-migration.sql) — perfil carregado sem restrição de módulo por usuário.')
      ;({ data, error } = await supabase.from('user_profiles').select(SELECT_SEM_MODULOS_VISIVEIS).eq('id', userId).single())
    }

    if (requestId !== profileRequestId.current) return // uma chamada mais nova já respondeu — descarta esta

    if (error) console.error('Falha ao buscar o perfil do usuário.', error)

    if (data) {
      const organizacaoEmbutida = Array.isArray(data.organizacoes) ? data.organizacoes[0] : data.organizacoes
      const modulosEmbutidos = organizacaoEmbutida?.organizacao_modulos ?? []
      const modulosContratados = modulosEmbutidos.filter((m) => m.ativo).map((m) => m.modulo_key as string)
      const restricoesUsuario = (data.user_modulos_visiveis ?? []) as { modulo_key: string }[]
      const modulos = restricoesUsuario.length > 0
        ? modulosContratados.filter((m) => restricoesUsuario.some((r) => r.modulo_key === m))
        : modulosContratados
      const overridesPapel = (data.user_papel_modulos ?? []) as { modulo_key: string; papel: PapelUsuario }[]
      const papelPorModulo = Object.fromEntries(overridesPapel.map((o) => [o.modulo_key, o.papel]))
      const profile: UserProfile = {
        papel: data.papel,
        status_solicitacao: data.status_solicitacao,
        organizacao_id: data.organizacao_id,
        is_super_admin: data.is_super_admin,
        organizacao_piloto: organizacaoEmbutida?.is_piloto ?? false,
        modulos,
        papelPorModulo,
        nome: data.nome,
        funcao: data.funcao,
        termos_aceitos_em: data.termos_aceitos_em,
        versao_termos: data.versao_termos,
      }
      setUserProfile(profile)
      setPrecisaAceitarTermos(!data.termos_aceitos_em)
      setPerfilCompleto(!!(data.nome && data.funcao))
      idbSet(profileCacheKey(userId), profile).catch(() => {})
    } else {
      // Sem rede (apontador em campo), a busca acima não retorna `data` nem
      // lança — antes de derrubar o acesso, tenta o último perfil conhecido
      // salvo localmente na sessão anterior.
      const cached = await idbGet<UserProfile>(profileCacheKey(userId)).catch(() => undefined)
      if (requestId !== profileRequestId.current) return
      setUserProfile(cached ?? null)
      setPerfilCompleto(!!(cached?.nome && cached?.funcao))
    }
    setIsLoadingProfile(false)
  }

  useEffect(() => {
    // `session` começa em `null` (estado inicial) até getSession() resolver — sem
    // essa guarda, esse efeito rodava no primeiro render com session=null e já
    // dava por encerrado o carregamento (isLoadingProfile=false, userProfile=null),
    // MESMO com uma sessão real prestes a chegar. No F5, isso abria uma janela
    // (entre isLoading virar false e este efeito rebuscar o perfil do usuário
    // real) em que o ProtectedRoute via session+userProfile=null+isLoadingProfile
    // já false e mandava pra /aguardando-aprovacao — a tela "piscava" até o
    // perfil de verdade chegar e a PendingApproval mandar de volta sozinha.
    if (isLoading) return

    if (!session?.user) {
      setUserProfile(null)
      setIsLoadingProfile(false)
      return
    }

    fetchProfile(session.user.id).catch(() => {
      setUserProfile(null)
      setIsLoadingProfile(false)
    })
    // session?.user (não só o id): onAuthStateChange dispara com uma NOVA
    // instância de `session`/`user` a cada evento mesmo pro mesmo usuário —
    // usar só o id evita rebuscar o perfil à toa (e reabrir a janela da race
    // acima) toda vez que isso acontece.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, isLoading])

  const refetchProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message }
  }

  const signUp = async (email: string, password: string, nome?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: nome?.trim() ? { data: { nome: nome.trim() } } : undefined,
    })
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

  const aceitarTermos = async () => {
    const { error } = await supabase.rpc('aceitar_termos', { versao: '1.0' })
    if (!error) {
      setPrecisaAceitarTermos(false)
      await refetchProfile()
    }
  }

  const completarPerfil = async (nome: string, funcao: string) => {
    const { error } = await supabase.rpc('completar_perfil', { p_nome: nome, p_funcao: funcao })
    if (!error) {
      setPerfilCompleto(true)
      await refetchProfile()
    }
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
        precisaAceitarTermos,
        perfilCompleto,
        refetchProfile,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        aceitarTermos,
        completarPerfil,
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

// Papel efetivo do usuário logado NUM módulo específico, pra telas de
// lançamento decidirem o que habilitar/mostrar (RLS continua sendo quem
// barra de verdade — isso é só pra não deixar visualizacao tentar salvar e
// levar um erro genérico sem aviso prévio).
export function usePapelModulo(moduloKey: string) {
  const { userProfile } = useAuth()
  const papel = papelEfetivo(userProfile, moduloKey)
  return {
    papel,
    podeEditar: papel === 'edicao',
    podeInserir: papel === 'edicao' || papel === 'insercao_pontual',
  }
}
