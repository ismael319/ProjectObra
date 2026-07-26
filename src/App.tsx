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
import RequireOrganizacaoPiloto from '@/components/RequireOrganizacaoPiloto'

const queryClient = new QueryClient()

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
                      <Route path="gantt" element={<RequireOrganizacaoPiloto><GanttChart /></RequireOrganizacaoPiloto>} />
                      <Route path="resources" element={<ResourceHistogram />} />
                      <Route path="daily" element={<RequireOrganizacaoPiloto><DailyProgramming /></RequireOrganizacaoPiloto>} />
                      <Route path="occurrences" element={<Occurrences />} />
                      <Route path="labor" element={<LaborTracking />} />
                      <Route path="people" element={<RequireOrganizacaoPiloto><ApontamentoDashboard /></RequireOrganizacaoPiloto>} />
                      <Route path="people/lancamento" element={<RequireOrganizacaoPiloto><ApontamentoLancamento /></RequireOrganizacaoPiloto>} />
                      <Route path="people/validacao" element={<RequireOrganizacaoPiloto><ApontamentoValidacao /></RequireOrganizacaoPiloto>} />
                      <Route path="people/consulta" element={<RequireOrganizacaoPiloto><ApontamentoConsulta /></RequireOrganizacaoPiloto>} />
                      <Route path="people/resumo" element={<RequireOrganizacaoPiloto><ApontamentoDashboard /></RequireOrganizacaoPiloto>} />
                      <Route path="people/evolucao" element={<RequireOrganizacaoPiloto><ApontamentoEvolucao /></RequireOrganizacaoPiloto>} />
                      <Route path="people/exportar" element={<RequireOrganizacaoPiloto><ApontamentoExportar /></RequireOrganizacaoPiloto>} />
                      <Route path="people/cadastro" element={<RequireOrganizacaoPiloto><ApontamentoCadastro /></RequireOrganizacaoPiloto>} />
                      <Route path="people/eap" element={<RequireOrganizacaoPiloto><ApontamentoEap /></RequireOrganizacaoPiloto>} />
                      <Route path="people/cronograma" element={<RequireOrganizacaoPiloto><ApontamentoEapCronograma /></RequireOrganizacaoPiloto>} />
                      <Route path="people/importar-xml" element={<RequireOrganizacaoPiloto><ApontamentoImportarXml /></RequireOrganizacaoPiloto>} />
                      <Route path="people/importar-eap" element={<RequireOrganizacaoPiloto><ApontamentoImportarEap /></RequireOrganizacaoPiloto>} />
                      <Route path="mapa-chuvas" element={<RequireOrganizacaoPiloto><MapaChuvas /></RequireOrganizacaoPiloto>} />
                      <Route path="security/rdr" element={<RequireOrganizacaoPiloto><RdrDashboard /></RequireOrganizacaoPiloto>} />
                      <Route path="security/rdr/registros" element={<RequireOrganizacaoPiloto><RdrRegistros /></RequireOrganizacaoPiloto>} />
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
