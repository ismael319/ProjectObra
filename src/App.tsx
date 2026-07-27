import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth-context'
import { ProjectStoreProvider } from '@/lib/project-store'
import { ProjectProvider } from '@/lib/project-context'
import { ThemeProvider } from '@/lib/theme-context'
import ProtectedRoute from '@/components/ProtectedRoute'
import SessionOnlyRoute from '@/components/SessionOnlyRoute'
import RequireModulo from '@/components/RequireModulo'

const queryClient = new QueryClient()

const Home = lazy(() => import('@/pages/Home'))
const Login = lazy(() => import('@/pages/Login'))
const Signup = lazy(() => import('@/pages/Signup'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const UpdatePassword = lazy(() => import('@/pages/UpdatePassword'))
const DashboardLayout = lazy(() => import('@/pages/DashboardLayout'))
const DashboardHome = lazy(() => import('@/pages/DashboardHome'))
const SCurve = lazy(() => import('@/pages/SCurve'))
const GanttChart = lazy(() => import('@/pages/GanttChart'))
const ResourceHistogram = lazy(() => import('@/pages/ResourceHistogram'))
const DailyProgramming = lazy(() => import('@/pages/DailyProgramming'))
const Occurrences = lazy(() => import('@/pages/Occurrences'))
const LaborTracking = lazy(() => import('@/pages/LaborTracking'))
const ProjectSelection = lazy(() => import('@/pages/ProjectSelection'))
const Activities = lazy(() => import('@/pages/Activities'))
const Profile = lazy(() => import('@/pages/Profile'))
const PendingApproval = lazy(() => import('@/pages/PendingApproval'))
const UserApprovalManagement = lazy(() => import('@/pages/UserApprovalManagement'))
const OrganizacoesManagement = lazy(() => import('@/pages/admin/OrganizacoesManagement'))

// Apontamento pages
const ApontamentoLancamento = lazy(() => import('@/pages/apontamento/Lancamento'))
const ApontamentoValidacao = lazy(() => import('@/pages/apontamento/Validacao'))
const ApontamentoConsulta = lazy(() => import('@/pages/apontamento/Consulta'))
const ApontamentoDashboard = lazy(() => import('@/pages/apontamento/Dashboard'))
const ApontamentoEvolucao = lazy(() => import('@/pages/apontamento/Evolucao'))
const ApontamentoExportar = lazy(() => import('@/pages/apontamento/Exportar'))
const ApontamentoCadastro = lazy(() => import('@/pages/apontamento/Cadastro'))
const ApontamentoEap = lazy(() => import('@/pages/apontamento/EAP'))
const ApontamentoEapCronograma = lazy(() => import('@/pages/apontamento/EapCronograma'))
const ApontamentoImportarXml = lazy(() => import('@/pages/apontamento/ImportarXML'))
const ApontamentoImportarEap = lazy(() => import('@/pages/apontamento/ImportarEAP'))
const MapaChuvas = lazy(() => import('@/pages/apontamento/MapaChuvas'))

// Segurança
const RdrDashboard = lazy(() => import('@/pages/seguranca/RdrDashboard'))
const RdrRegistros = lazy(() => import('@/pages/seguranca/RdrRegistros'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <ProjectStoreProvider>
            <ProjectProvider>
              <Toaster richColors position="top-right" />
              <BrowserRouter>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/update-password" element={<UpdatePassword />} />

                    <Route
                      path="/aguardando-aprovacao"
                      element={
                        <SessionOnlyRoute>
                          <PendingApproval />
                        </SessionOnlyRoute>
                      }
                    />

                    <Route
                      path="/"
                      element={
                        <ProtectedRoute>
                          <Home />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/projects"
                      element={
                        <ProtectedRoute>
                          <ProjectSelection />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <Profile />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <DashboardLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<DashboardHome />} />
                      <Route path="activities" element={<Activities />} />
                      <Route path="planning" element={<SCurve />} />
                      <Route path="gantt" element={<RequireModulo modulo="engenharia"><GanttChart /></RequireModulo>} />
                      <Route path="resources" element={<ResourceHistogram />} />
                      <Route path="daily" element={<RequireModulo modulo="engenharia"><DailyProgramming /></RequireModulo>} />
                      <Route path="occurrences" element={<Occurrences />} />
                      <Route path="labor" element={<LaborTracking />} />
                      <Route path="people" element={<RequireModulo modulo="engenharia"><ApontamentoDashboard /></RequireModulo>} />
                      <Route path="people/lancamento" element={<RequireModulo modulo="engenharia"><ApontamentoLancamento /></RequireModulo>} />
                      <Route path="people/validacao" element={<RequireModulo modulo="engenharia"><ApontamentoValidacao /></RequireModulo>} />
                      <Route path="people/consulta" element={<RequireModulo modulo="engenharia"><ApontamentoConsulta /></RequireModulo>} />
                      <Route path="people/resumo" element={<RequireModulo modulo="engenharia"><ApontamentoDashboard /></RequireModulo>} />
                      <Route path="people/evolucao" element={<RequireModulo modulo="engenharia"><ApontamentoEvolucao /></RequireModulo>} />
                      <Route path="people/exportar" element={<RequireModulo modulo="engenharia"><ApontamentoExportar /></RequireModulo>} />
                      <Route path="people/cadastro" element={<RequireModulo modulo="engenharia"><ApontamentoCadastro /></RequireModulo>} />
                      <Route path="people/eap" element={<RequireModulo modulo="engenharia"><ApontamentoEap /></RequireModulo>} />
                      <Route path="people/cronograma" element={<RequireModulo modulo="engenharia"><ApontamentoEapCronograma /></RequireModulo>} />
                      <Route path="people/importar-xml" element={<RequireModulo modulo="engenharia"><ApontamentoImportarXml /></RequireModulo>} />
                      <Route path="people/importar-eap" element={<RequireModulo modulo="engenharia"><ApontamentoImportarEap /></RequireModulo>} />
                      <Route path="mapa-chuvas" element={<RequireModulo modulo="engenharia"><MapaChuvas /></RequireModulo>} />
                      <Route path="security/rdr" element={<RequireModulo modulo="seguranca"><RdrDashboard /></RequireModulo>} />
                      <Route path="security/rdr/registros" element={<RequireModulo modulo="seguranca"><RdrRegistros /></RequireModulo>} />
                      <Route path="admin/users" element={<UserApprovalManagement />} />
                      <Route path="admin/organizacoes" element={<OrganizacoesManagement />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/projects" replace />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </ProjectProvider>
          </ProjectStoreProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
