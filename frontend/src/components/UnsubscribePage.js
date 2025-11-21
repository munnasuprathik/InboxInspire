import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import API_CONFIG from '@/config/api';

const API = API_CONFIG.API_BASE;

export function UnsubscribePage() {
  // Get email from URL query parameters
  const getEmailFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("email") || "";
  };

  const [email, setEmail] = useState(getEmailFromUrl());
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("pending"); // pending, success, error
  const [error, setError] = useState("");

  useEffect(() => {
    // Update page title
    document.title = "Unsubscribe | Tend";
  }, []);

  const handleUnsubscribe = async () => {
    if (!email) {
      setError("Email address is required");
      setStatus("error");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.post(
        `${API}/unsubscribe`,
        null,
        {
          params: { email },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status === "success") {
        setStatus("success");
        toast.success(response.data.message || "Successfully unsubscribed");
        // Refresh the page after a short delay to update dashboard if user is logged in
        setTimeout(() => {
          if (window.location.pathname !== "/unsubscribe") {
            window.location.reload();
          }
        }, 2000);
      } else {
        setError(response.data.message || "Failed to unsubscribe");
        setStatus("error");
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.detail ||
        err.message ||
        "Failed to unsubscribe. Please try again.";
      setError(errorMessage);
      setStatus("error");
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border border-border/50 shadow-sm">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Mail className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl font-semibold">Unsubscribe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {status === "pending" && (
            <>
              <div className="space-y-2 text-center">
                <p className="text-sm text-muted-foreground">
                  {email ? (
                    <>
                      Click the button below to stop receiving emails from Tend.{" "}
                      <strong className="text-foreground">{email}</strong> will be unsubscribed from all emails.
                    </>
                  ) : (
                    "Email address not found. Please use the unsubscribe link from your email."
                  )}
                </p>
                {email && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Your account, goals, and progress will be preserved. You can reactivate notifications anytime in your settings.
                  </p>
                )}
              </div>

              {email && (
                <Button
                  onClick={handleUnsubscribe}
                  disabled={loading}
                  className="w-full"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Unsubscribe"
                  )}
                </Button>
              )}

              {error && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </>
          )}

          {status === "success" && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Unsubscribed Successfully</h3>
                <p className="text-sm text-muted-foreground">
                  You have been unsubscribed from all Tend emails. You will no longer receive
                  motivational messages from us.
                </p>
                <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
                  ✓ Your account and all your data (goals, streaks, progress) are preserved<br/>
                  ✓ You can reactivate email notifications anytime in your dashboard settings
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => (window.location.href = "/")}
                  variant="outline"
                  className="w-full"
                >
                  Return to Dashboard
                </Button>
                <Button
                  onClick={() => (window.location.href = "/#settings")}
                  variant="ghost"
                  className="w-full text-xs"
                >
                  Go to Settings
                </Button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Unsubscribe Failed</h3>
                <p className="text-sm text-muted-foreground">
                  {error || "An error occurred while processing your request. Please try again."}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleUnsubscribe}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    "Try Again"
                  )}
                </Button>
                <Button
                  onClick={() => (window.location.href = "/")}
                  variant="outline"
                  className="flex-1"
                >
                  Go Home
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

