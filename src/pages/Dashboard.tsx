import { useState } from 'react'
import { Search, Bell } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import KPICards from '@/components/KPICards'
import { StatusPieChart, MonthlyBarChart, ProgressAreaChart } from '@/components/Charts'
import RecentProjects from '@/components/RecentProjects'
import { useAuth } from '@/lib/auth-context'

export default function Dashboard() {
  const { user } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* Main content */}
      <main className="lg:ml-64 pt-16 lg:pt-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Bem-vindo de volta, {user?.email?.split('@')[0]}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center bg-gray-100 rounded-lg px-4 py-2">
                <Search size={18} className="text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar projetos..."
                  className="bg-transparent border-none outline-none ml-2 text-sm text-gray-700 w-48"
                />
              </div>
              <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
                <Bell size={20} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* KPI Cards */}
          <KPICards />

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StatusPieChart />
            <MonthlyBarChart />
          </div>

          {/* Progress Chart */}
          <ProgressAreaChart />

          {/* Recent Projects */}
          <RecentProjects />
        </div>
      </main>
    </div>
  )
}
