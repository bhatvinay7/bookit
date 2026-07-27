import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mic2, MapPin } from "lucide-react";
import type { Show } from "@/types";

interface ConcertCardProps {
  show: Show;
  index: number;
  onSelect?: (show: Show) => void;
}

export default function ConcertCard({ show, index, onSelect }: ConcertCardProps) {
  const showId = typeof show.id === "string" ? show.id : (show as Show & { _id?: { $oid: string } })._id?.$oid;
  
  const content = (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.1, duration: 0.4 }}
        className="group relative w-full aspect-[16/9] rounded-2xl overflow-hidden shadow-md hover:shadow-[0_0_30px_rgba(255,105,180,0.3)] transition-all cursor-pointer bg-zinc-900 border border-white/5"
      >
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-[1.15]"
          style={{ backgroundImage: `url(${show.backdrop_url || show.poster_url || '/placeholder.jpg'})` }}
        />
        
        {/* Colorful Gradient Overlay for Concerts */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900/90 via-black/50 to-transparent mix-blend-multiply opacity-80 group-hover:opacity-60 transition-opacity" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

        {/* Content */}
        <div className="absolute inset-0 p-5 flex flex-col justify-between z-10">
          
          <div className="flex justify-between items-start">
            <span className="px-3 py-1 bg-pink-500/20 backdrop-blur-md rounded-full text-xs font-bold text-pink-300 border border-pink-500/30">
              Live Concert
            </span>
            {show.status === "nowShowing" && (
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
          </div>

          <div>
            <h3 className="text-2xl font-bold text-white font-display tracking-tight mb-1 drop-shadow-md">
              {show.title}
            </h3>
            
            <div className="flex items-center gap-3 text-white/80 text-xs font-semibold mb-3">
              {show.venue && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-pink-400" />
                  <span>{show.venue}</span>
                </div>
              )}
            </div>

            {/* Performers / Host */}
            {(show.host || (show.performers && show.performers.length > 0)) && (
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm p-2 rounded-xl border border-white/10 inline-flex">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-purple-500 flex items-center justify-center shadow-lg">
                  <Mic2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[10px] text-white/60 font-bold uppercase tracking-wider leading-none mb-1">
                    {show.performers && show.performers.length > 0 ? "Featuring" : "Hosted by"}
                  </p>
                  <p className="text-xs text-white font-bold leading-none">
                    {show.performers && show.performers.length > 0 
                      ? show.performers[0].name 
                      : show.host}
                  </p>
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
