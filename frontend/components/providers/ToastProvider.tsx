'use client';

import { Toaster } from 'react-hot-toast';

/**
 * Toast layer.
 *
 * Styled to the glass tier-5 recipe (blur 30px / saturate 180% @ 0.80) so
 * toasts read as the nearest surface in the stack. Applied through
 * `toastOptions.style` rather than a custom renderer so every existing
 * `toast.success(...)` / `toast.error(...)` call site keeps working untouched.
 *
 * Note: inline style cannot carry an `@supports` fallback, so the background
 * alpha here is the *fallback* 0.9 rather than 0.8 — a toast is short-lived
 * and must stay readable if backdrop-filter computes to `none`.
 */
export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      reverseOrder={false}
      gutter={8}
      toastOptions={{
        duration: 4000,
        style: {
          background: 'rgba(255, 255, 255, 0.9)',
          color: 'hsl(222 47% 11%)',
          border: '1px solid rgba(255, 255, 255, 0.7)',
          borderRadius: '24px',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.95), 0 2px 4px rgba(15,23,42,0.05), 0 30px 80px rgba(15,23,42,0.16)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          fontSize: '0.875rem',
          fontWeight: 500,
          padding: '0.75rem 1rem',
          maxWidth: '28rem',
        },
        success: {
          duration: 3000,
          iconTheme: { primary: '#10b981', secondary: '#fff' },
        },
        error: {
          duration: 5000,
          iconTheme: { primary: '#ef4444', secondary: '#fff' },
        },
        loading: {
          iconTheme: { primary: '#6366f1', secondary: '#fff' },
        },
      }}
    />
  );
}
