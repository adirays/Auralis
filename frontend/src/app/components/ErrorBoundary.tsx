import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center h-screen gap-4"
          style={{ background: '#030712', color: '#E2E8F0' }}
        >
          <p className="font-mono text-[0.75rem] text-red-400 tracking-wider">
            APPLICATION ERROR
          </p>
          <p className="font-mono text-[0.65rem] text-muted-foreground max-w-md text-center">
            {this.state.message || 'An unexpected error occurred.'}
          </p>
          <button
            className="font-mono text-[0.7rem] px-4 py-2 mt-2"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8' }}
            onClick={() => window.location.reload()}
          >
            RELOAD
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
