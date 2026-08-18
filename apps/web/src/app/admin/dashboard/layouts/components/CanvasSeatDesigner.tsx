"use client";

import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Rect, Circle, Text, Group } from "react-konva";
import type { LayoutSeatClass, SeatInput } from "@/types";
import StadiumSvgView, { SvgBlock } from "./StadiumSvgView";

export type LayoutShape = 'rectangular' | 'circular' | 'square';

interface CanvasSeatDesignerProps {
  shape: LayoutShape;
  initialSeats?: SeatInput[];
  onSave?: (seats: SeatInput[], layoutShape: string) => void;
  onCancel?: () => void;
  isSaving?: boolean;
  isSaved?: boolean;
  readonly?: boolean;
}

interface LayoutBlock {
  id: string;
  name: string;
  direction: string;
  gate: string;
  stand: string;
  category: LayoutSeatClass;
  rowStart: string;
  rowEnd: string;
  colStart: number;
  colEnd: number;
  x: number;
  y: number;
  selected: boolean;
  disabledSeats: string[]; // array of "r-c" keys
}

const CLASS_COLORS: Record<LayoutSeatClass, string> = {
  Standard: "#6366f1",
  Premium: "#8b5cf6",
  VIP: "#ec4899",
  GA: "#f59e0b"
};

export default function CanvasSeatDesigner({ shape, initialSeats, onSave, onCancel, isSaving, isSaved, readonly = false }: CanvasSeatDesignerProps) {
  const [blocks, setBlocks] = useState<LayoutBlock[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  
  // Reconstruct blocks from initial seats (for Edit and Preview modes)
  useEffect(() => {
    if (initialSeats && initialSeats.length > 0) {
      const groups = new Map<string, SeatInput[]>();
      initialSeats.forEach(seat => {
        const bn = seat.block_name || 'Block';
        if (!groups.has(bn)) groups.set(bn, []);
        groups.get(bn)!.push(seat);
      });

      const newBlocks: LayoutBlock[] = [];
      groups.forEach((seatsInGroup, bn) => {
        let name = bn;
        let direction = "";
        let gate = "";
        let stand = "";
        if (shape !== 'rectangular' && bn.includes(" - ")) {
           const parts = bn.split(" - ").map(s => s.trim());
           name = parts.pop()?.replace("Block ", "") || "";
           stand = parts.find(p => p.toLowerCase().includes("stand") || p.toLowerCase().includes("box") || p.toLowerCase().includes("level") || p.toLowerCase().includes("ground")) || "";
           gate = parts.find(p => p.toLowerCase().includes("gate")) || "";
           direction = parts.find(p => p !== stand && p !== gate) || "";
        } else if (shape === 'rectangular' && bn.startsWith("Block ")) {
           name = bn.replace("Block ", "");
        }

        let minC = Infinity;
        let maxC = -Infinity;
        let blockX = 100;
        let blockY = 100;

        seatsInGroup.forEach(s => {
          const x = s.x_pos ?? 100;
          const y = s.y_pos ?? 100;
          
          let cVal = x % 1000;
          if (cVal < 0) cVal += 1000;
          const bx = (x - cVal) / 1000;
          
          let rVal = y % 1000;
          if (rVal < 0) rVal += 1000;
          const by = (y - rVal) / 1000;

          if (cVal < minC) minC = cVal;
          if (cVal > maxC) maxC = cVal;
          blockX = bx;
          blockY = by;
        });

        const rows = [...new Set(seatsInGroup.map(s => s.row_letter))].sort();
        const rowStart = rows[0] || "A";
        const rowEnd = rows[rows.length - 1] || "A";
        const colStart = minC !== Infinity ? minC : 1;
        const colEnd = maxC !== -Infinity ? maxC : 1;

        const disabledSeats: string[] = [];
        const allRowLetters: string[] = [];
        let curr = rowStart.charCodeAt(0);
        const end = (rowEnd.charCodeAt(0) >= curr) ? rowEnd.charCodeAt(0) : curr;
        while (curr <= end) {
          allRowLetters.push(String.fromCharCode(curr));
          curr++;
        }
        for (let r = 0; r < allRowLetters.length; r++) {
          for (let c = colStart; c <= colEnd; c++) {
            const exists = seatsInGroup.find(s => {
              const x = s.x_pos ?? 100;
              let cVal = x % 1000;
              if (cVal < 0) cVal += 1000;
              return s.row_letter === allRowLetters[r] && cVal === c;
            });
            if (!exists) disabledSeats.push(`${r}-${c - colStart}`);
          }
        }

        newBlocks.push({
          id: `restored-${Math.random().toString(36).substr(2, 9)}`,
          name, direction, gate, stand,
          category: seatsInGroup[0].seat_class,
          rowStart, rowEnd, colStart, colEnd,
          x: blockX,
          y: blockY,
          selected: false,
          disabledSeats
        });
      });

      // Auto-arrange blocks if readonly to prevent overlap of old saved data
      if (readonly) {
        let currentY = shape === 'rectangular' ? 100 : 250;
        newBlocks.forEach(b => {
          const startCode = b.rowStart.charCodeAt(0) || 65;
          const endCode = b.rowEnd.charCodeAt(0) || 65;
          const rCount = Math.abs((isNaN(endCode) ? startCode : endCode) - startCode) + 1;
          const h = rCount * 22 + 48;
          b.x = 400 - 760 / 2; // centered
          b.y = currentY;
          currentY += h + 20;
        });
      }

      setBlocks(newBlocks);
    }
  }, [initialSeats, shape, readonly]);

  // Block Input State
  const [blockName, setBlockName] = useState<string>("A");
  const [direction, setDirection] = useState<string>("");
  const [gate, setGate] = useState<string>("");
  const [stand, setStand] = useState<string>("North Stand");
  const [category, setCategory] = useState<LayoutSeatClass>("Standard");
  const [rowStart, setRowStart] = useState<string>("A");
  const [rowEnd, setRowEnd] = useState<string>("Z");
  const [colStart, setColStart] = useState<number>(1);
  const [colEnd, setColEnd] = useState<number>(20);

  // Default placement tracking
  const blockCountRef = useRef(0);

  const addBlock = () => {
    let finalBlockName = blockName;
    if (!finalBlockName) {
      finalBlockName = `Block-${blocks.length + 1}`;
    }

    const rowsCount = Math.abs(rowEnd.charCodeAt(0) - rowStart.charCodeAt(0)) + 1;
    const colsCount = Math.abs(colEnd - colStart) + 1;
    
    const blockWidth = 760;
    const innerHeight = rowsCount * 22; // approx based on gap
    const blockHeight = innerHeight + 48; // padding

    // Stack blocks vertically
    let nextY = shape === 'rectangular' ? 150 - blockHeight / 2 : 300 - blockHeight / 2;
    if (blocks.length > 0) {
      const lastBlock = blocks[blocks.length - 1];
      const lastRowsCount = Math.abs(lastBlock.rowEnd.charCodeAt(0) - lastBlock.rowStart.charCodeAt(0)) + 1;
      const lastBlockHeight = lastRowsCount * 22 + 48;
      nextY = lastBlock.y + lastBlockHeight + 20; // 20px gap between blocks
    }

    const newBlock: LayoutBlock = {
      id: `block-${Math.random().toString(36).substr(2, 9)}`,
      name: finalBlockName,
      direction,
      gate,
      stand,
      category,
      rowStart,
      rowEnd,
      colStart,
      colEnd,
      x: 400 - blockWidth / 2,
      y: nextY,
      selected: false,
      disabledSeats: [],
    };

    setBlocks([...blocks, newBlock]);
    
    // Auto increment for next
    setBlockName(String.fromCharCode(finalBlockName.charCodeAt(0) + 1));
    setColStart(colEnd + 1);
    setColEnd(colEnd + colsCount);
  };

  const handleDragEnd = (e: unknown, id: string) => {
    const newX = (e as any).target.x();
    const newY = (e as any).target.y();
    setBlocks(blocks.map(b => b.id === id ? { ...b, x: newX, y: newY } : b));
  };

  const handleSelectBlock = (id: string) => {
    const block = blocks.find(b => b.id === id);
    if (block) {
      setBlockName(block.name);
      setDirection(block.direction);
      setGate(block.gate);
      setStand(block.stand);
      setCategory(block.category);
      setRowStart(block.rowStart);
      setRowEnd(block.rowEnd);
      setColStart(block.colStart);
      setColEnd(block.colEnd);
    }
    setBlocks(blocks.map(b => ({ ...b, selected: b.id === id })));
  };

  const updateBlock = () => {
    setBlocks(blocks.map(b => {
      if (b.selected) {
        return {
          ...b,
          name: blockName,
          direction: direction,
          gate: gate,
          stand: stand,
          category: category,
          rowStart: rowStart.toUpperCase(),
          rowEnd: rowEnd.toUpperCase(),
          colStart: colStart,
          colEnd: colEnd,
        };
      }
      return b;
    }));
  };

  const toggleSeat = (blockId: string, seatKey: string) => {
    setBlocks(blocks.map(b => {
      if (b.id !== blockId) return b;
      const isSkipped = b.disabledSeats?.includes(seatKey) || false;
      return {
        ...b,
        disabledSeats: isSkipped 
          ? b.disabledSeats.filter(s => s !== seatKey) 
          : [...(b.disabledSeats || []), seatKey]
      };
    }));
  };

  const deleteSelected = () => {
    setBlocks(blocks.filter(b => !b.selected));
  };

  const handleSave = () => {
    // Expand blocks into individual seats
    const allSeats: SeatInput[] = [];
    let globalSeatCounter = 1;

    blocks.forEach(block => {
      // Construct full block name
      let fullBlockName = block.name;
      if (shape !== 'rectangular') {
        const parts = [];
        if (block.direction) parts.push(block.direction);
        if (block.gate) parts.push(block.gate);
        if (block.stand) parts.push(block.stand);
        if (block.name) parts.push(`Block ${block.name}`);
        fullBlockName = parts.join(" - ");
      }
      
      // Expand Rows
      // e.g. A -> Z
      const startCharCode = block.rowStart.charCodeAt(0);
      const endCharCode = block.rowEnd.charCodeAt(0);
      
      const rows = [];
      if (startCharCode <= endCharCode) {
        for (let c = startCharCode; c <= endCharCode; c++) {
          rows.push(String.fromCharCode(c));
        }
      } else {
        rows.push(block.rowStart); // fallback if invalid range
      }

      // Expand Cols
      let rIdx = 0;
      for (const rowLetter of rows) {
        for (let c = block.colStart; c <= block.colEnd; c++) {
          const seatKey = `${rIdx}-${c - block.colStart}`;
          if (block.disabledSeats?.includes(seatKey)) {
            continue; // Skip disabled seat
          }
          
          allSeats.push({
            row_letter: rowLetter,
            seat_number: globalSeatCounter++,
            seat_class: block.category,
            x_pos: Math.round(block.x) * 1000 + c,
            y_pos: Math.round(block.y) * 1000 + rIdx,
            block_name: fullBlockName
          });
        }
        rIdx++;
      }
    });

    onSave?.(allSeats, shape);
  };

  const maxBlockY = blocks.reduce((max, b) => {
    const startCode = b.rowStart.charCodeAt(0) || 65;
    const endCode = b.rowEnd.charCodeAt(0) || 65;
    const rCount = Math.abs((isNaN(endCode) ? startCode : endCode) - startCode) + 1;
    const h = rCount * 22 + 48;
    return Math.max(max, b.y + h + 50);
  }, 600);

  return (
    <div style={{ display: "flex", gap: "20px", flexDirection: "column" }}>
      {/* Editor Controls */}
      {!readonly && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", background: "#1e1e2d", padding: "20px", borderRadius: 12, border: "1px solid #374151" }}>
            <h4 style={{ margin: 0, marginRight: 10, width: "100%", fontSize: "1.1rem", marginBottom: 5, color: "#fff" }}>Add Block</h4>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: 12, color: "#9ca3af", fontWeight: "bold" }}>Block Name</label>
              <input 
                type="text" 
                placeholder="A, B, C..." 
                value={blockName}
                onChange={e => setBlockName(e.target.value.toUpperCase())}
                style={{ padding: "8px 12px", width: 80, fontSize: 13, background: "#111118", border: "1px solid #374151", borderRadius: 6, color: "#fff" }}
              />
            </div>

            {shape !== 'rectangular' && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 13, color: "#9ca3af" }}>Direction</label>
                  <select value={direction} onChange={e => setDirection(e.target.value)} style={{ padding: "8px 12px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, color: "#111827", outline: "none" }}>
                    <option value="">None</option>
                    {["North", "South", "East", "West", "North-East", "North-West", "South-East", "South-West"].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 13, color: "#9ca3af" }}>Gate</label>
                  <select value={gate} onChange={e => setGate(e.target.value)} style={{ padding: "8px 12px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, color: "#111827", outline: "none" }}>
                    <option value="">None</option>
                    {Array.from({ length: 10 }, (_, i) => `Gate ${i + 1}`).concat(["Gate A", "Gate B", "Gate C", "Gate D"]).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 13, color: "#9ca3af" }}>Stand</label>
                  <select value={stand} onChange={e => setStand(e.target.value)} style={{ padding: "8px 12px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, color: "#111827", outline: "none" }}>
                    <option value="">None</option>
                    {["Lower Stand", "Upper Stand", "Middle Stand", "Ground Level", "VIP Box", "Balcony"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: 12, color: "#9ca3af", fontWeight: "bold" }}>Category</label>
              <select 
                value={category}
                onChange={e => setCategory(e.target.value as LayoutSeatClass)}
                style={{ padding: "8px 12px", fontSize: 13, background: "#111118", border: "1px solid #374151", borderRadius: 6, color: "#fff", outline: "none" }}
              >
                {Object.keys(CLASS_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: 12, color: "#9ca3af", fontWeight: "bold" }}>Rows</label>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="text" value={rowStart} onChange={e => setRowStart(e.target.value)} maxLength={1} style={{ width: 40, padding: "8px", textAlign: "center", background: "#111118", border: "1px solid #374151", borderRadius: 6, color: "#fff" }} />
                <span style={{ color: "#9ca3af" }}>to</span>
                <input type="text" value={rowEnd} onChange={e => setRowEnd(e.target.value)} maxLength={1} style={{ width: 40, padding: "8px", textAlign: "center", background: "#111118", border: "1px solid #374151", borderRadius: 6, color: "#fff" }} />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: 12, color: "#9ca3af", fontWeight: "bold" }}>Columns</label>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" value={colStart} onChange={e => setColStart(Number(e.target.value))} style={{ width: 50, padding: "8px", textAlign: "center", background: "#111118", border: "1px solid #374151", borderRadius: 6, color: "#fff" }} />
                <span style={{ color: "#9ca3af" }}>to</span>
                <input type="number" value={colEnd} onChange={e => setColEnd(Number(e.target.value))} style={{ width: 50, padding: "8px", textAlign: "center", background: "#111118", border: "1px solid #374151", borderRadius: 6, color: "#fff" }} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", height: "100%", paddingBottom: "2px", gap: "8px" }}>
              {blocks.some(b => b.selected) ? (
                <>
                  <button type="button" onClick={updateBlock} style={{ padding: "8px 16px", background: "linear-gradient(to right, #10b981, #3b82f6)", color: "#fff", borderRadius: 6, fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                    Update Selected
                  </button>
                  <button type="button" onClick={addBlock} style={{ padding: "8px 16px", background: "#374151", color: "#fff", borderRadius: 6, fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                    + Add as New
                  </button>
                </>
              ) : (
                <button type="button" onClick={addBlock} style={{ padding: "8px 16px", background: "#8b5cf6", color: "#fff", borderRadius: 6, fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                  + Add Block
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button type="button" onClick={deleteSelected} disabled={!blocks.some(b => b.selected)} style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", borderRadius: 6, border: "1px solid rgba(239, 68, 68, 0.3)", cursor: "pointer" }}>
              Delete Selected Block
            </button>

            {blocks.some(b => b.selected) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: "bold" }}>Change Category:</span>
                <select 
                  value={blocks.find(b => b.selected)?.category}
                  onChange={e => {
                    const newCat = e.target.value as LayoutSeatClass;
                    setBlocks(blocks.map(b => b.selected ? { ...b, category: newCat } : b));
                  }}
                  style={{ padding: "6px 12px", fontSize: 13, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, color: "#111827", outline: "none" }}
                >
                  {Object.keys(CLASS_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            
            <div style={{ flex: 1 }} />
            
            <button type="button" onClick={onCancel} disabled={isSaving} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #374151", background: "#111118", color: "#fff", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={isSaving || isSaved} style={{ padding: "8px 24px", background: isSaved ? "#10b981" : "linear-gradient(to right, #8b5cf6, #eab308)", color: "#12111a", borderRadius: 6, fontWeight: "bold", border: "none", cursor: (isSaving || isSaved) ? "not-allowed" : "pointer" }}>
              {isSaving ? "Saving..." : isSaved ? "✓ Saved!" : "Save Layout"}
            </button>
          </div>
        </>
      )}

      <div style={{ background: "#ffffff", borderRadius: 12, overflow: "auto", border: "1px solid #e5e7eb", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 600, height: readonly ? "80vh" : 600 }}>
        
        {shape === 'circular' && activeBlockId && (
          <div style={{ padding: "16px", width: "100%", display: "flex", justifyContent: "flex-start", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
            <button 
              type="button" 
              onClick={() => setActiveBlockId(null)}
              style={{ padding: "8px 16px", background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
            >
              ← Back to Stadium Overview
            </button>
          </div>
        )}

        {shape === 'circular' && !activeBlockId ? (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
            <StadiumSvgView 
              blocks={blocks.map(b => ({
                id: b.id,
                name: b.name,
                stand: b.stand,
                gate: b.gate,
                direction: b.direction,
                category: b.category,
                seatCount: (Math.abs(b.colEnd - b.colStart) + 1) * (Math.abs(b.rowEnd.charCodeAt(0) - b.rowStart.charCodeAt(0)) + 1) - (b.disabledSeats?.length || 0)
              }))}
              onBlockClick={(b) => setActiveBlockId(b.id)}
            />
          </div>
        ) : (
        <Stage width={800} height={activeBlockId ? 1000 : maxBlockY} onClick={(e) => {
          if (!readonly && e.target === e.target.getStage()) {
            setBlocks(blocks.map(b => ({ ...b, selected: false })));
          }
        }}>
          <Layer>
            {/* Field / Stage Indicator */}
            {shape === 'rectangular' && (
              <Group x={200} y={50}>
                <Rect width={400} height={30} fill="#f3f4f6" stroke="#d1d5db" cornerRadius={6} />
                <Text text="SCREEN" fill="#6b7280" fontSize={14} fontStyle="bold" width={400} align="center" y={8} />
              </Group>
            )}
            {shape === 'circular' && (
              <Group x={400} y={300}>
                <Circle radius={60} fill="#f3f4f6" stroke="#d1d5db" />
                <Text text="FIELD" fill="#6b7280" fontSize={14} fontStyle="bold" x={-20} y={-7} />
              </Group>
            )}
            {shape === 'square' && (
              <Group x={300} y={200}>
                <Rect width={200} height={200} fill="#f3f4f6" stroke="#d1d5db" cornerRadius={12} />
                <Text text="STAGE" fill="#6b7280" fontSize={16} fontStyle="bold" width={200} align="center" y={90} />
              </Group>
            )}

            {/* Render Blocks */}
            {blocks.filter(b => activeBlockId ? b.id === activeBlockId : true).map(block => {
              const startCharCode = block.rowStart.charCodeAt(0) || 65;
              const endCharCode = block.rowEnd.charCodeAt(0) || 65;
              const rowsCount = Math.abs((isNaN(endCharCode) ? startCharCode : endCharCode) - startCharCode) + 1;
              const colsCount = Math.abs(block.colEnd - block.colStart) + 1;
              
              const seatSize = 16;
              const seatGap = 6;
              
              const innerWidth = colsCount * (seatSize + seatGap) - seatGap;
              const innerHeight = rowsCount * (seatSize + seatGap) - seatGap;

              const paddingX = 16;
              const paddingTop = 32; // space for header
              const paddingBottom = 16;

              const blockWidth = 760; // User requested movable block width to full
              const blockHeight = innerHeight + paddingTop + paddingBottom;

              const color = CLASS_COLORS[block.category] || "#6366f1";

              // Generate the tiny seat squares
              const seatSquares = [];
              const gridStartX = (blockWidth - innerWidth) / 2;
              const gridStartY = paddingTop;

              for (let r = 0; r < rowsCount; r++) {
                for (let c = 0; c < colsCount; c++) {
                  const seatKey = `${r}-${c}`;
                  const isSkipped = block.disabledSeats?.includes(seatKey);

                  seatSquares.push(
                    <Rect
                      key={`seat-${r}-${c}`}
                      x={gridStartX + c * (seatSize + seatGap)}
                      y={gridStartY + r * (seatSize + seatGap)}
                      width={seatSize}
                      height={seatSize}
                      fill={isSkipped ? "#f3f4f6" : color}
                      stroke={isSkipped ? "#d1d5db" : "transparent"}
                      strokeWidth={1}
                      cornerRadius={2}
                      onClick={(e) => {
                        if (readonly) return;
                        e.cancelBubble = true; // prevent selecting block
                        toggleSeat(block.id, seatKey);
                      }}
                      onTap={(e) => {
                        if (readonly) return;
                        e.cancelBubble = true;
                        toggleSeat(block.id, seatKey);
                      }}
                      onMouseEnter={(e) => {
                        if (readonly) return;
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'pointer';
                      }}
                      onMouseLeave={(e) => {
                        if (readonly) return;
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'default';
                      }}
                    />
                  );
                }
              }

              return (
                <Group
                  key={block.id}
                  x={activeBlockId ? 20 : block.x}
                  y={activeBlockId ? 50 : block.y}
                  draggable={!readonly}
                  onDragEnd={(e) => !readonly && handleDragEnd(e, block.id)}
                  onClick={() => !readonly && handleSelectBlock(block.id)}
                  onTap={() => !readonly && handleSelectBlock(block.id)}
                >
                  {/* Outer Block Frame */}
                  <Rect
                    width={blockWidth}
                    height={blockHeight}
                    fill={`${color}15`} // very transparent fill
                    stroke={block.selected ? "#111827" : color}
                    strokeWidth={block.selected ? 4 : 2}
                    cornerRadius={8}
                    shadowColor="rgba(0,0,0,0.3)"
                    shadowBlur={10}
                    shadowOffset={{ x: 0, y: 4 }}
                  />

                  {/* Header Strip */}
                  <Rect
                    width={blockWidth}
                    height={20}
                    fill={color}
                    cornerRadius={[8, 8, 0, 0]}
                  />

                  <Text
                    text={[(shape !== 'rectangular' && block.gate) ? `G${block.gate} - ` : "", `Block ${block.name}`].join("")}
                    fill="#fff"
                    fontSize={11}
                    fontStyle="bold"
                    width={blockWidth}
                    align="center"
                    y={5}
                  />

                  {/* Body Info */}
                  <Text
                    text={[
                      (shape !== 'rectangular' && block.direction) ? block.direction : null,
                      (shape !== 'rectangular' && block.gate) ? block.gate : null,
                      (shape !== 'rectangular' && block.stand) ? block.stand : null,
                      `Rows: ${block.rowStart}-${block.rowEnd}`,
                      `Cols: ${block.colStart}-${block.colEnd}`,
                      `Seats: ${rowsCount * colsCount}`
                    ].filter(Boolean).join('\n')}
                    fill="#374151"
                    fontSize={10}
                    width={blockWidth}
                    align="center"
                    y={32}
                    lineHeight={1.4}
                  />{/* Draw the Seat Grid */}
                  {seatSquares}

                </Group>
              );
            })}
          </Layer>
        </Stage>
        )}
        <div style={{ position: "absolute", bottom: 10, left: 10, color: "var(--text-muted)", fontSize: 12, background: "rgba(0,0,0,0.5)", padding: "4px 8px", borderRadius: 4 }}>
          Drag blocks to position them. Click to select.
        </div>
      </div>
    </div>
  );
}
