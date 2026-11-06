import React from 'react';
import Button from './Button';

/**
 * SALO Global Error Boundary
 * Catches unhandled JavaScript exceptions in child component trees,
 * logs the incident, and displays a graceful fallback screen instead of a blank page.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console (or remote telemetry in production)
    console.error('SALO ErrorBoundary caught an exception:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary, #FFFFFF)',
          color: 'var(--text-primary, #171717)',
          padding: 'var(--space-6, 24px)',
          textAlign: 'center',
          fontFamily: 'var(--font-family, sans-serif)',
        }}>
          <div style={{
            maxWidth: 480,
            background: 'var(--surface-primary, #FFFFFF)',
            border: '1px solid var(--border-primary, #EAEAEA)',
            borderRadius: 'var(--radius-2xl, 26px)',
            padding: 'var(--space-8, 32px)',
            boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.08))',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-xl, 20px)',
              background: 'var(--status-error-bg, #FEE2E2)',
              color: 'var(--salo-error, #DC4545)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto var(--space-4, 16px)',
            }}>
              ⚠
            </div>

            <h1 style={{
              fontSize: 'var(--font-size-2xl, 24px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '0 0 var(--space-2, 8px)',
              color: 'var(--text-primary, #171717)',
            }}>
              Something went wrong
            </h1>

            <p style={{
              fontSize: 'var(--font-size-sm, 14px)',
              color: 'var(--text-secondary, #737373)',
              lineHeight: 1.6,
              margin: '0 0 var(--space-6, 24px)',
            }}>
              An unexpected application error occurred while loading this view. You can reload the page or return to the main homepage.
            </p>

            <div style={{ display: 'flex', gap: 'var(--space-3, 12px)', justifyContent: 'center' }}>
              <Button variant="primary" size="md" onClick={this.handleReload}>
                Reload Page
              </Button>
              <Button variant="outline" size="md" onClick={this.handleGoHome}>
                Return to Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
