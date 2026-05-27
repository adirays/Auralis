import React from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ThemeProvider } from './components/ThemeContext';
import { AuthProvider } from './context/auth-context';
import { ScanProvider } from './context/scan-context';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <ScanProvider>
            <RouterProvider router={router} />
          </ScanProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
