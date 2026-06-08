import { Navigate, Route, Routes } from 'react-router-dom';

import AppRoutesIOS from './AppRoutesIOS';
import DefaultRedirect from './components/DefaultRedirect';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import HumanPage from './features/human/HumanPage';
import { getIsMobile } from './lib/platform';
import Accounts from './pages/Accounts';
import Home from './pages/Home';
import Intelligence from './pages/Intelligence';
import Invites from './pages/Invites';
import Notifications from './pages/Notifications';
import Onboarding from './pages/onboarding/Onboarding';
import { PttOverlayPage } from './pages/PttOverlayPage';
import Rewards from './pages/Rewards';
import Routines from './pages/Routines';
import Settings from './pages/Settings';
import Skills from './pages/Skills';
import WebCallbackPage from './pages/WebCallbackPage';
import Welcome from './pages/Welcome';
import WorkflowNew from './pages/WorkflowNew';
import WorkflowsRun from './pages/WorkflowsRun';

const AppRoutes = () => {
  // Mobile target (iOS or Android): pair → Human/Chat/Settings only.
  // Desktop routes are not rendered.
  if (getIsMobile()) {
    return <AppRoutesIOS />;
  }

  return (
    <Routes>
      {/* Public routes - redirect to /home if logged in */}
      <Route
        path="/"
        element={
          <PublicRoute>
            <Welcome />
          </PublicRoute>
        }
      />

      <Route path="/callback/:kind" element={<WebCallbackPage />} />
      <Route path="/callback/:kind/:status" element={<WebCallbackPage />} />

      {/* Onboarding (full-page stepper, gated by onboarding_completed) */}
      <Route
        path="/onboarding/*"
        element={
          <ProtectedRoute requireAuth={true}>
            <Onboarding />
          </ProtectedRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/home"
        element={
          <ProtectedRoute requireAuth={true}>
            <Home />
          </ProtectedRoute>
        }
      />

      <Route
        path="/human"
        element={
          <ProtectedRoute requireAuth={true}>
            <HumanPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/intelligence"
        element={
          <ProtectedRoute requireAuth={true}>
            <Intelligence />
          </ProtectedRoute>
        }
      />

      {/* Connections page lives at /connections (Phase 2 rename from /skills).
          The old /skills path is kept as a back-compat redirect so bookmarks
          and deep links continue to work.  `?tab=` query params are preserved
          by Navigate (replace) so existing deep links still land on the right
          sub-tab.
          `/workflows/new` is the create-a-skill authoring page.
          Order matters: keep `/workflows/new` before `/connections` so it wins
          the prefix match. */}
      <Route
        path="/workflows/new"
        element={
          <ProtectedRoute requireAuth={true}>
            <WorkflowNew />
          </ProtectedRoute>
        }
      />

      <Route
        path="/workflows/run"
        element={
          <ProtectedRoute requireAuth={true}>
            <WorkflowsRun />
          </ProtectedRoute>
        }
      />

      <Route
        path="/connections"
        element={
          <ProtectedRoute requireAuth={true}>
            <Skills />
          </ProtectedRoute>
        }
      />

      {/* Back-compat: /skills → /connections (preserves ?tab= deep links). */}
      <Route path="/skills" element={<Navigate to="/connections" replace />} />

      {/* Unified chat = agent + connected web apps. Replaces the old
          /conversations and /accounts routes. */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute requireAuth={true}>
            <Accounts />
          </ProtectedRoute>
        }
      />

      {/* Back-compat: /channels was an orphaned standalone page; it now
          redirects to the unified Connections page on the Messaging tab. */}
      <Route path="/channels" element={<Navigate to="/connections?tab=messaging" replace />} />

      <Route
        path="/invites"
        element={
          <ProtectedRoute requireAuth={true}>
            <Invites />
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute requireAuth={true}>
            <Notifications />
          </ProtectedRoute>
        }
      />

      <Route
        path="/routines"
        element={
          <ProtectedRoute requireAuth={true}>
            <Routines />
          </ProtectedRoute>
        }
      />

      <Route
        path="/rewards"
        element={
          <ProtectedRoute requireAuth={true}>
            <Rewards />
          </ProtectedRoute>
        }
      />

      {/* Workflows moved onto the Intelligence page (its own tab). Keep the
          old /workflows path working as a deep link into that tab. */}
      <Route path="/workflows" element={<Navigate to="/intelligence?tab=workflows" replace />} />

      <Route path="/webhooks" element={<Navigate to="/settings/webhooks-triggers" replace />} />

      <Route
        path="/settings/*"
        element={
          <ProtectedRoute requireAuth={true}>
            <Settings />
          </ProtectedRoute>
        }
      />

      <Route path="/ptt-overlay" element={<PttOverlayPage />} />

      {/* Default redirect based on auth status */}
      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  );
};

export default AppRoutes;
