import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import AppLayout from './components/AppLayout';
import Diagram from './pages/Diagram';
import History from './pages/History';
import Home from './pages/Home';
import Knowledge from './pages/Knowledge';
import Permissions from './pages/Permissions';
import Projects from './pages/Projects';
import Settings from './pages/Settings';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Standalone full-screen work areas (no sidebar) */}
        <Route path="/workspace" element={<App />} />
        <Route path="/diagram/:runId" element={<Diagram />} />

        {/* Pages inside the dock layout */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/permissions" element={<Permissions />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
