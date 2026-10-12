import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NextApp } from './NextApp';

// `/` serves the world map and legends. Old `/?next` links still work: the flag is ignored.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NextApp />
  </StrictMode>,
);
