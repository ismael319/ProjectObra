import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTiposDocumento, useDocumentosFuncionario } from "@/lib/administracao/catalog";
import { renovarDocumento, type FuncionarioRow } from "@/lib/administracao/db";
import { VencimentoPill } from "../status-pills";
import { todayISO } from "@/pages/apontamento/lib/date-utils";

interface Props {
  organizacaoId: string;
  userId?: string | null;
  funcionario: FuncionarioRow;
  onClose: () => void;
}

function diasParaVencer(dataVencimento: string): number {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  const venc = new Date(`${dataVencimento}T00:00:00Z`);
  return Math.round((venc.getTime() - hoje.getTime()) / 86_400_000);
}

function RenovarInline({ onRenovar }: { onRenovar: (data: string) => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(todayISO());
  const [salvando, setSalvando] = useState(false);

  if (!aberto) {
    return (
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>Renovar</Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        value={data}
        onChange={(e) => setData(e.target.value)}
      />
      <Button
        size="sm"
        disabled={salvando}
        onClick={async () => {
          setSalvando(true);
          try {
            await onRenovar(data);
            setAberto(false);
          } finally {
            setSalvando(false);
          }
        }}
      >
        {salvando ? <Loader2 size={14} className="animate-spin" /> : "Salvar"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
    </div>
  );
}

export default function DocumentosFuncionarioModal({ organizacaoId, userId, funcionario, onClose }: Props) {
  const qc = useQueryClient();
  const { data: tipos = [], isLoading: carregandoTipos } = useTiposDocumento(organizacaoId);
  const { data: documentos = [], isLoading: carregandoDocs } = useDocumentosFuncionario(funcionario.id);

  const documentoPorTipo = new Map(documentos.map((d) => [d.tipo_documento_id, d]));

  async function handleRenovar(tipoDocumentoId: string, validadeDias: number, dataEmissao: string) {
    try {
      await renovarDocumento({ organizacaoId, funcionarioId: funcionario.id, tipoDocumentoId, validadeDias, dataEmissao, userId });
      toast.success("Documento renovado.");
      qc.invalidateQueries({ queryKey: ["documentos_funcionario", funcionario.id] });
      qc.invalidateQueries({ queryKey: ["alertas_documentos", organizacaoId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Documentos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{funcionario.nome} — Mat. {funcionario.matricula}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {(carregandoTipos || carregandoDocs) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-blue-600" size={24} />
            </div>
          ) : tipos.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum tipo de documento cadastrado nesta empresa.</p>
          ) : (
            tipos.map((tipo) => {
              const doc = documentoPorTipo.get(tipo.id);
              const dias = doc ? diasParaVencer(doc.data_vencimento) : null;
              return (
                <div key={tipo.id} className="flex items-center justify-between gap-3 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{tipo.nome}</p>
                    {doc ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Emitido {doc.data_emissao} · vence {doc.data_vencimento}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 dark:text-gray-500">Não cadastrado</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {dias !== null && dias > 30 ? (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">Em dia</span>
                    ) : dias !== null ? (
                      <VencimentoPill diasParaVencer={dias} />
                    ) : null}
                    <RenovarInline onRenovar={(data) => handleRenovar(tipo.id, tipo.validade_dias, data)} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
