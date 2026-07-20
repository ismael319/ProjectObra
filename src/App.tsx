import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth-context'
import { ProjectStoreProvider } from '@/lib/project-store'
import { ProjectProvider } from '@/lib/project-context'
import { ThemeProvider } from '@/lib/theme-context'
import ProtectedRoute from '@/components/ProtectedRoute'

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
                      <Route path="gantt" element={<GanttChart />} />
                      <Route path="resources" element={<ResourceHistogram />} />
                      <Route path="daily" element={<DailyProgramming />} />
                      <Route path="occurrences" element={<Occurrences />} />
                      <Route path="labor" element={<LaborTracking />} />
                      <Route path="people" element={<ApontamentoDashboard />} />
                      <Route path="people/lancamento" element={<ApontamentoLancamento />} />
                      <Route path="people/validacao" element={<ApontamentoValidacao />} />
                      <Route path="people/consulta" element={<ApontamentoConsulta />} />
                      <Route path="people/resumo" element={<ApontamentoDashboard />} />
                      <Route path="people/evolucao" element={<ApontamentoEvolucao />} />
                      <Route path="people/exportar" element={<ApontamentoExportar />} />
                      <Route path="people/cadastro" element={<ApontamentoCadastro />} />
                      <Route path="people/eap" element={<ApontamentoEap />} />
                      <Route path="people/cronograma" element={<ApontamentoEapCronograma />} />
                      <Route path="people/importar-xml" element={<ApontamentoImportarXml />} />
                      <Route path="people/importar-eap" element={<ApontamentoImportarEap />} />
                      <Route path="security/rdr" element={<RdrDashboard />} />
                      <Route path="security/rdr/registros" element={<RdrRegistros />} />
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
