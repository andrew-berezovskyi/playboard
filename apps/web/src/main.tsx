import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './chess-i18n';
import './styles.css';
import './luxury.css';
import './chess.css';
import App from './App';
import { SessionProvider } from './session';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);

import './product-i18n';
import './product.css';

import './polish-i18n';
import './polish.css';
