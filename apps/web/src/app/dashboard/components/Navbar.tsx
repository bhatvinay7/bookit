import { UserNav } from "@/components/UserNav";

interface NavbarProps {
  setMobileMenuOpen: (open: boolean) => void;
  navHov: string | null;
  setNavHov: (item: string | null) => void;
  css: (v: string) => string;
}

export function Navbar({ setMobileMenuOpen, navHov, setNavHov, css }: NavbarProps) {
  return (
    <nav
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: css('nav-bg'),
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: `1px solid ${css('divider')}`,
        height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Hamburger (Mobile) */}
        <button 
          className="md:hidden flex items-center justify-center bg-transparent border-none text-[var(--text-primary)] cursor-pointer p-1"
          onClick={() => setMobileMenuOpen(true)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        {/* Logo */}
        <div
          style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: css('accent'), display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '20px', flexShrink: 0,
          }}
        >
          🎬
        </div>
        <span
          className="hidden sm:block"
          style={{
            fontFamily: css('font-display'), fontWeight: 800, fontSize: '21px',
            color: css('text-primary'), letterSpacing: '-0.02em',
          }}
        >
          CineBook
        </span>
      </div>

      {/* Desktop Nav links */}
      <div className="hidden md:flex" style={{ gap: '2px' }}>
        {['Movies', 'Events', 'Cinemas', 'Offers'].map(item => (
          <button
            key={item}
            onMouseEnter={() => setNavHov(item)}
            onMouseLeave={() => setNavHov(null)}
            style={{
              background: navHov === item ? css('bg-subtle') : 'none',
              border: 'none', fontFamily: css('font-sans'),
              color: item === 'Movies' ? css('accent-text') : css('text-secondary'),
              fontWeight: item === 'Movies' ? 700 : 500,
              fontSize: '14px', cursor: 'pointer',
              padding: '8px 16px', borderRadius: '8px',
              transition: 'all 0.18s',
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Right Desktop */}
      <div className="hidden md:flex items-center gap-4">
        {/* Search */}
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: css('bg-subtle'),
            border: `1px solid ${css('border')}`,
            color: css('text-muted'), padding: '7px 14px',
            borderRadius: '9px', fontSize: '13px', cursor: 'pointer',
            fontFamily: css('font-sans'),
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search films…
        </button>
        <UserNav />
      </div>

    </nav>
  );
}
