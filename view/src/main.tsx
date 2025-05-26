// Importa StrictMode para ajudar a identificar problemas na aplicação React
import { StrictMode } from 'react'
// Importa a função para criar a raiz da aplicação React (React 18+)
import { createRoot } from 'react-dom/client'
// Importa o CSS global da aplicação
import './index.css'
// Importa o componente principal da aplicação
import App from './App.tsx'

// Renderiza a aplicação React dentro do elemento com id 'root'
// StrictMode ativa verificações extras em desenvolvimento
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
