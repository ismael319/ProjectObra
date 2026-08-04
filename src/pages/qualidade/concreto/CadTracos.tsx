import { CadastroPage } from "@/components/CadastroPage";

export default function CadTracos() {
  return (
    <CadastroPage
      title="Traços"
      description="Receitas de concreto: resistência e consumo de insumos por m³"
      table="tracos_concreto"
      fields={[
        { key: "nome", label: "Nome", type: "text", required: true },
        { key: "fck_mpa", label: "Fck (MPa)", type: "number", required: true },
        { key: "consumo_cimento_kg_m3", label: "Cimento (kg/m³)", type: "number" },
        { key: "consumo_brita00_kg_m3", label: "Brita 0 (kg/m³)", type: "number" },
        { key: "consumo_brita01_kg_m3", label: "Brita 1 (kg/m³)", type: "number" },
        { key: "consumo_po_brita_kg_m3", label: "Pó de brita (kg/m³)", type: "number" },
        { key: "consumo_areia_kg_m3", label: "Areia (kg/m³)", type: "number" },
        { key: "consumo_agua_l_m3", label: "Água (l/m³)", type: "number" },
        { key: "consumo_aditivo1_l_m3", label: "Aditivo 1 (l/m³)", type: "number" },
        { key: "consumo_aditivo2_l_m3", label: "Aditivo 2 (l/m³)", type: "number" },
        { key: "preco_unitario_m3", label: "Preço unitário (R$/m³)", type: "number" },
      ]}
      extraColumns={[
        { key: "fck_mpa", label: "Fck (MPa)", render: (row) => (row.fck_mpa != null ? String(row.fck_mpa) : "—") },
        {
          key: "preco_unitario_m3",
          label: "Preço/m³",
          render: (row) => (row.preco_unitario_m3 != null ? `R$ ${Number(row.preco_unitario_m3).toFixed(2)}` : "—"),
        },
      ]}
      organizacaoScoped
      timestamps={false}
      blockRefs={[{ table: "cargas_concreto", fk: "traco_id", label: "cargas de concreto" }]}
    />
  );
}
