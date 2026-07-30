import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CadFornecedores from "./CadFornecedores";
import CadTracos from "./CadTracos";

const TABS = [
  { value: "fornecedores", label: "Fornecedores", Component: CadFornecedores },
  { value: "tracos", label: "Traços", Component: CadTracos },
];

export default function CadastroConcretoPage() {
  return (
    <Tabs defaultValue="fornecedores" className="space-y-4">
      <TabsList className="h-auto flex-wrap">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
        ))}
      </TabsList>
      {TABS.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          <t.Component />
        </TabsContent>
      ))}
    </Tabs>
  );
}
