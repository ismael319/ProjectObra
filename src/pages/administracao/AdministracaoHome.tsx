import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardGeral from "./tabs/DashboardGeral";
import Funcionarios from "./tabs/Funcionarios";
import Documentacao from "./tabs/Documentacao";
import EfetivoDoDia from "./tabs/EfetivoDoDia";
import Demissoes from "./tabs/Demissoes";
import Transferencias from "./tabs/Transferencias";
import CadastroCargos from "./tabs/CadastroCargos";

const ABAS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "funcionarios", label: "Funcionários" },
  { value: "documentacao", label: "Documentação e Treinamentos" },
  { value: "efetivo", label: "Efetivo do Dia" },
  { value: "demissoes", label: "Demissões" },
  { value: "transferencias", label: "Transferências" },
  { value: "cargos", label: "Cadastro de Cargos" },
] as const;

export default function AdministracaoHome() {
  const [aba, setAba] = useState<string>("dashboard");

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

        <TabsContent value="dashboard" className="space-y-4">
          {aba === "dashboard" && <DashboardGeral />}
        </TabsContent>
        <TabsContent value="funcionarios" className="space-y-4">
          {aba === "funcionarios" && <Funcionarios />}
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
        <TabsContent value="transferencias" className="space-y-4">
          {aba === "transferencias" && <Transferencias />}
        </TabsContent>
        <TabsContent value="cargos" className="space-y-4">
          {aba === "cargos" && <CadastroCargos />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
