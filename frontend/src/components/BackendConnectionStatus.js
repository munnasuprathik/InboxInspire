import { useState, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import axios from "axios";
import API_CONFIG from '@/config/api';

export function BackendConnectionStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      const backendUrl = API_CONFIG.BACKEND_URL;
      if (!backendUrl || backendUrl === '') {
        setStatus('disconnected');
        setShowAlert(true);
        return;
      }

      try {
        const response = await axios.get(`${backendUrl}/api/health`, {
          timeout: 3000,
          validateStatus: () => true, // Don't throw on any status
        });
        if (response.status === 200) {
          setStatus('connected');
          setShowAlert(false);
        } else {
          setStatus('disconnected');
          setShowAlert(true);
        }
      } catch (error) {
        console.error('Backend connection check failed:', error);
        setStatus('disconnected');
        setShowAlert(true);
      }
    };

    checkConnection();
    // Check every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!showAlert && status === 'connected') {
    return null;
  }

  if (status === 'checking') {
    return (
      <div className="fixed top-4 right-4 z-50 max-w-md">
        <Alert className="bg-blue-50 border-blue-200">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <AlertTitle>Checking Backend Connection</AlertTitle>
        </Alert>
      </div>
    );
  }

  if (status === 'disconnected') {
    return (
      <div className="fixed top-4 right-4 z-50 max-w-md">
        <Alert variant="destructive" className="shadow-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Backend Not Connected</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Cannot connect to backend at <code className="text-xs bg-background px-1 py-0.5 rounded">{API_CONFIG.BACKEND_URL || 'http://localhost:8000'}</code>
            </p>
            <p className="text-sm font-medium">To start the backend:</p>
            <ol className="text-sm list-decimal list-inside space-y-1 ml-2">
              <li>Open a terminal in the project root</li>
              <li>Run: <code className="bg-background px-1 py-0.5 rounded">npm run backend</code></li>
              <li>Or: <code className="bg-background px-1 py-0.5 rounded">python -m uvicorn backend.server:app --reload --host 0.0.0.0 --port 8000</code></li>
            </ol>
            <button
              onClick={() => setShowAlert(false)}
              className="text-xs underline mt-2"
            >
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}

