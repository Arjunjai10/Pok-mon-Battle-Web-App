import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import TeamBuilder from "./pages/TeamBuilder.jsx";
import Lobby from "./pages/Lobby.jsx";
import Battle from "./pages/Battle.jsx";
import { SocketProvider } from "./context/SocketContext.jsx";

function SocketLayout() {
  return (
    <SocketProvider>
      <Outlet />
    </SocketProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TeamBuilder />} />
      <Route element={<SocketLayout />}>
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/battle/:id" element={<Battle />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
