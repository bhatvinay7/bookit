import React from "react";
import type { Show } from "@/types";
import MovieCard from "./MovieCard";

interface ShowCardProps {
  show: Show;
  index: number;
  onSelect?: (show: Show) => void;
}

export default function ShowCard({ show, index, onSelect }: ShowCardProps) {
  // Use MovieCard as the unified glassmorphic card design for all show types
  return <MovieCard show={show} index={index} onSelect={onSelect} />;
}
