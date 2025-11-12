import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import "@/index.css";
import App from "@/App";
import ErrorBoundary from "@/components/ErrorBoundary";

// Hide noisy ResizeObserver errors in dev overlay
if (typeof window !== "undefined") {
  const resizeObserverLoopErrRe = /ResizeObserver loop completed with undelivered notifications./;
  const resizeObserverLimitErrRe = /ResizeObserver loop limit exceeded/;

  const suppressIfResizeObserver = (message) => {
    if (!message) return false;
    return resizeObserverLoopErrRe.test(message) || resizeObserverLimitErrRe.test(message);
  };

  const originalConsoleError = console.error;
  console.error = (...args) => {
    if (args.length && typeof args[0] === "string" && resizeObserverLoopErrRe.test(args[0])) {
      return;
    }
    originalConsoleError(...args);
  };

  const originalWindowError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    if (suppressIfResizeObserver(message) || suppressIfResizeObserver(error?.message)) {
      return true;
    }
    if (typeof originalWindowError === "function") {
      return originalWindowError(message, source, lineno, colno, error);
    }
    return false;
  };

  window.addEventListener("error", (event) => {
    if (resizeObserverLoopErrRe.test(event.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (resizeObserverLimitErrRe.test(event.reason?.message || event.reason)) {
      event.preventDefault();
    }
  });

  const patchOverlay = () => {
    const overlayHook = window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__;
    if (overlayHook && typeof overlayHook.showOverlay === "function") {
      const originalShowOverlay = overlayHook.showOverlay;
      overlayHook.showOverlay = (arg) => {
        const message =
          arg?.message ||
          arg?.error?.message ||
          (typeof arg === "string" ? arg : "");
        if (message && suppressIfResizeObserver(message)) {
          return;
        }
        originalShowOverlay(arg);
      };
      return true;
    }
    return false;
  };

  if (!patchOverlay()) {
    const overlayInterval = setInterval(() => {
      if (patchOverlay()) {
        clearInterval(overlayInterval);
      }
    }, 200);
    window.addEventListener("load", () => {
      if (patchOverlay()) {
        clearInterval(overlayInterval);
      }
    });
  }

  const OriginalResizeObserver = window.ResizeObserver;
  if (OriginalResizeObserver) {
    window.ResizeObserver = class PatchedResizeObserver extends OriginalResizeObserver {
      constructor(callback) {
        super((entries, observer) => {
          window.requestAnimationFrame(() => callback(entries, observer));
        });
      }
    };
  }

  // Catch React rendering errors for objects
  const originalError = console.error;
  console.error = (...args) => {
    if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('Objects are not valid as a React child')) {
      console.warn('React rendering error caught:', args);
      // Log the component stack if available
      if (args.length > 1) {
        console.warn('Error details:', args.slice(1));
      }
    }
    originalError(...args);
  };
}

const clerkPublishableKey =
  process.env.REACT_APP_CLERK_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "pk_test_Y29zbWljLWRhc3NpZS02My5jbGVyay5hY2NvdW50cy5kZXYk";

if (!clerkPublishableKey) {
  console.error(
    "Missing Clerk publishable key. Set REACT_APP_CLERK_PUBLISHABLE_KEY or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.",
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <App />
      </ClerkProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
