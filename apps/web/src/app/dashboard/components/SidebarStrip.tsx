import { Calendar, Compass, Film, Mic2, Trophy } from "lucide-react";

interface SidebarStripProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

const CATEGORIES = [
  { id: "All", icon: Compass, label: "Discover" },
  { id: "Movie", icon: Film, label: "Movies" },
  { id: "GameEvent", icon: Trophy, label: "Sports" },
  { id: "Concert", icon: Mic2, label: "Concerts" },
  { id: "Event", icon: Calendar, label: "Events" },
];

export function SidebarStrip({ selectedCategory, onSelectCategory }: SidebarStripProps) {
  return (
    <nav
      className="no-scroll-bar flex w-full items-center gap-1.5 overflow-x-auto py-2 sm:gap-2 sm:py-2.5"
      aria-label="Show categories"
    >
      {CATEGORIES.map((item) => {
        const isActive = selectedCategory === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectCategory(item.id)}
            className={`flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition-all sm:min-h-10 sm:px-4 sm:text-sm ${
              isActive
                ? "border-[var(--accent)] bg-[var(--accent)] text-slate-950 shadow-sm"
                : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--card-bg)] hover:text-[var(--text-primary)]"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
