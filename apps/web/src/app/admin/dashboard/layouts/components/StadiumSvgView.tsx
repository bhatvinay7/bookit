import React, { useMemo } from 'react';
import type { LayoutSeatClass } from "@/types";

export interface SvgBlock {
  id: string;
  name: string;
  stand: string;
  gate: string;
  direction: string;
  category: LayoutSeatClass;
  seatCount: number;
}

interface StadiumSvgViewProps {
  blocks: SvgBlock[];
  onBlockClick?: (block: SvgBlock) => void;
  selectedBlockId?: string | null;
}

const CLASS_COLORS: Record<string, string> = {
  Standard: "#6366f1",
  Premium: "#8b5cf6",
  VIP: "#ec4899",
  GA: "#f59e0b"
};

const STAND_ORDER = ["Ground Level", "Lower Stand", "Middle Stand", "VIP Box", "Upper Stand", "Balcony"];

const DIR_ANGLES: Record<string, { start: number, end: number }> = {
  "North": { start: -22.5, end: 22.5 },
  "North-East": { start: 22.5, end: 67.5 },
  "East": { start: 67.5, end: 112.5 },
  "South-East": { start: 112.5, end: 157.5 },
  "South": { start: 157.5, end: 202.5 },
  "South-West": { start: 202.5, end: 247.5 },
  "West": { start: 247.5, end: 292.5 },
  "North-West": { start: 292.5, end: 337.5 },
  "": { start: 0, end: 360 }, // Fallback for blocks with no direction
  "None": { start: 0, end: 360 }
};

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: cx + (r * Math.cos(angleInRadians)),
    y: cy + (r * Math.sin(angleInRadians))
  };
}

function describeArc(x: number, y: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  // SVG arcs don't handle 360 degree circles well with a single path.
  // If the angle is exactly 360, we draw two 180 degree arcs.
  if (Math.abs(endAngle - startAngle) >= 360) {
    const halfAngle = startAngle + 180;
    const start = polarToCartesian(x, y, outerRadius, halfAngle);
    const end = polarToCartesian(x, y, outerRadius, startAngle);
    const startInner = polarToCartesian(x, y, innerRadius, halfAngle);
    const endInner = polarToCartesian(x, y, innerRadius, startAngle);
    const start2 = polarToCartesian(x, y, outerRadius, endAngle);
    const endInner2 = polarToCartesian(x, y, innerRadius, halfAngle);
    
    return [
      "M", start.x, start.y,
      "A", outerRadius, outerRadius, 0, 1, 0, end.x, end.y,
      "A", outerRadius, outerRadius, 0, 1, 0, start2.x, start2.y,
      "L", endInner2.x, endInner2.y,
      "A", innerRadius, innerRadius, 0, 1, 1, startInner.x, startInner.y,
      "A", innerRadius, innerRadius, 0, 1, 1, endInner.x, endInner.y,
      "Z"
    ].join(" ");
  }

  const start = polarToCartesian(x, y, outerRadius, endAngle);
  const end = polarToCartesian(x, y, outerRadius, startAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", start.x, start.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, end.x, end.y,
    "L", endInner.x, endInner.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    "Z"
  ].join(" ");
}

export default function StadiumSvgView({ blocks, onBlockClick, selectedBlockId }: StadiumSvgViewProps) {
  // Group by stand (Ring)
  const standsMap = useMemo(() => {
    const map = new Map<string, SvgBlock[]>();
    blocks.forEach(b => {
      const standName = b.stand || 'General';
      if (!map.has(standName)) map.set(standName, []);
      map.get(standName)!.push(b);
    });
    return map;
  }, [blocks]);

  // Sort stands to form concentric rings (inner to outer)
  const sortedStands = Array.from(standsMap.keys()).sort((a, b) => {
    const idxA = STAND_ORDER.indexOf(a);
    const idxB = STAND_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const centerX = 400;
  const centerY = 400;
  const baseInnerRadius = 100; // Pitch size
  const ringWidth = 60;
  const ringGap = 10;
  const blockGapAngle = 2; // small gap between blocks

  return (
    <div style={{ width: "100%", maxWidth: 800, margin: "0 auto", position: "relative" }}>
      <svg viewBox="0 0 800 800" style={{ width: "100%", height: "auto", background: "#f8fafc", borderRadius: 16 }}>
        {/* The Pitch */}
        <ellipse cx={centerX} cy={centerY} rx={80} ry={100} fill="#22c55e" stroke="#166534" strokeWidth={4} />
        <rect x={centerX - 10} y={centerY - 30} width={20} height={60} fill="#fde047" opacity={0.8} />

        {sortedStands.map((standName, ringIndex) => {
          const standBlocks = standsMap.get(standName)!;
          const rInner = baseInnerRadius + ringIndex * (ringWidth + ringGap);
          const rOuter = rInner + ringWidth;
          const rStrip = rOuter + 8; // The "outer thin strip" for the stand

          // Group blocks in this stand by direction
          const dirMap = new Map<string, SvgBlock[]>();
          standBlocks.forEach(b => {
            const dir = b.direction || "None";
            if (!dirMap.has(dir)) dirMap.set(dir, []);
            dirMap.get(dir)!.push(b);
          });

          return (
            <g key={`stand-${standName}`}>
              {/* Stand Outer Thin Strip Background */}
              <circle cx={centerX} cy={centerY} r={rOuter + 4} fill="none" stroke="#e2e8f0" strokeWidth={8} />

              {Array.from(dirMap.entries()).map(([dir, blocksInDir]) => {
                const angleInfo = DIR_ANGLES[dir] || DIR_ANGLES["None"];
                let totalSpan = angleInfo.end - angleInfo.start;
                
                // If it's a full 360 circle (no direction specified), we just split it among blocks
                const isFullCircle = totalSpan >= 360;
                
                // Subtract some padding so directions don't touch
                const padding = isFullCircle ? 0 : 4; 
                const usableStart = angleInfo.start + padding;
                const usableEnd = angleInfo.end - padding;
                const usableSpan = usableEnd - usableStart;
                
                const spanPerBlock = usableSpan / blocksInDir.length;

                return (
                  <g key={`dir-${dir}`}>
                    {blocksInDir.map((block, blockIdx) => {
                      const blockStart = usableStart + blockIdx * spanPerBlock + (blockGapAngle / 2);
                      const blockEnd = usableStart + (blockIdx + 1) * spanPerBlock - (blockGapAngle / 2);
                      
                      const isSelected = selectedBlockId === block.id;
                      const baseColor = CLASS_COLORS[block.category] || "#94a3b8";
                      const pathData = describeArc(centerX, centerY, rInner, rOuter, blockStart, blockEnd);
                      
                      const midAngle = (blockStart + blockEnd) / 2;
                      const textPos = polarToCartesian(centerX, centerY, (rInner + rOuter) / 2, midAngle);
                      const gatePos = polarToCartesian(centerX, centerY, rOuter + 4, midAngle);

                      return (
                        <g 
                          key={block.id} 
                          onClick={() => onBlockClick?.(block)}
                          style={{ cursor: "pointer", transition: "all 0.2s" }}
                          className="stadium-block-group"
                        >
                          {/* The Block Sector */}
                          <path
                            d={pathData}
                            fill={baseColor}
                            fillOpacity={isSelected ? 1 : 0.8}
                            stroke={isSelected ? "#000" : "#fff"}
                            strokeWidth={isSelected ? 3 : 1}
                            onMouseEnter={(e) => { e.currentTarget.style.fillOpacity = "1"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.fillOpacity = isSelected ? "1" : "0.8"; }}
                          />
                          
                          {/* Block Name */}
                          <text
                            x={textPos.x}
                            y={textPos.y}
                            textAnchor="middle"
                            alignmentBaseline="middle"
                            fontSize={11}
                            fontWeight={700}
                            fill="#ffffff"
                            style={{ pointerEvents: "none" }}
                          >
                            {block.name}
                          </text>

                          {/* Outer Strip Gate/Stand Text */}
                          {block.gate && (
                            <text
                              x={gatePos.x}
                              y={gatePos.y}
                              textAnchor="middle"
                              alignmentBaseline="middle"
                              fontSize={9}
                              fontWeight={600}
                              fill="#475569"
                              style={{ pointerEvents: "none" }}
                              transform={`rotate(${midAngle > 90 && midAngle < 270 ? midAngle - 180 : midAngle}, ${gatePos.x}, ${gatePos.y})`}
                            >
                              {block.gate}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
              
              {/* Stand Name Label placed on the top or bottom of the ring */}
              <text
                x={centerX}
                y={centerY - rOuter - 14}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="#94a3b8"
                letterSpacing={2}
                style={{ pointerEvents: "none" }}
              >
                {standName.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
