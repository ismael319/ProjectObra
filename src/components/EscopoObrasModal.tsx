import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Projeto = { id: string; nome: string; codigo: string | null }
type Escopo = 'todos' | 'vinculados'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  usuarioId: string
  usuarioEmail: string | null
  organizacaoId: string
}

export default function EscopoObrasModal({ open, onOpenChange, usuarioId, usuarioEmail, organizacaoId }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [escopo, setEscopo] = useState<Escopo>('todos')
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function carregar() {
      setLoading(true)
      const [{ data: perfil, error: perfilError }, { data: projetosData, error: projetosError }, { data: acessos, error: acessosError }] = await Promise.all([
        supabase.from('user_profiles').select('escopo_projetos').eq('id', usuarioId).single(),
        supabase.from('projetos').select('id,nome,codigo').eq('organizacao_id', organizacaoId).order('nome'),
        supabase.from('projeto_usuarios').select('projeto_id').eq('user_id', usuarioId),
      ])

      if (cancelled) return
      if (perfilError || projetosError || acessosError) {
        toast.error('Não foi possível carregar as obras permitidas.')
        setLoading(false)
        return
      }

      setEscopo(perfil?.escopo_projetos === 'vinculados' ? 'vinculados' : 'todos')
      setProjetos((projetosData ?? []) as Projeto[])
      setSelecionados(new Set((acessos ?? []).map((acesso) => acesso.projeto_id)))
      setLoading(false)
    }

    carregar()
    return () => { cancelled = true }
  }, [open, organizacaoId, usuarioId])

  function toggle(projetoId: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(projetoId)) proximo.delete(projetoId)
      else proximo.add(projetoId)
      return proximo
    })
  }

  async function salvar() {
    if (escopo === 'vinculados' && selecionados.size === 0) {
      toast.error('Selecione pelo menos uma obra ou escolha acesso a todas.')
      return
    }

    setSaving(true)
    try {
      const ids = [...selecionados]
      const { error } = await supabase.rpc('definir_escopo_projetos', {
        p_usuario_id: usuarioId,
        p_escopo: escopo,
        p_projeto_ids: ids,
      })
      if (error) throw error

      toast.success(escopo === 'todos' ? 'Acesso liberado para todas as obras.' : 'Obras permitidas atualizadas.')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o acesso às obras.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Obras permitidas</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Defina quais obras {usuarioEmail ?? 'este usuário'} pode acessar. A regra também vale para consultas diretas ao banco e exportações.
        </p>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <input type="radio" checked={escopo === 'todos'} onChange={() => setEscopo('todos')} className="mt-1" />
              <span><strong className="block text-sm">Todas as obras</strong><span className="text-xs text-muted-foreground">Acesso a qualquer obra atual ou criada no futuro nesta empresa.</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <input type="radio" checked={escopo === 'vinculados'} onChange={() => setEscopo('vinculados')} className="mt-1" />
              <span><strong className="block text-sm">Obras específicas</strong><span className="text-xs text-muted-foreground">Acesso somente às obras marcadas abaixo.</span></span>
            </label>
            {escopo === 'vinculados' && (
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border p-3">
                {projetos.map((projeto) => (
                  <label key={projeto.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={selecionados.has(projeto.id)} onCheckedChange={() => toggle(projeto.id)} />
                    {projeto.codigo ? `${projeto.codigo} - ` : ''}{projeto.nome}
                  </label>
                ))}
                {projetos.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma obra cadastrada nesta empresa.</p>}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={loading || saving}>{saving ? 'Salvando...' : 'Salvar acesso'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
