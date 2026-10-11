import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root')!;

// `?next` loads the new engine shell until Milestone A replaces the legacy app.
if (new URLSearchParams(window.location.search).has('next')) {
  void import('../app/main').then(({ mountNextApp }) => mountNextApp(root));
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
