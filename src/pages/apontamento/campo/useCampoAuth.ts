import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const CAMPO_EMAIL = import.meta.env.VITE_CAMPO_EMAIL as string | undefined;
const CAMPO_PASSWORD = import.meta.env.VITE_CAMPO_PASSWORD as string | undefined;

interface CampoAuthState {
  ready: boolean;
  error: string | null;
}

// Login silencioso com a conta compartilhada de campo — a pessoa nunca vê tela
// de login. O Supabase persiste a sessão em localStorage por padrão, então só a
// primeira abertura precisa de conexão; recargas seguintes reaproveitam a sessão
// salva e funcionam offline.
export function useCampoAuth(): CampoAuthState & { retry: () => void } {
  const [state, setState] = useState<CampoAuthState>({ ready: false, error: null });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function ensureSignedIn() {
      setState({ ready: false, error: null });

      if (!CAMPO_EMAIL || !CAMPO_PASSWORD) {
        if (!cancelled) {
          setState({ ready: false, error: "Configuração da conta de campo ausente. Contate o administrador." });
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      // Só reaproveita a sessão existente se for da própria conta de campo —
      // este navegador pode ter uma sessão de outra conta (ex.: alguém que já
      // usou o dashboard normal neste mesmo aparelho), e nesse caso a página
      // precisa trocar para a conta compartilhada, não herdar privilégios de
      // quem estava logado antes.
      if (data.session && data.session.user.email === CAMPO_EMAIL) {
        if (!cancelled) setState({ ready: true, error: null });
        return;
      }
      if (data.session) {
        await supabase.auth.signOut();
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: CAMPO_EMAIL,
        password: CAMPO_PASSWORD,
      });
      if (cancelled) return;
      if (error) {
        setState({ ready: false, error: "Não foi possível conectar. Verifique a internet e tente novamente." });
        return;
      }
      setState({ ready: true, error: null });
    }

    ensureSignedIn();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, retry };
}
