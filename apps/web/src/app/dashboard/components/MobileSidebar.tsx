import { UserNav } from "@/components/UserNav";

interface MobileSidebarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export function MobileSidebar({ mobileMenuOpen, setMobileMenuOpen }: MobileSidebarProps) {
  if (!mobileMenuOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      <div className="relative w-[280px] max-w-[80vw] bg-[var(--nav-bg)] h-full shadow-2xl flex flex-col border-r border-[var(--divider)] animate-in slide-in-from-left duration-300">
        <div className="p-6 flex items-center justify-between border-b border-[var(--divider)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center text-lg">🎬</div>
            <span className="font-display font-extrabold text-xl text-[var(--text-primary)]">CineBook</span>
          </div>
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="p-4 flex flex-col gap-2">
          {/* Mobile Search */}
          <button className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-muted)] font-sans text-sm font-medium mb-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Search films...
          </button>
          
          {['Movies', 'Events', 'Cinemas', 'Offers'].map(item => (
            <button
              key={item}
              onClick={() => setMobileMenuOpen(false)}
              className={`w-full text-left px-4 py-3 rounded-xl border-none font-sans text-base font-bold transition-colors ${item === 'Movies' ? 'bg-[var(--accent)]/10 text-[var(--accent-text)]' : 'bg-transparent text-[var(--text-secondary)]'}`}
            >
              {item}
            </button>
          ))}
          
          <div className="h-px bg-[var(--divider)] my-2" />
          
          <div className="px-2">
            <UserNav />
          </div>
        </div>
      </div>
    </div>
  );
}
