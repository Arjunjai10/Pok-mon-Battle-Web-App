import { Routes, Route, Navigate } from "react-router-dom";
import TeamBuilder from "./pages/TeamBuilder.jsx";
import Lobby from "./pages/Lobby.jsx";
import Battle from "./pages/Battle.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/"            element={<TeamBuilder />} />
      <Route path="/lobby"       element={<Lobby />} />
      <Route path="/battle/:id"  element={<Battle />} />
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  );
}
