import { CadastroPage } from "@/components/CadastroPage";

const TIPOS_FORNECEDOR = [
  { value: "propria", label: "Usina própria" },
  { value: "externa", label: "Fornecedor externo" },
];

export default function CadFornecedores() {
  return (
    <CadastroPage
      title="Fornecedores"
      description="Usina própria e fornecedores externos de concreto"
      table="fornecedores_concreto"
      fields={[
        { key: "nome", label: "Nome", type: "text", required: true },
        { key: "tipo", label: "Tipo", type: "select", required: true, options: TIPOS_FORNECEDOR },
      ]}
      extraColumns={[
        {
          key: "tipo",
          label: "Tipo",
          render: (row) => TIPOS_FORNECEDOR.find((t) => t.value === row.tipo)?.label ?? row.tipo,
        },
      ]}
      organizacaoScoped
      timestamps={false}
      blockRefs={[{ table: "cargas_concreto", fk: "fornecedor_id", label: "cargas de concreto" }]}
      moduloKey="qualidade"
    />
  );
}
