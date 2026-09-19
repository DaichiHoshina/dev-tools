import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, useNavigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ActiveSessionsPage } from "./pages/ActiveSessionsPage";
import { SessionListPage } from "./pages/SessionListPage";
import { SessionDetailPage } from "./pages/SessionDetailPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { TerminalPage } from "./pages/TerminalPage";
import "./index.css";

function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <span className="text-5xl font-bold text-base-content/20">404</span>
      <p className="text-base-content/50 text-sm">ページが見つかりません</p>
      <button className="btn btn-sm btn-ghost" onClick={() => navigate("/")}>
        ホームに戻る
      </button>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<ActiveSessionsPage />} />
          <Route path="/history" element={<SessionListPage />} />
          <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/terminal" element={<TerminalPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </HashRouter>
  </StrictMode>,
);
