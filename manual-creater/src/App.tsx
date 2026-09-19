import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "./components/Layout";
import { TemplateList } from "./components/TemplateList";
import { TemplateForm } from "./components/TemplateForm";
import { ToolList } from "./components/ToolList";
import { TempNodeCommands } from "./components/TempNodeCommands";
import { SqlTemplates } from "./pages/SqlTemplates";
import { ProfileSettings } from "./components/ProfileSettings";

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TemplateList />} />
          <Route path="template/:templateId" element={<TemplateForm />} />
          <Route path="tools" element={<ToolList />} />
          <Route path="temp-node" element={<TempNodeCommands />} />
          <Route path="sql-templates" element={<SqlTemplates />} />
          <Route path="profile" element={<ProfileSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
