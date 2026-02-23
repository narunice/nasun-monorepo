/**
 * Baram AER - Main App Component
 *
 * Dashboard-based layout with sidebar navigation:
 * - / -> Dashboard Overview
 * - /agents -> Agent List
 * - /agents/:id -> Agent Detail
 * - /aer -> Execution Report Timeline
 * - /chat -> Chat Interface (integrated into DashboardLayout)
 * - /callback -> zkLogin OAuth callback
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { DashboardLayout } from './layouts/DashboardLayout';
import AuthCallback from './pages/AuthCallback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardOverview } from './pages/DashboardOverview';
import { AgentList } from './pages/AgentList';
import { AgentDetail } from './pages/AgentDetail';
import { AERTimeline } from './pages/AERTimeline';
import { ChatPage } from './pages/ChatPage';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Routes>
          <Route path="/callback" element={<AuthCallback />} />
          <Route
            path="*"
            element={
              <DashboardLayout>
                <Routes>
                  <Route path="/" element={<DashboardOverview />} />
                  <Route path="/agents" element={<AgentList />} />
                  <Route path="/agents/:id" element={<AgentDetail />} />
                  <Route path="/aer" element={<AERTimeline />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </DashboardLayout>
            }
          />
        </Routes>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
