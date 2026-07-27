import React, { useState } from "react";
import { Film, Mic2, Calendar, Trophy, Compass, Search } from "lucide-react";
import { motion } from "framer-motion";

interface SidebarStripProps {
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  onOpenSearch: () => void;
  dark: boolean;
  css: (v: string) => string;
}

const CATEGORIES = [
  { id: "All", icon: Compass, label: "Home" },
  { id: "Movie", icon: Film, label: "Movies" },
  { id: "GameEvent", icon: Trophy, label: "Sports" },
  { id: "Concert", icon: Mic2, label: "Concerts" },
  { id: "Event", icon: Calendar, label: "Events" },
];

export function SidebarStrip({ selectedCategory, onSelectCategory, onOpenSearch, dark, css }: SidebarStripProps) {
  return (
    <div className="w-full flex items-center gap-6 py-2 overflow-x-auto scrollbar-hide border-none bg-transparent">
      {/* Nav items */}
      <nav className="flex items-center gap-2">
        {CATEGORIES.map((item) => {
          const isActive = selectedCategory === item.id || (selectedCategory === "All" && item.id === "All");
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelectCategory(item.id)}
              className="flex items-center justify-center px-4 py-2 rounded-xl transition-all duration-200"
              style={{
                color: isActive ? 'var(--accent)' : dark ? '#94a3b8' : '#64748b',
                fontWeight: isActive ? 800 : 500,
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                borderRadius: 0,
              }}
            >
              <span className="text-sm whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
