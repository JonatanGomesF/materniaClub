import { BrowserRouter, Route, Routes } from "react-router-dom";

import Navbar from "./components/Navbar";
import Admin from "./pages/Admin";
import Chat from "./pages/Chat";
import Feed from "./pages/Feed";
import Login from "./pages/Login";
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
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
