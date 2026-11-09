import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './ui/Layout';
import { EventsPage } from './pages/EventsPage';
import { EventFormPage } from './pages/EventFormPage';
import { EventWorkspacePage } from './pages/EventWorkspacePage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<EventsPage />} />
        <Route path="/events/new" element={<EventFormPage />} />
        <Route path="/events/:eventId" element={<EventWorkspacePage />} />
        <Route path="/events/:eventId/edit" element={<EventFormPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
