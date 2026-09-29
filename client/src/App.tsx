/**
 * Consistency Guard — route registry (merged).
 *
 * Public auth routes render outside the app shell. Everything else
 * requires a session and renders inside <AppShell/>.
 *
 * Core flow pages (auth → provider setup → evaluate) are owned by the
 * core-frontend agent. Analytics / secondary pages (dashboard, compare,
 * history, benchmarks, prompt intelligence, adversarial, reports,
 * settings) are owned by the secondary-pages agent. Both sets are real
 * pages — no placeholders.
 */
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { Toaster } from './components/ui';
import { LoadingState } from './components/ui/LoadingState';
import AppShell from './components/layout/AppShell';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import Auth from './pages/Auth';
import ProviderSetup from './pages/ProviderSetup';
import ModelSelection from './pages/ModelSelection';
import QuestionWorkspace from './pages/QuestionWorkspace';
import EvaluationRunning from './pages/EvaluationRunning';
import Results from './pages/Results';
import ModelDetail from './pages/ModelDetail';
import Dashboard from './pages/Dashboard';
import Compare from './pages/Compare';
import History from './pages/History';
import Benchmarks from './pages/Benchmarks';
import BenchmarkUpload from './pages/BenchmarkUpload';
import BenchmarkResults from './pages/BenchmarkResults';
import PromptIntelligence from './pages/PromptIntelligence';
import Adversarial from './pages/Adversarial';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Loading your workspace…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <AppShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Auth mode="login" />} />
              <Route path="/register" element={<Auth mode="register" />} />
              <Route path="/forgot-password" element={<Auth mode="forgot" />} />
              <Route path="/reset-password" element={<Auth mode="reset" />} />
              <Route element={<RequireAuth />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<RouteErrorBoundary pageName="the dashboard"><Dashboard /></RouteErrorBoundary>} />
                <Route path="/setup/providers" element={<RouteErrorBoundary pageName="provider setup"><ProviderSetup /></RouteErrorBoundary>} />
                <Route path="/evaluate/models" element={<RouteErrorBoundary pageName="model selection"><ModelSelection /></RouteErrorBoundary>} />
                <Route path="/evaluate/question" element={<RouteErrorBoundary pageName="the question workspace"><QuestionWorkspace /></RouteErrorBoundary>} />
                <Route path="/evaluate/running" element={<RouteErrorBoundary pageName="the evaluation runner"><EvaluationRunning /></RouteErrorBoundary>} />
                <Route path="/evaluate/:evaluationId/results" element={<RouteErrorBoundary pageName="the results page"><Results /></RouteErrorBoundary>} />
                <Route path="/evaluate/:evaluationId/model/:modelId" element={<RouteErrorBoundary pageName="the model detail page"><ModelDetail /></RouteErrorBoundary>} />
                <Route path="/compare" element={<RouteErrorBoundary pageName="compare"><Compare /></RouteErrorBoundary>} />
                <Route path="/benchmarks" element={<RouteErrorBoundary pageName="benchmarks"><Benchmarks /></RouteErrorBoundary>} />
                <Route path="/benchmarks/upload" element={<RouteErrorBoundary pageName="benchmark upload"><BenchmarkUpload /></RouteErrorBoundary>} />
                <Route path="/benchmarks/:benchmarkId/results" element={<RouteErrorBoundary pageName="benchmark results"><BenchmarkResults /></RouteErrorBoundary>} />
                <Route path="/prompt-intelligence" element={<RouteErrorBoundary pageName="prompt intelligence"><PromptIntelligence /></RouteErrorBoundary>} />
                <Route path="/adversarial" element={<RouteErrorBoundary pageName="adversarial testing"><Adversarial /></RouteErrorBoundary>} />
                <Route path="/history" element={<RouteErrorBoundary pageName="history"><History /></RouteErrorBoundary>} />
                <Route path="/reports" element={<RouteErrorBoundary pageName="reports"><Reports /></RouteErrorBoundary>} />
                <Route path="/settings" element={<RouteErrorBoundary pageName="settings"><Settings /></RouteErrorBoundary>} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
          {/* Toaster for the analytics pages' toast() calls (components/ui) */}
          <Toaster />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
