import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NextApp } from './NextApp';

export function mountNextApp(element: HTMLElement): void {
  createRoot(element).render(
    <StrictMode>
      <NextApp />
    </StrictMode>,
  );
}
