"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Building2, Map, Castle, Landmark, Tent, Mountain, ChevronDown, X } from "lucide-react";
import { useCities } from "@/hooks/useApi";
import { createPortal } from "react-dom";

interface CitySelectorProps {
  selectedCity: string;
  onSelect: (city: string) => void;
}

const CITY_ICONS: Record<string, React.ElementType> = {
  "Mumbai": Building2,
  "Bengaluru": Map,
  "Delhi-NCR": Landmark,
  "Hyderabad": Castle,
  "Chennai": Tent,
  "Pune": Mountain,
  "Kolkata": Landmark,
  "Ahmedabad": Building2,
};

export function CitySelector({ selectedCity, onSelect }: CitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { data: cities, isLoading } = useCities();

  const safeCities = Array.isArray(cities) ? cities : [];

  // Popular cities are those that have an icon mapping and exist in the fetched cities
  const popularCities = safeCities.filter(c => Object.keys(CITY_ICONS).some(k => k.toLowerCase() === c.toLowerCase())).slice(0, 8);
  const otherCities = safeCities.filter(c => !popularCities.includes(c));

  // Reset state when opening
  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      setSearchQuery("");
      setShowAll(false);
    }
  }, [isOpen]);

  const filteredCities = safeCities.filter(c => c.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors text-sm font-semibold border border-transparent hover:border-[var(--border)] text-[var(--text-primary)]"
      >
        <MapPin className="w-4 h-4 text-[var(--accent)]" />
        {selectedCity === "All" ? "Select City" : selectedCity}
        <ChevronDown className="w-4 h-4 opacity-50" />
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
              >
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-[var(--divider)] flex items-center justify-between">
                  <h3 className="text-xl font-bold font-display flex items-center gap-2 text-[var(--text-primary)]">
                    <MapPin className="w-6 h-6 text-[var(--accent)]" />
                    {searchQuery || showAll ? "Select your City" : "Popular Cities"}
                  </h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 hover:bg-[var(--bg-subtle)] rounded-full transition-colors text-[var(--text-primary)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="p-4 sm:p-6 pb-2">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <MapPin className="w-4 h-4 text-gray-500 dark:text-[var(--text-muted)]" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search for your city..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl focus:border-[var(--accent)] outline-none transition-colors text-[var(--text-primary)] placeholder-[var(--text-muted)] font-medium text-sm shadow-sm"
                    />
                  </div>
                </div>

                {/* Body */}
                <div className="p-4 sm:p-6 pt-4 overflow-y-auto scrollbar-hide flex-1">
                  {isLoading ? (
                    <div className="flex justify-center p-8">
                      <div className="w-8 h-8 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
                    </div>
                  ) : (
                    <>
                      {!searchQuery && !showAll && (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
                            {popularCities.map(city => {
                              const Icon = Object.entries(CITY_ICONS).find(([k]) => k.toLowerCase() === city.toLowerCase())?.[1] || MapPin;
                              const isSelected = selectedCity.toLowerCase() === city.toLowerCase();
                              return (
                                <button
                                  key={city}
                                  onClick={() => {
                                    onSelect(city);
                                    setIsOpen(false);
                                  }}
                                  className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${isSelected
                                    ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent-text)] shadow-md'
                                    : 'bg-[var(--bg-subtle)] border-[var(--border)] hover:border-[var(--accent)]/50 hover:shadow-lg hover:-translate-y-0.5 text-[var(--text-primary)] hover:text-[var(--accent)]'
                                    }`}
                                >
                                  <Icon className={`w-8 h-8 mb-3 drop-shadow-md ${isSelected ? 'text-[var(--accent)]' : 'opacity-80'}`} />
                                  <span className="text-sm font-semibold">{city}</span>
                                </button>
                              );
                            })}
                          </div>

                          <div className="text-center">
                            <button
                              onClick={() => setShowAll(true)}
                              className="text-sm text-[var(--accent)] hover:underline font-bold py-2 px-6 rounded-lg bg-[var(--accent)]/10"
                            >
                              View All Cities
                            </button>
                          </div>
                        </>
                      )}

                      {(searchQuery || showAll) && (
                        <div className="flex flex-col">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {filteredCities.length > 0 ? (
                              filteredCities.map(city => (
                                <button
                                  key={city}
                                  onClick={() => {
                                    onSelect(city);
                                    setIsOpen(false);
                                  }}
                                  className={`text-left px-4 py-3 rounded-lg border transition-all text-sm font-medium ${selectedCity.toLowerCase() === city.toLowerCase()
                                    ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent-text)]'
                                    : 'bg-[var(--bg-subtle)] border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-raised)] text-[var(--text-primary)] hover:text-[var(--accent)]'
                                    }`}
                                >
                                  {city}
                                </button>
                              ))
                            ) : (
                              <div className="col-span-full py-8 text-center text-[var(--text-muted)] font-medium">
                                No cities found matching "{searchQuery}"
                              </div>
                            )}
                          </div>

                          {showAll && !searchQuery && (
                            <div className="mt-8 text-center border-t border-[var(--divider)] pt-6">
                              <button
                                onClick={() => setShowAll(false)}
                                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold transition-colors"
                              >
                                Show Popular Cities Only
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
