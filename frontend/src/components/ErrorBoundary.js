import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Check if it's a rendering error (objects as React children)
    if (error?.message?.includes('Objects are not valid as a React child')) {
      console.warn('Rendering error detected - likely an object being rendered directly');
      // Try to recover by clearing potentially corrupted state
      try {
        // Clear any potentially corrupted localStorage/sessionStorage
        const keysToCheck = ['user', 'userData', 'formData', 'adminToken'];
        keysToCheck.forEach(key => {
          try {
            const item = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (item) {
              const parsed = JSON.parse(item);
              // If it contains objects where strings are expected, clear it
              if (parsed && typeof parsed === 'object') {
                const hasInvalidData = Object.values(parsed).some(val => 
                  val && typeof val === 'object' && !Array.isArray(val) && 
                  ('use_default_config' in val || 'config' in val)
                );
                if (hasInvalidData) {
                  localStorage.removeItem(key);
                  sessionStorage.removeItem(key);
                  console.warn(`Cleared potentially corrupted storage key: ${key}`);
                }
              }
            }
          } catch {}
        });
      } catch (e) {
        console.warn('Error during recovery:', e);
      }
    }

    this.setState({
      error,
      errorInfo,
    });

    // You can also log the error to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    // Clear potentially corrupted state
    try {
      // Clear localStorage/sessionStorage
      const keysToClear = ['user', 'userData', 'formData'];
      keysToClear.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
    } catch (e) {
      console.warn('Error clearing storage:', e);
    }

    // Reset error boundary state
    this.setState({ hasError: false, error: null, errorInfo: null });
    
    // Reload the page to get fresh data
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <Card className="max-w-2xl w-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <CardTitle>Something went wrong</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We encountered an error while rendering this page. This might be due to corrupted data.
              </p>
              
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm font-mono text-red-800 break-all">
                    {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <details className="mt-2">
                      <summary className="text-xs text-red-600 cursor-pointer">Stack trace</summary>
                      <pre className="text-xs mt-2 overflow-auto max-h-40 text-red-700">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={this.handleReset} className="flex-1">
                  Reload Page
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                  className="flex-1"
                >
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

