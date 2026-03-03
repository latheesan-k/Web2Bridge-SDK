/**
 * SkeletonScreen - Loading placeholder for auth state resolution
 * 
 * Displays a pulsing skeleton UI while the application determines:
 * 1. Whether the user has an active Clerk session
 * 2. Whether the device supports WebAuthn PRF
 * 
 * This prevents the "flicker" of unauthenticated UI when a session exists.
 */

function SkeletonScreen() {
  return (
    <div className="skeleton-container">
      {/* Header Skeleton */}
      <div className="skeleton-header">
        <div className="skeleton-brand">
          <div className="skeleton-icon shimmer" />
          <div className="skeleton-text skeleton-title shimmer" />
        </div>
        <div className="skeleton-badge shimmer" />
      </div>

      {/* Main Card Skeleton */}
      <div className="skeleton-section-label shimmer" />
      <div className="skeleton-card">
        <div className="skeleton-content">
          <div className="skeleton-title-large shimmer" style={{ width: '60%', margin: '0 auto 16px' }} />
          <div className="skeleton-text shimmer" style={{ width: '80%', margin: '0 auto 12px' }} />
          <div className="skeleton-text shimmer" style={{ width: '70%', margin: '0 auto 24px' }} />
          <div className="skeleton-button shimmer" style={{ maxWidth: 320, margin: '0 auto' }} />
        </div>

        {/* Steps Skeleton */}
        <div className="skeleton-steps">
          <div className="skeleton-step">
            <div className="skeleton-step-number shimmer" />
            <div className="skeleton-step-text shimmer" />
          </div>
          <div className="skeleton-step">
            <div className="skeleton-step-number shimmer" />
            <div className="skeleton-step-text shimmer" />
          </div>
          <div className="skeleton-step">
            <div className="skeleton-step-number shimmer" />
            <div className="skeleton-step-text shimmer" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        Powered by <a href="https://github.com/latheesan-k/Web2Bridge-SDK" target="_blank" rel="noopener">Web2Bridge SDK</a>
      </footer>

      <style>{`
        .skeleton-container {
          max-width: 720px;
          margin: 0 auto;
          padding: 24px 20px 60px;
          min-height: 100vh;
        }

        .shimmer {
          background: linear-gradient(
            90deg,
            rgba(108, 92, 231, 0.08) 0%,
            rgba(108, 92, 231, 0.15) 50%,
            rgba(108, 92, 231, 0.08) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
          border-radius: 4px;
        }

        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .skeleton-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 0;
          margin-bottom: 32px;
          border-bottom: 1px solid var(--border, #1e2133);
        }

        .skeleton-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .skeleton-icon {
          width: 20px;
          height: 20px;
          border-radius: 4px;
        }

        .skeleton-text {
          height: 16px;
          border-radius: 4px;
        }

        .skeleton-title {
          width: 160px;
        }

        .skeleton-title-large {
          height: 28px;
          border-radius: 6px;
        }

        .skeleton-badge {
          width: 80px;
          height: 28px;
          border-radius: 20px;
        }

        .skeleton-section-label {
          width: 120px;
          height: 14px;
          border-radius: 4px;
          margin-bottom: 12px;
        }

        .skeleton-card {
          background: var(--bg-card, #12141c);
          border: 1px solid var(--border, #1e2133);
          border-radius: var(--radius, 10px);
          padding: 32px;
        }

        .skeleton-content {
          text-align: center;
          padding: 24px 0;
        }

        .skeleton-button {
          height: 48px;
          border-radius: 8px;
        }

        .skeleton-steps {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--border, #1e2133);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .skeleton-step {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .skeleton-step-number {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .skeleton-step-text {
          height: 14px;
          flex: 1;
          max-width: 400px;
        }

        .footer {
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid var(--border, #1e2133);
          text-align: center;
          font-size: 0.85rem;
          color: var(--text-muted, #7a7f98);
        }

        .footer a {
          color: var(--primary-light, #8b7cf7);
          text-decoration: none;
          font-weight: 500;
        }
      `}</style>
    </div>
  )
}

export default SkeletonScreen
