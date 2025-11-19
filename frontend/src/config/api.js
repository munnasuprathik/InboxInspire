/**
 * Dynamic API Configuration
 * All URLs are environment-based - NO hardcoded URLs
 * 
 * Environment Variable Priority:
 * 1. REACT_APP_BACKEND_URL (REQUIRED in production)
 * 2. Development fallback (localhost only in development)
 * 
 * Production Setup:
 * - Set REACT_APP_BACKEND_URL in Vercel environment variables
 * - Example: https://your-backend-api.com
 * - NO trailing slash
 */

// Cache for computed URLs (lazy initialization)
let _backendUrl = null;
let _frontendUrl = null;

// Get backend URL from environment variables (lazy evaluation)
const getBackendUrl = () => {
  // Return cached value if already computed
  if (_backendUrl !== null) {
    return _backendUrl;
  }
  
  // Check for explicit backend URL (REQUIRED in production)
  const explicitUrl = process.env.REACT_APP_BACKEND_URL;
  
  if (explicitUrl && explicitUrl.trim()) {
    _backendUrl = explicitUrl.trim().replace(/\/$/, ''); // Remove trailing slash and whitespace
    return _backendUrl;
  }
  
  // Development fallback (localhost only)
  if (process.env.NODE_ENV === 'development') {
    console.warn('⚠️ REACT_APP_BACKEND_URL not set, using localhost:8000 for development');
    _backendUrl = 'http://localhost:8000';
    return _backendUrl;
  }
  
  // Production without URL configured - show clear error
  console.error('❌ REACT_APP_BACKEND_URL must be set in production environment variables');
  console.error('   Set it in Vercel: Settings → Environment Variables → Add REACT_APP_BACKEND_URL');
  _backendUrl = ''; // Empty string - components should handle this gracefully
  return _backendUrl;
};

// Get frontend URL from environment variables (lazy evaluation)
const getFrontendUrl = () => {
  // Return cached value if already computed
  if (_frontendUrl !== null) {
    return _frontendUrl;
  }
  
  if (typeof window !== 'undefined') {
    // Client-side: use current origin (most reliable - always correct)
    _frontendUrl = window.location.origin;
    return _frontendUrl;
  }
  
  // Server-side: use environment variable (for SSR if needed)
  if (process.env.REACT_APP_FRONTEND_URL) {
    _frontendUrl = process.env.REACT_APP_FRONTEND_URL.trim().replace(/\/$/, '');
    return _frontendUrl;
  }
  
  // No fallback - will use window.location.origin when available
  _frontendUrl = '';
  return _frontendUrl;
};

// Use getters for lazy evaluation - URLs are computed on first access, not at module load
export const API_CONFIG = {
  get BACKEND_URL() {
    return getBackendUrl();
  },
  get FRONTEND_URL() {
    return getFrontendUrl();
  },
  get API_BASE() {
    const backendUrl = getBackendUrl();
    return backendUrl ? `${backendUrl}/api` : '/api'; // Fallback to relative path if backend URL is empty
  },
};

// Log configuration in development only (never in production)
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 API Configuration:', {
    BACKEND_URL: API_CONFIG.BACKEND_URL,
    FRONTEND_URL: API_CONFIG.FRONTEND_URL,
    API_BASE: API_CONFIG.API_BASE
  });
}

export default API_CONFIG;

