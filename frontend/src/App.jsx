import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import { ToastProvider } from "./lib/toastContext";

const Feed = lazy(() => import("./pages/Feed"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Lojas = lazy(() => import("./pages/Lojas"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Chat = lazy(() => import("./pages/Chat"));
const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));
const Amigos = lazy(() => import("./pages/Amigos"));
const MaePerfil = lazy(() => import("./pages/MaePerfil"));

function PageLoading() {
  return (
    <div className="page-loader" aria-label="Carregando página...">
      <div className="loader-spinner"></div>
      <p>Carregando materniaClub...</p>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Navbar />
        <main>
          <Suspense fallback={<PageLoading />}>
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
          </Suspense>
        </main>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
