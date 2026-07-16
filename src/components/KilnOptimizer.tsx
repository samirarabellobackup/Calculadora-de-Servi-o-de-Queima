import React, { useState, useMemo } from 'react';
import { Flame, Sparkles, Layers, Info, RotateCcw, HelpCircle, Check, AlertTriangle } from 'lucide-react';
import { PieceItem } from '../types';

interface KilnOptimizerProps {
  piecesList: PieceItem[];
}

export interface PackedPiece {
  id: string;
  nome: string;
  tipo: 'biscoito' | 'esmalte';
  w: number; // largura (cm)
  d: number; // profundidade (cm)
  h: number; // altura (cm)
  x: number; // center X on shelf (cm, relative to 0,0 center)
  y: number; // center Y on shelf (cm, relative to 0,0 center)
  color: string;
  stackedOnId?: string; // ID of the piece this is stacked on
}

export interface ShelfLevel {
  id: string;
  number: number;
  tipo: 'biscoito' | 'esmalte';
  pieces: PackedPiece[];
  maxHeight: number;
  utilizationArea: number; // cm² occupied
}

// Support columns (props) per shelf
// Total of 6 columns available in studio of 4cm diameter each.
// For a single shelf level, 3 columns are typically used to support the shelf above.
// They are located at 120-degree angles around the perimeter.
export interface SupportColumn {
  x: number;
  y: number;
  r: number; // radius (cm)
}

const SHELF_DIAMETER = 53; // cm
const SHELF_RADIUS = SHELF_DIAMETER / 2; // 26.5 cm
const COLUMN_RADIUS = 2; // 2cm radius (4cm diameter)
const SAFETY_PADDING = 2; // 2cm safety spacing between pieces

// Pre-defined columns layout (3 columns per shelf level to hold the next shelf)
const SUPPORT_COLUMNS: SupportColumn[] = [
  { x: 0, y: 21, r: COLUMN_RADIUS }, // Top column
  { x: -18.18, y: -10.5, r: COLUMN_RADIUS }, // Bottom-left (21 * cos(210), 21 * sin(210))
  { x: 18.18, y: -10.5, r: COLUMN_RADIUS }, // Bottom-right (21 * cos(330), 21 * sin(330))
];

// Helper to check if a rectangle fits inside a circle of radius R
function rectangleFitsInCircle(x: number, y: number, w: number, d: number, R: number): boolean {
  // Check all four corners of the rectangle relative to center (0,0)
  const halfW = w / 2;
  const halfD = d / 2;
  
  const corners = [
    { cx: x - halfW, cy: y - halfD },
    { cx: x + halfW, cy: y - halfD },
    { cx: x - halfW, cy: y + halfD },
    { cx: x + halfW, cy: y + halfD }
  ];

  for (const corner of corners) {
    const distSq = corner.cx * corner.cx + corner.cy * corner.cy;
    // We add 1 cm margin to the shelf edge for safety
    if (distSq > (R - 1.0) * (R - 1.0)) {
      return false;
    }
  }
  return true;
}

// Helper to check if a rectangle overlaps with a circle (support column)
function rectangleOverlapsCircle(
  rx: number, ry: number, rw: number, rd: number,
  cx: number, cy: number, cr: number,
  padding: number
): boolean {
  // Find closest point on rectangle to circle center
  const closestX = Math.max(rx - rw / 2, Math.min(cx, rx + rw / 2));
  const closestY = Math.max(ry - rd / 2, Math.min(cy, ry + rd / 2));

  const dx = closestX - cx;
  const dy = closestY - cy;
  const distanceSq = dx * dx + dy * dy;

  const minDistance = cr + padding;
  return distanceSq < minDistance * minDistance;
}

// Helper to check if two rectangles overlap
function rectanglesOverlap(
  x1: number, y1: number, w1: number, d1: number,
  x2: number, y2: number, w2: number, d2: number,
  padding: number
): boolean {
  const halfW1 = w1 / 2;
  const halfD1 = d1 / 2;
  const halfW2 = w2 / 2;
  const halfD2 = d2 / 2;

  const minGapX = halfW1 + halfW2 + padding;
  const minGapY = halfD1 + halfD2 + padding;

  return Math.abs(x1 - x2) < minGapX && Math.abs(y1 - y2) < minGapY;
}

// 2D Bin Packing algorithm for circular shelves
function packPiecesOnShelves(pieces: PieceItem[]): ShelfLevel[] {
  const shelves: ShelfLevel[] = [];
  
  // Separate into Biscoito and Esmalte (different temperatures/firings)
  const biscoitoPieces = pieces.filter(p => p.tipo === 'biscoito');
  const esmaltePieces = pieces.filter(p => p.tipo === 'esmalte');

  const palette = [
    '#E57373', '#F06292', '#BA68C8', '#9575CD', '#7986CB', 
    '#64B5F6', '#4FC3F7', '#4DD0E1', '#4DB6AC', '#81C784', 
    '#AED581', '#D4E157', '#FFD54F', '#FFB74D', '#FF8A65'
  ];

  let colorIdx = 0;
  const getNextColor = () => {
    const c = palette[colorIdx % palette.length];
    colorIdx++;
    return c;
  };

  const packGroup = (groupPieces: PieceItem[], tipo: 'biscoito' | 'esmalte') => {
    // Sort pieces by area descending
    const sorted = [...groupPieces].sort((a, b) => (b.largura * b.profundidade) - (a.largura * a.profundidade));

    for (const piece of sorted) {
      let placed = false;

      // FOR BISCOITO: Try to stack this piece on an existing piece first (since biscoito can be stacked!)
      if (tipo === 'biscoito') {
        for (const shelf of shelves.filter(s => s.tipo === 'biscoito')) {
          // Look for an existing base piece that doesn't have anything stacked on it yet
          const potentialBase = shelf.pieces.find(p => 
            !p.stackedOnId && 
            piece.largura <= p.w + 1.5 && 
            piece.profundidade <= p.d + 1.5 &&
            (p.h + piece.altura) <= 30 // cumulative height doesn't exceed meia fornada limit
          );

          if (potentialBase) {
            shelf.pieces.push({
              id: piece.id,
              nome: piece.nome,
              tipo: 'biscoito',
              w: piece.largura,
              d: piece.profundidade,
              h: piece.altura,
              x: potentialBase.x,
              y: potentialBase.y,
              color: getNextColor(),
              stackedOnId: potentialBase.id
            });
            shelf.maxHeight = Math.max(shelf.maxHeight, potentialBase.h + piece.altura);
            // We do not add to utilizationArea because it sits in the same 2D footprint!
            placed = true;
            break;
          }
        }
      }

      if (placed) continue;

      // Try placing on existing shelves of this type
      for (const shelf of shelves.filter(s => s.tipo === tipo)) {
        const result = tryPlacePieceOnShelf(piece, shelf, getNextColor());
        if (result) {
          shelf.pieces.push(result);
          shelf.maxHeight = Math.max(shelf.maxHeight, piece.altura);
          shelf.utilizationArea += piece.largura * piece.profundidade;
          placed = true;
          break;
        }
      }

      // If couldn't place on existing, create a new shelf
      if (!placed) {
        const newShelf: ShelfLevel = {
          id: `shelf-${tipo}-${shelves.length + 1}`,
          number: shelves.length + 1,
          tipo,
          pieces: [],
          maxHeight: piece.altura,
          utilizationArea: 0
        };

        const result = tryPlacePieceOnShelf(piece, newShelf, getNextColor());
        if (result) {
          newShelf.pieces.push(result);
          newShelf.maxHeight = piece.altura;
          newShelf.utilizationArea = piece.largura * piece.profundidade;
          shelves.push(newShelf);
        } else {
          // If a piece is so large it doesn't fit on an empty shelf, center it anyway
          const color = getNextColor();
          newShelf.pieces.push({
            id: piece.id,
            nome: piece.nome,
            tipo,
            w: piece.largura,
            d: piece.profundidade,
            h: piece.altura,
            x: 0,
            y: 0,
            color
          });
          newShelf.maxHeight = piece.altura;
          newShelf.utilizationArea = piece.largura * piece.profundidade;
          shelves.push(newShelf);
        }
      }
    }
  };

  packGroup(biscoitoPieces, 'biscoito');
  packGroup(esmaltePieces, 'esmalte');

  return shelves;
}

// Try finding a valid position on a shelf
function tryPlacePieceOnShelf(piece: PieceItem, shelf: ShelfLevel, color: string): PackedPiece | null {
  const w = piece.largura;
  const d = piece.profundidade;

  // We scan in spiral rings starting from center out to SHELF_RADIUS
  // This packs pieces tighter around the center
  for (let r = 0; r <= SHELF_RADIUS - Math.min(w, d) / 2; r += 1.5) {
    const numSteps = r === 0 ? 1 : Math.max(8, Math.floor(2 * Math.PI * r / 1.5));
    for (let i = 0; i < numSteps; i++) {
      const angle = (i * 2 * Math.PI) / numSteps;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);

      // 1. Check if rectangle fits inside the circular shelf
      if (!rectangleFitsInCircle(x, y, w, d, SHELF_RADIUS)) {
        continue;
      }

      // 2. Check overlap with support columns (4cm diameter / 2cm radius)
      let overlapsColumn = false;
      for (const col of SUPPORT_COLUMNS) {
        if (rectangleOverlapsCircle(x, y, w, d, col.x, col.y, col.r, 1.5)) {
          overlapsColumn = true;
          break;
        }
      }
      if (overlapsColumn) {
        continue;
      }

      // 3. Check overlap with existing packed pieces (with 2cm safety spacing)
      let overlapsPiece = false;
      for (const p of shelf.pieces) {
        if (rectanglesOverlap(x, y, w, d, p.x, p.y, p.w, p.d, SAFETY_PADDING)) {
          overlapsPiece = true;
          break;
        }
      }
      if (overlapsPiece) {
        continue;
      }

      // Fits! Return packed piece representation
      return {
        id: piece.id,
        nome: piece.nome,
        tipo: piece.tipo,
        w,
        d,
        h: piece.altura,
        x,
        y,
        color
      };
    }
  }

  return null;
}

export const KilnOptimizer: React.FC<KilnOptimizerProps> = ({ piecesList }) => {
  const [activeShelfId, setActiveShelfId] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  // Compute shelf packing
  const shelves = useMemo(() => {
    return packPiecesOnShelves(piecesList);
  }, [piecesList]);

  // Set default active shelf
  React.useEffect(() => {
    if (shelves.length > 0 && (!activeShelfId || !shelves.some(s => s.id === activeShelfId))) {
      setActiveShelfId(shelves[0].id);
    }
  }, [shelves, activeShelfId]);

  const activeShelf = shelves.find(s => s.id === activeShelfId) || shelves[0];

  const totalShelfArea = Math.PI * SHELF_RADIUS * SHELF_RADIUS; // ~2206 cm²
  
  if (piecesList.length === 0) {
    return null;
  }

  return (
    <div className="bg-white p-5 rounded-2xl border border-[#E2DED0] space-y-5" id="kiln-optimizer-card">
      <div className="flex justify-between items-center pb-3 border-b border-[#F2EFE9]">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#C15E3F]" />
          <div>
            <h3 className="text-sm font-bold text-[#4A443F]">Simulador de Arrumação e Prateleiras</h3>
            <p className="text-[10px] text-[#8A847C]">Otimização inteligente automática do espaço útil</p>
          </div>
        </div>
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="p-1 rounded-full text-[#8A847C] hover:text-[#C15E3F] hover:bg-[#FDF7F5] transition-colors"
          title="Como funciona a arrumação?"
          id="btn-info-optimizer"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {showExplanation && (
        <div className="p-3 bg-[#FDF7F5] border border-[#E57373]/30 rounded-xl text-xs space-y-2 text-[#4A443F]">
          <p className="font-semibold text-[#C15E3F] flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> Como funciona este cálculo inteligente?
          </p>
          <ul className="list-disc pl-4 space-y-1 text-[#4A443F]/90 text-[11px] leading-relaxed">
            <li><strong>Separação de Queimas:</strong> Peças de Biscoito (1000ºC) e Esmalte (1240ºC) são organizadas em prateleiras separadas pois exigem temperaturas e programações diferentes.</li>
            <li><strong>Espaço das Colunas:</strong> Cada nível utiliza 3 colunas de sustentação de 4cm de diâmetro (representadas em cinza), que ocupam espaço físico.</li>
            <li><strong>Espaçamento de Segurança (2 cm):</strong> O algoritmo reserva uma margem de segurança de 2 cm ao redor de cada peça para evitar contato acidental e possíveis deformações.</li>
            <li><strong>Distribuição Circular:</strong> Otimizamos a disposição para ocupar as prateleiras de 53 cm da melhor forma possível, evitando que você precise alugar o forno inteiro se não precisar.</li>
          </ul>
        </div>
      )}

      {/* Main Grid: Stack View and Interactive Map */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        
        {/* Left column: 3D-like Kiln Shelf Stack */}
        <div className="md:col-span-2 flex flex-col justify-center items-center bg-[#F9F8F6] p-4 rounded-xl border border-[#E2DED0] relative">
          <span className="text-[9px] font-bold uppercase text-[#8A847C] absolute top-2 left-2">Esquema de Empilhamento</span>
          
          <div className="w-full flex flex-col-reverse gap-3 items-center justify-center min-h-[180px] pt-6 pb-2">
            {shelves.map((s, index) => {
              const isActive = s.id === activeShelfId;
              const isEsmalte = s.tipo === 'esmalte';
              
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveShelfId(s.id)}
                  className={`w-11/12 py-2.5 px-3 rounded-lg border-2 text-left transition-all relative flex flex-col justify-between ${
                    isActive 
                      ? 'border-[#C15E3F] bg-white shadow-md scale-102 z-10' 
                      : 'border-[#E2DED0] bg-[#FDFDFD] hover:border-[#8A847C] hover:scale-[1.01]'
                  }`}
                  id={`btn-select-shelf-${s.id}`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-bold text-[#4A443F]">Prateleira {index + 1}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                      isEsmalte ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {s.tipo}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1 text-[9px] text-[#8A847C]">
                    <span>Peças: {s.pieces.length}</span>
                    <span>Max H: {s.maxHeight} cm</span>
                  </div>
                  {isActive && (
                    <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#C15E3F] rounded-full flex items-center justify-center text-white text-[8px]">
                      <Check className="w-2 h-2" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="w-full text-center pt-2 border-t border-[#E2DED0] text-[10px] text-[#8A847C]">
            Total de prateleiras necessárias: <strong className="text-[#C15E3F]">{shelves.length}</strong>
          </div>
        </div>

        {/* Right column: Interactive Visual Map of selected shelf */}
        {activeShelf && (
          <div className="md:col-span-3 flex flex-col justify-between items-center bg-[#FDFDFD] p-4 rounded-xl border border-[#E2DED0]">
            <div className="w-full flex justify-between items-center mb-3">
              <div>
                <span className="text-xs font-bold text-[#4A443F] block">Arrumação da Prateleira #{shelves.findIndex(s => s.id === activeShelf.id) + 1}</span>
                <span className="text-[10px] text-[#8A847C] flex items-center gap-1">
                  {activeShelf.tipo === 'esmalte' ? (
                    <><Sparkles className="w-3 h-3 text-amber-500" /> Queima de Esmalte (1240ºC)</>
                  ) : (
                    <><Flame className="w-3 h-3 text-[#C15E3F]" /> Queima de Biscoito (1000ºC)</>
                  )}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#8A847C] block">Ocupação Útil</span>
                <span className="text-xs font-mono font-bold text-[#C15E3F]">
                  {Math.round((activeShelf.utilizationArea / totalShelfArea) * 100)}% do espaço
                </span>
              </div>
            </div>

            {/* Shelf SVG rendering */}
            <div className="relative w-full max-w-[220px] aspect-square flex items-center justify-center bg-[#F9F8F6] rounded-full border border-[#E2DED0] p-1 shadow-inner">
              <svg 
                viewBox="-28 -28 56 56" 
                className="w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* 53cm circular shelf base */}
                <circle 
                  cx="0" 
                  cy="0" 
                  r="26.5" 
                  fill="#EAE7DD" 
                  stroke="#C0BAB0" 
                  strokeWidth="0.8" 
                />

                {/* Grid guidelines for scaling (subtle) */}
                <circle cx="0" cy="0" r="20" fill="none" stroke="#D5D0C5" strokeWidth="0.2" strokeDasharray="1,1" />
                <circle cx="0" cy="0" r="10" fill="none" stroke="#D5D0C5" strokeWidth="0.2" strokeDasharray="1,1" />
                <line x1="-26.5" y1="0" x2="26.5" y2="0" stroke="#D5D0C5" strokeWidth="0.1" strokeDasharray="1,1" />
                <line x1="0" y1="-26.5" x2="0" y2="26.5" stroke="#D5D0C5" strokeWidth="0.1" strokeDasharray="1,1" />

                {/* Support Columns (3 support props, 4cm diameter -> 2cm radius) */}
                {SUPPORT_COLUMNS.map((col, idx) => (
                  <g key={`col-${idx}`}>
                    <circle 
                      cx={col.x} 
                      cy={col.y} 
                      r={col.r} 
                      fill="#9E9E9E" 
                      stroke="#757575" 
                      strokeWidth="0.5" 
                    />
                    {/* Tiny visual representation of the column inner structure */}
                    <circle 
                      cx={col.x} 
                      cy={col.y} 
                      r={col.r * 0.6} 
                      fill="none" 
                      stroke="#EAE7DD" 
                      strokeWidth="0.3" 
                    />
                  </g>
                ))}

                {/* Packed Ceramic Pieces */}
                {[...activeShelf.pieces].sort((a, b) => (a.stackedOnId ? 1 : 0) - (b.stackedOnId ? 1 : 0)).map((p) => {
                  const isStacked = !!p.stackedOnId;
                  const x = isStacked ? p.x + 0.7 : p.x;
                  const y = isStacked ? p.y - 0.7 : p.y;
                  const w = isStacked ? p.w * 0.9 : p.w; // Nest inside slightly
                  const d = isStacked ? p.d * 0.9 : p.d;
                  const halfW = w / 2;
                  const halfD = d / 2;

                  return (
                    <g key={p.id}>
                      {/* Safety Padding Boundary (Dashed line) - Only draw for non-stacked base pieces to avoid clutter */}
                      {!isStacked && (
                        <rect
                          x={x - (halfW + 1)}
                          y={y - (halfD + 1)}
                          width={w + 2}
                          height={d + 2}
                          rx="1.2"
                          ry="1.2"
                          fill="none"
                          stroke={p.color}
                          strokeWidth="0.15"
                          strokeDasharray="0.8,0.8"
                          opacity="0.5"
                        />
                      )}
                      
                      {/* Real Ceramic piece bounds */}
                      <rect
                        x={x - halfW}
                        y={y - halfD}
                        width={w}
                        height={d}
                        rx="1"
                        ry="1"
                        fill={p.color}
                        fillOpacity={isStacked ? 0.95 : 0.8}
                        stroke="#4A443F"
                        strokeWidth={isStacked ? "0.3" : "0.45"}
                        strokeDasharray={isStacked ? "1, 0.5" : undefined}
                        className="transition-all hover:fill-opacity-100"
                      />
                      
                      {/* Short abbreviation label of piece name inside */}
                      <text
                        x={x}
                        y={y + 0.5}
                        fill={isStacked ? "#C15E3F" : "#000000"}
                        fontSize={isStacked ? "2.0" : "2.5"}
                        fontWeight="bold"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {p.nome.length > 7 ? p.nome.substring(0, 6) + '.' : p.nome}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* List of pieces on this specific active shelf */}
            <div className="w-full mt-3 pt-3 border-t border-[#F2EFE9] space-y-1.5">
              <span className="text-[9px] font-bold uppercase text-[#8A847C] block mb-1">Peças na Prateleira:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[100px] overflow-y-auto pr-1">
                {activeShelf.pieces.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 p-1.5 bg-[#F9F8F6] border border-[#E2DED0] rounded-lg text-[10px]">
                    <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: p.color }} />
                    <div className="truncate flex-1">
                      <div className="flex items-center gap-1 truncate">
                        <span className="font-semibold text-[#4A443F] block truncate leading-tight">{p.nome}</span>
                        {p.stackedOnId && (
                          <span className="text-[8px] bg-[#FDF7F5] text-[#C15E3F] font-bold px-1 rounded-sm border border-[#C15E3F]/20">
                            Empilhada
                          </span>
                        )}
                      </div>
                      <span className="text-[#8A847C] text-[9px]">{p.w}x{p.d}x{p.h}cm</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer warning */}
      <div className="flex gap-2 items-start p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-[10px] text-blue-700 leading-relaxed">
        <Info className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
        <p>
          <strong>Dica Ecológica:</strong> Ao preencher melhor as prateleiras de queima compartilhada, você ajuda o estúdio a otimizar a eficiência energética do forno e reduz a pegada de carbono geral do ateliê!
        </p>
      </div>
    </div>
  );
};
