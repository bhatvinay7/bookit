interface EmptyStateProps {
  css: (v: string) => string;
  isError?: boolean;
}

export function EmptyState({ css, isError }: EmptyStateProps) {
  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', minHeight: '60vh' }}>
      {/* Ambient glow */}
      <div style={{ position: 'relative', textAlign: 'center', maxWidth: '480px', width: '100%' }}>
        <div style={{
          position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)',
          width: '220px', height: '220px', background: `radial-gradient(circle, ${css('accent')}22 0%, transparent 70%)`,
          borderRadius: '50%', pointerEvents: 'none',
        }} />

        {/* Icon */}
        <div style={{
          width: '80px', height: '80px', borderRadius: '24px',
          background: css('bg-raised'), border: `1px solid ${css('border')}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '36px', margin: '0 auto 28px',
          boxShadow: `0 8px 32px rgba(0,0,0,0.15)`,
        }}>
          {isError ? '⚠️' : '🎬'}
        </div>

        {/* Title */}
        <h2 style={{
          fontFamily: css('font-display'), fontSize: '28px', fontWeight: 800,
          marginBottom: '12px', color: css('text-primary'), letterSpacing: '-0.02em',
        }}>
          {isError ? 'Could not load movies' : 'No shows available right now'}
        </h2>

        {/* Subtitle */}
        <p style={{ color: css('text-secondary'), fontSize: '15px', lineHeight: '1.65', marginBottom: '32px' }}>
          {isError
            ? 'There was a problem connecting to the server. Please make sure the backend is running and try again.'
            : 'There are no movies scheduled at the moment. Check back soon — new shows are added regularly!'}
        </p>

        {/* Refresh button */}
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 28px', background: css('accent'), color: '#12111a',
            border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
            cursor: 'pointer', fontFamily: css('font-sans'), letterSpacing: '0.01em',
            transition: 'opacity 0.18s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Refresh Page
        </button>
      </div>
    </main>
  );
}
