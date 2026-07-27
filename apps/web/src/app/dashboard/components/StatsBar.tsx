interface StatsBarProps {
  css: (v: string) => string;
  totalMovies?: number;
  nowShowingCount?: number;
  comingSoonCount?: number;
}

export function StatsBar({ css, totalMovies = 0, nowShowingCount = 0, comingSoonCount = 0 }: StatsBarProps) {
  const stats = [
    { icon: '🎬', value: totalMovies > 0 ? String(totalMovies) : '—', label: 'Total Movies' },
    { icon: '▶️', value: nowShowingCount > 0 ? String(nowShowingCount) : '—', label: 'Now Showing' },
    { icon: '🗓️', value: comingSoonCount > 0 ? String(comingSoonCount) : '—', label: 'Coming Soon' },
    { icon: '🎟️', value: '—', label: 'Tickets Sold' },
  ];

  return (
    <div
      style={{
        background: css('bg-raised'),
        borderTop: `1px solid ${css('divider')}`,
        borderBottom: `1px solid ${css('divider')}`,
        padding: '0 56px',
      }}
    >
      <div
        style={{
          maxWidth: '1200px', margin: '0 auto',
          display: 'flex', gap: '0', alignItems: 'stretch',
        }}
      >
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              padding: '20px 0',
              borderRight: i < 3 ? `1px solid var(--divider)` : 'none',
            }}
          >
            <div style={{ fontSize: '24px' }}>{stat.icon}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
