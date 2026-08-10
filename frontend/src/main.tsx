import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './theme'
import { DialogHost } from './components/ui/dialogs'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
    {/* Рядом с App, а не внутри: свои диалоги нужны и на экране входа, и за
        дверью, а туда App даже не доходит — возвращает Gate/Auth раньше. */}
    <DialogHost />
  </ThemeProvider>
)
