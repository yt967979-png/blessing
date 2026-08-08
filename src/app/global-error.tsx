'use client';

/** Root-level crash UI (last resort when layout itself fails). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          background: '#f8fafc',
          color: '#001B3A',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <p
            style={{
              display: 'inline-block',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              background: '#fbbf24',
              padding: '6px 12px',
              borderRadius: 999,
              marginBottom: 16,
            }}
          >
            Blessing Power Guide
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 10px' }}>
            Temporary issue
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>
            {error?.message ||
              'We’re fixing this. Your cart and orders are safe — please try again in a moment.'}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#001B3A',
              color: '#fff',
              border: 0,
              borderRadius: 12,
              padding: '12px 22px',
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
