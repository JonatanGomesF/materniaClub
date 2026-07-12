import { BrowserRouter, Route, Routes } from "react-router-dom";

import Navbar from "./components/Navbar";
import Admin from "./pages/Admin";
import Amigos from "./pages/Amigos";
import Chat from "./pages/Chat";
import Feed from "./pages/Feed";
import Login from "./pages/Login";
import Lojas from "./pages/Lojas";
import MaePerfil from "./pages/MaePerfil";
import Marketplace from "./pages/Marketplace";
import Perfil from "./pages/Perfil";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/lojas" element={<Lojas />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/amigos" element={<Amigos />} />
          <Route path="/maes/:id" element={<MaePerfil />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
