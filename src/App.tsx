import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { MockPanel } from './dev/MockPanel';
import { ExplorerPage } from './features/explorer/ExplorerPage';

export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <a className="skip-link" href="#results">
        Skip to results
      </a>
      <ExplorerPage />
      <MockPanel />
    </QueryClientProvider>
  );
}
