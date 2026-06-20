import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { inject } from '@vercel/analytics'
import './index.css'
import App from './App.tsx'

inject()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/applications/:merchantId" element={<App />} />
        <Route path="/applications/:merchantId/reports/:requestId" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
