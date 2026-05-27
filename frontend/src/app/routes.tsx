import React, { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { DashboardLayout } from "./components/DashboardLayout";
import { ProtectedRoute } from "./components/protected-route";

const LoginPage        = lazy(() => import("./components/pages/login").then(m => ({ default: m.LoginPage })));
const SignupPage       = lazy(() => import("./components/pages/signup").then(m => ({ default: m.SignupPage })));
const ResetPasswordPage = lazy(() => import("./components/pages/reset-password").then(m => ({ default: m.ResetPasswordPage })));
const DashboardPage    = lazy(() => import("./components/pages/dashboard").then(m => ({ default: m.DashboardPage })));
const TelemetryData    = lazy(() => import("./components/pages/telemetry").then(m => ({ default: m.TelemetryData })));
const AnomalyLogs      = lazy(() => import("./components/pages/logs").then(m => ({ default: m.AnomalyLogs })));
const VisualInspection = lazy(() => import("./components/pages/visual-inspection").then(m => ({ default: m.VisualInspection })));
const SettingsPage     = lazy(() => import("./components/pages/settings").then(m => ({ default: m.SettingsPage })));
const HistoryPage      = lazy(() => import("./components/pages/history").then(m => ({ default: m.HistoryPage })));
const ResultsPage      = lazy(() => import("./components/pages/results").then(m => ({ default: m.ResultsPage })));
const ScanDetailPage   = lazy(() => import("./components/pages/scan-detail").then(m => ({ default: m.ScanDetailPage })));

const PageLoader = () => (
  <div className="flex items-center justify-center h-64 font-mono text-[0.7rem] text-muted-foreground">
    LOADING...
  </div>
);

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Lazy><LoginPage /></Lazy>,
  },
  {
    path: "/signup",
    element: <Lazy><SignupPage /></Lazy>,
  },
  {
    path: "/reset-password",
    element: <Lazy><ResetPasswordPage /></Lazy>,
  },
  {
    path: "/",
    Component: ProtectedRoute,
    children: [
      {
        path: "/",
        Component: DashboardLayout,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: "dashboard",
            element: <Lazy><DashboardPage /></Lazy>,
          },
          {
            path: "telemetry",
            element: <Lazy><TelemetryData /></Lazy>,
          },
          {
            path: "logs",
            element: <Lazy><AnomalyLogs /></Lazy>,
          },
          {
            path: "visual-inspection",
            element: <Lazy><VisualInspection /></Lazy>,
          },
          {
            path: "settings",
            element: <Lazy><SettingsPage /></Lazy>,
          },
          {
            path: "history",
            element: <Lazy><HistoryPage /></Lazy>,
          },
          {
            path: "results",
            element: <Lazy><ResultsPage /></Lazy>,
          },
          {
            path: "scan/:id",
            element: <Lazy><ScanDetailPage /></Lazy>,
          },
        ]
      }
    ],
  },
]);
