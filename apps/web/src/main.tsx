import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { ApiError } from './lib/api.js';
import { CurrentCreatorProvider } from './lib/current-creator.js';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx means the request was wrong, and repeating it will not fix that.
      // Only retry the failures that might be transient.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      staleTime: 5_000,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CurrentCreatorProvider>
          <App />
        </CurrentCreatorProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
