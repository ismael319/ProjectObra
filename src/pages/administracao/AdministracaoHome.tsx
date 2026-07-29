import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FuncionariosAtivos from "./tabs/FuncionariosAtivos";
import Documentacao from "./tabs/Documentacao";
import EfetivoDoDia from "./tabs/EfetivoDoDia";
import Demissoes from "./tabs/Demissoes";

const ABAS = [
  { value: "ativos", label: "Funcionários Ativos" },
  { value: "documentacao", label: "Documentação e Treinamentos" },
  { value: "efetivo", label: "Efetivo do Dia" },
  { value: "demissoes", label: "Demissões" },
] as const;

export default function AdministracaoHome() {
  const [aba, setAba] = useState<string>("ativos");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administração</h1>
        <p className="text-sm text-muted-foreground">Controle de Efetivo — cadastro de funcionários, documentação e reconciliação de ponto.</p>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="h-auto flex-wrap">
          {ABAS.map((a) => (
            <TabsTrigger key={a.value} value={a.value}>{a.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ativos" className="space-y-4">
          {aba === "ativos" && <FuncionariosAtivos />}
        </TabsContent>
        <TabsContent value="documentacao" className="space-y-4">
          {aba === "documentacao" && <Documentacao />}
        </TabsContent>
        <TabsContent value="efetivo" className="space-y-4">
          {aba === "efetivo" && <EfetivoDoDia />}
        </TabsContent>
        <TabsContent value="demissoes" className="space-y-4">
          {aba === "demissoes" && <Demissoes />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
