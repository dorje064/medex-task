import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './api/useCatalog';
import { App } from './App';
import { applyMockQuery } from './mocks/controller';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

async function start() {
  applyMockQuery(window.location.search);
  // There is no real backend, so the mock API also runs in production builds.
  // Requests sent before the worker is ready would bypass it, so wait for it.
  const { worker } = await import('./mocks/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
  root.render(
    <StrictMode>
      <App queryClient={createQueryClient()} />
    </StrictMode>,
  );
}

start().catch((error: unknown) => {
  console.error(error);
  root.render(
    <main className="page">
      <h1>Find health services</h1>
      <p role="alert">
        This demo needs service workers to simulate its API, and your browser blocked them (private windows often do).
        Please open it in a regular window.
      </p>
    </main>,
  );
});
