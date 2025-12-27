// src/App.tsx
import { BrowserRouter } from "react-router-dom"
import Navbar from "./components/ui/navbar/Navbar"
import Footer from "./components/ui/Footer"
import AppRoutes from "./routes/AppRoutes" // 경로 변경


const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen w-full max-w-screen-3xl mx-auto bg-black text-gray-100">
        <Navbar />
        <main className="mx-auto pt-16">
          <AppRoutes />
        </main>
        <Footer />

      </div>
    </BrowserRouter>
  )
}

export default App
