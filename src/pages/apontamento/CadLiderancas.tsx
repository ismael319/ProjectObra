import { CadastroPage } from "./components/CadastroPage";
import { TIPOS_LIDERANCA } from "./lib/catalog";

export default function CadLiderancas() {
  return (
    <CadastroPage
      title="Lideranças"
      description="Mestres, contramestres, encarregados e auxiliares"
      table="liderancas"
      fields={[
        { key: "nome", label: "Nome", type: "text", required: true },
        { key: "tipo", label: "Tipo", type: "select", required: true,
          options: TIPOS_LIDERANCA.map((t) => ({ value: t, label: t })) },
      ]}
      extraColumns={[{ key: "tipo", label: "Tipo" }]}
    />
  );
}
