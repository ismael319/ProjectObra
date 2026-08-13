import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CadastroPage } from "@/components/CadastroPage";
import { TIPOS_LIDERANCA } from "./lib/catalog";
import { useEmpresas } from "./lib/catalog";

// Uma subaba por Empresa (terceira) cadastrada — cada uma lista/gerencia só as
// lideranças daquela empresa. "Sem empresa" reúne o que ainda não foi
// associado (lideranças cadastradas antes dessa separação existir).
export default function CadLiderancas() {
  const { data: empresas = [] } = useEmpresas(false);
  const [tab, setTab] = useState("sem-empresa");

  const empresaOptions = useMemo(() => empresas.map((e) => ({ value: e.id, label: e.nome })), [empresas]);

  const fieldsFor = (empresaId: string | null) => [
    { key: "nome", label: "Nome", type: "text" as const, required: true },
    { key: "tipo", label: "Tipo", type: "select" as const, required: true,
      options: TIPOS_LIDERANCA.map((t) => ({ value: t, label: t })) },
    { key: "empresa_id", label: "Empresa", type: "select" as const, required: false,
      options: empresaOptions },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lideranças</h1>
        <p className="text-sm text-muted-foreground">Mestres, contramestres, encarregados e auxiliares, agrupados por empresa</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="sem-empresa">Sem empresa</TabsTrigger>
          {empresas.map((e) => (
            <TabsTrigger key={e.id} value={e.id} className={!e.ativo ? "opacity-50" : ""}>
              {e.nome}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="sem-empresa">
          <CadastroPage
            title="Lideranças sem empresa"
            description="Ainda não associadas a nenhuma empresa — edite e escolha a empresa pra mover pra subaba dela."
            table="liderancas"
            organizacaoScoped
            projetoScoped
            fields={fieldsFor(null)}
            extraColumns={[{ key: "tipo", label: "Tipo" }]}
            filter={{ column: "empresa_id", value: null }}
            blockRefs={[{ table: "apontamentos_diarios", fk: "lideranca_id", label: "apontamentos" }]}
          />
        </TabsContent>

        {empresas.map((e) => (
          <TabsContent key={e.id} value={e.id}>
            <CadastroPage
              title={`Lideranças — ${e.nome}`}
              table="liderancas"
              organizacaoScoped
              projetoScoped
              fields={fieldsFor(e.id)}
              extraColumns={[{ key: "tipo", label: "Tipo" }]}
              filter={{ column: "empresa_id", value: e.id }}
              defaultFieldValues={{ empresa_id: e.id }}
              blockRefs={[{ table: "apontamentos_diarios", fk: "lideranca_id", label: "apontamentos" }]}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
