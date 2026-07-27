import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy, MapPin, Target } from "lucide-react";
import type { Show } from "@/types";

interface GameEventCardProps {
  show: Show;
  index: number;
  onSelect?: (show: Show) => void;
}

export default function GameEventCard({ show, index, onSelect }: GameEventCardProps) {
  const showId = typeof show.id === "string" ? show.id : (show as Show & { _id?: { $oid: string } })._id?.$oid;

  const content = (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, duration: 0.5, ease: "easeOut" }}
        className="group relative w-full aspect-[4/3] rounded-3xl overflow-hidden border border-white/10 hover:border-green-500/50 transition-all cursor-pointer bg-[#0f172a] shadow-xl"
        onClick={() => onSelect?.(show)}
      >
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-[1.15]"
          style={{ backgroundImage: `url(${show.backdrop_url || show.poster_url || '/placeholder.jpg'})` }}
        />
        
        {/* Dynamic Sport-colored Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-green-900/90 via-black/60 to-transparent mix-blend-multiply opacity-80 group-hover:opacity-60 transition-opacity" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

        {/* Content */}
        <div className="absolute inset-0 p-5 flex flex-col justify-between z-10">
          
          <div className="flex justify-between items-start">
            <span className="px-3 py-1 bg-green-500/20 backdrop-blur-md rounded-full text-xs font-bold text-green-300 border border-green-500/30 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              {show.sport || "Game Event"}
            </span>
            {show.status === "nowShowing" && (
              <span className="px-2 py-1 bg-red-500/90 rounded-md text-[10px] font-black uppercase text-white tracking-widest animate-pulse">
                Live
              </span>
            )}
          </div>

          <div>
            <h3 className="text-xl font-bold text-white font-display tracking-tight mb-2 drop-shadow-md">
              {show.title}
            </h3>
            
            <div className="flex items-center gap-3 text-white/80 text-xs font-semibold mb-3">
              {show.match_round && (
                <div className="flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-green-400" />
                  <span>{show.match_round}</span>
                </div>
              )}
              {show.venue && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-green-400" />
                  <span>{show.venue}</span>
                </div>
              )}
            </div>

            {/* Teams vs Board */}
            {show.team_a && show.team_b && (
              <div className="flex items-center justify-between bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10 mt-2">
                <div className="flex flex-col items-center flex-1">
                  {show.team_a.logo_url && <img src={show.team_a.logo_url} className="w-8 h-8 object-contain mb-1" alt={show.team_a.name} />}
                  <span className="text-white text-xs font-bold text-center leading-tight">{show.team_a.name}</span>
                </div>
                
                <div className="px-3 flex flex-col items-center">
                  <span className="text-[10px] font-black text-white/50 mb-1">VS</span>
                  <div className="w-[1px] h-4 bg-white/20"></div>
                </div>

                <div className="flex flex-col items-center flex-1">
                  {show.team_b.logo_url && <img src={show.team_b.logo_url} className="w-8 h-8 object-contain mb-1" alt={show.team_b.name} />}
                  <span className="text-white text-xs font-bold text-center leading-tight">{show.team_b.name}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
  );

  if (onSelect) {
    return <div onClick={() => onSelect(show)}>{content}</div>;
  }
  return <Link href={`/shows/${showId}`}>{content}</Link>;
}
