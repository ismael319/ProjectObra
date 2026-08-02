import { Link } from "react-router-dom"
import { LayoutDashboard, ClipboardList, PlusCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function RdrHome() {
  const links = [
    {
      to: "/dashboard/seguranca/dashboard",
      icon: LayoutDashboard,
      title: "Dashboard RDR",
      description: "Visão geral de desvios e reconhecimentos",
    },
    {
      to: "/dashboard/seguranca/novo",
      icon: PlusCircle,
      title: "Novo Registro",
      description: "Registrar desvio ou reconhecimento",
    },
    {
      to: "/dashboard/seguranca/registros",
      icon: ClipboardList,
      title: "Registros",
      description: "Consultar, editar e exportar registros",
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Segurança — RDR</h1>
        <p className="text-sm text-muted-foreground">Registro de Desvios e Reconhecimentos</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link key={l.to} to={l.to}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <l.icon size={18} className="text-primary" />
                  {l.title}
                </CardTitle>
                <CardDescription>{l.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
