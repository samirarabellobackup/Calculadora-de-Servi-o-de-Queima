import React, { useState, useMemo } from 'react';
import { Flame, Sparkles, Layers, Info, RotateCcw, HelpCircle, Check, AlertTriangle } from 'lucide-react';
import { PieceItem, FiringType } from '../types';

interface KilnOptimizerProps {
  piecesList: PieceItem[];
}

export interface PackedPiece {
  id: string;
  nome: string;
  tipo: FiringType;
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
  tipo: FiringType;
  pieces: PackedPiece[];
  maxHeight: number;
  utilizationArea: number; // cm² occupied
  supportColumns?: SupportColumn[];
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

const SHELF_DIAMETER = 50; // cm de diâmetro útil de espaço plano (diâmetro real de 53cm facetado)
const SHELF_RADIUS = SHELF_DIAMETER / 2; // 25 cm de raio de espaço útil plano
const COLUMN_RADIUS = 1.75; // Colunas com diâmetro de 3,5cm (raio de 1,75cm)
const SAFETY_PADDING_ESMALTE = 0.5; // Espaçamento de segurança para esmalte: 5mm (entre 5mm e 1cm)
const SAFETY_PADDING_BISCOITO = 0.1; // Espaçamento mínimo para biscoito: 1mm (permite contato e empilhamento)

// Layout das 3 colunas de sustentação ajustadas para o raio plano útil (raio de 20cm da coluna até o centro)
const SUPPORT_COLUMNS: SupportColumn[] = [
  { x: 0, y: 20, r: COLUMN_RADIUS }, // Coluna superior
  { x: -17.32, y: -10, r: COLUMN_RADIUS }, // Coluna inferior esquerda (20 * cos(210º), 20 * sin(210º))
  { x: 17.32, y: -10, r: COLUMN_RADIUS }, // Coluna inferior direita (20 * cos(330º), 20 * sin(330º))
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
    // Since 50cm (radius R=25cm) is already flat useful space inside the physical 53cm shelf,
    // we only need a very small safety boundary (e.g. 0.2cm) from R to fit maximum pieces.
    if (distSq > (R - 0.2) * (R - 0.2)) {
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

// Helper to find a safe support column rotation for a set of pieces
function findSafeColumnsRotation(
  pieces: { x: number; y: number; w: number; d: number }[],
  padding: number
): SupportColumn[] | null {
  if (pieces.length === 0) return SUPPORT_COLUMNS;

  // Try 12 different rotation angles for the support columns (from 0 to 110 degrees)
  // Since columns are spaced symmetrically 120 degrees apart, this covers all unique configurations
  for (let angleDeg = 0; angleDeg < 120; angleDeg += 10) {
    const theta = (angleDeg * Math.PI) / 180;
    const rotatedCols = SUPPORT_COLUMNS.map(col => {
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      return {
        x: col.x * cosT - col.y * sinT,
        y: col.x * sinT + col.y * cosT,
        r: col.r
      };
    });

    let safeRotation = true;
    for (const col of rotatedCols) {
      for (const p of pieces) {
        if (rectangleOverlapsCircle(p.x, p.y, p.w, p.d, col.x, col.y, col.r, padding)) {
          safeRotation = false;
          break;
        }
      }
      if (!safeRotation) break;
    }

    if (safeRotation) {
      return rotatedCols;
    }
  }

  return null;
}

// Find a set of candidate distinct positions to try placing the first piece of a shelf
function getCandidatePositionsForPiece(
  piece: PieceItem,
  shelf: ShelfLevel,
  padding: number
): { x: number; y: number }[] {
  const w = piece.largura;
  const d = piece.profundidade;
  const candidates: { x: number; y: number }[] = [];

  // Candidate 1: Center of the shelf
  if (rectangleFitsInCircle(0, 0, w, d, SHELF_RADIUS)) {
    candidates.push({ x: 0, y: 0 });
  }

  // Candidate 2: Try some distinct off-center positions at various radii and angles
  for (let r = 4.0; r <= SHELF_RADIUS - Math.min(w, d) / 2; r += 4.0) {
    for (let angleIdx = 0; angleIdx < 8; angleIdx++) {
      const angle = (angleIdx * 2 * Math.PI) / 8;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);

      if (rectangleFitsInCircle(x, y, w, d, SHELF_RADIUS)) {
        const isDistinct = candidates.every(c => Math.hypot(c.x - x, c.y - y) > 3.0);
        if (isDistinct) {
          candidates.push({ x, y });
        }
      }
    }
  }

  return candidates.slice(0, 10);
}

// 2D Bin Packing algorithm for circular shelves
export function packPiecesOnShelves(pieces: PieceItem[]): ShelfLevel[] {
  const shelves: ShelfLevel[] = [];
  
  // Separate into separate firing runs (different temperatures/types)
  const biscoitoPieces = pieces.filter(p => p.tipo === 'biscoito');
  const esmaltePieces = pieces.filter(p => p.tipo === 'esmalte');
  const monoqueimaPieces = pieces.filter(p => p.tipo === 'monoqueima');
  const terceiraPieces = pieces.filter(p => p.tipo === 'terceira_queima');

  const palette = [
    '#E57373', '#F06292', '#BA68C8', '#9575CD', '#7986CB', 
    '#64B5F6', '#4FC3F7', '#4DD0E1', '#4DB6AC', '#81C784', 
    '#AED581', '#D4E157', '#FFD54F', '#FFB74D', '#FF8A65'
  ];

  // Assign stable colors to each piece from the start to prevent trial runs from shuffling them
  const pieceColors: Record<string, string> = {};
  pieces.forEach((p, index) => {
    pieceColors[p.id] = palette[index % palette.length];
  });

  const packGroup = (groupPieces: PieceItem[], tipo: FiringType) => {
    // Sort pieces by area descending to pack larger items first
    const sorted = [...groupPieces].sort((a, b) => (b.largura * b.profundidade) - (a.largura * a.profundidade));
    const padding = tipo === 'biscoito' ? SAFETY_PADDING_BISCOITO : SAFETY_PADDING_ESMALTE;

    const placedSet = new Set<string>();

    for (let idx = 0; idx < sorted.length; idx++) {
      const piece = sorted[idx];
      if (placedSet.has(piece.id)) continue;

      let placed = false;

      // 1. FOR BISCOITO: Try to stack this piece on an existing piece first (since biscoito can be stacked!)
      if (tipo === 'biscoito') {
        for (const shelf of shelves.filter(s => s.tipo === 'biscoito')) {
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
              color: pieceColors[piece.id],
              stackedOnId: potentialBase.id
            });
            shelf.maxHeight = Math.max(shelf.maxHeight, potentialBase.h + piece.altura);
            placed = true;
            placedSet.add(piece.id);
            break;
          }
        }
      }

      if (placed) continue;

      // 2. Try placing on existing shelves of this type
      for (const shelf of shelves.filter(s => s.tipo === tipo)) {
        const result = tryPlacePieceOnShelf(piece, shelf, pieceColors[piece.id], padding);
        if (result) {
          shelf.pieces.push(result);
          shelf.maxHeight = Math.max(shelf.maxHeight, piece.altura);
          shelf.utilizationArea += piece.largura * piece.profundidade;
          
          // Update support columns rotation based on the new piece
          const finalPieces = shelf.pieces.map(p => ({ x: p.x, y: p.y, w: p.w, d: p.d }));
          const safeCols = findSafeColumnsRotation(finalPieces, padding);
          if (safeCols) {
            shelf.supportColumns = safeCols;
          }
          placed = true;
          placedSet.add(piece.id);
          break;
        }
      }

      if (placed) continue;

      // 3. If it couldn't be placed on existing shelves, we create a new shelf.
      // To prevent centering the first piece at (0,0) and blocking the shelf for remaining pieces,
      // we test several candidate starting positions for this first piece to find the layout
      // that maximizes the number of remaining pieces we can pack on this new shelf!
      const remainingUnpacked = sorted.slice(idx).filter(p => !placedSet.has(p.id));
      const newShelfId = `shelf-${tipo}-${shelves.length + 1}`;
      const newShelfNumber = shelves.length + 1;

      const emptyShelf: ShelfLevel = {
        id: newShelfId,
        number: newShelfNumber,
        tipo,
        pieces: [],
        maxHeight: piece.altura,
        utilizationArea: 0
      };

      const candidates = getCandidatePositionsForPiece(piece, emptyShelf, padding);
      let bestShelf: ShelfLevel | null = null;
      let bestPackedIds: string[] = [];

      if (candidates.length === 0) {
        // Fallback: Place at center (0,0) if no candidate positions fit
        const fallbackShelf: ShelfLevel = {
          id: newShelfId,
          number: newShelfNumber,
          tipo,
          pieces: [{
            id: piece.id,
            nome: piece.nome,
            tipo,
            w: piece.largura,
            d: piece.profundidade,
            h: piece.altura,
            x: 0,
            y: 0,
            color: pieceColors[piece.id]
          }],
          maxHeight: piece.altura,
          utilizationArea: piece.largura * piece.profundidade,
          supportColumns: SUPPORT_COLUMNS
        };
        bestShelf = fallbackShelf;
        bestPackedIds = [piece.id];
      } else {
        // Test each candidate position and find the one with the best packing yield
        for (const cand of candidates) {
          const initialPiece = { x: cand.x, y: cand.y, w: piece.largura, d: piece.profundidade };
          const initialCols = findSafeColumnsRotation([initialPiece], padding);
          if (!initialCols) continue; // Skip candidate if columns cannot co-exist with just this piece

          const tempShelf: ShelfLevel = {
            id: newShelfId,
            number: newShelfNumber,
            tipo,
            pieces: [{
              id: piece.id,
              nome: piece.nome,
              tipo,
              w: piece.largura,
              d: piece.profundidade,
              h: piece.altura,
              x: cand.x,
              y: cand.y,
              color: pieceColors[piece.id]
            }],
            maxHeight: piece.altura,
            utilizationArea: piece.largura * piece.profundidade,
            supportColumns: initialCols
          };

          const packedIds = [piece.id];

          // Try to pack as many of the other remaining pieces on this shelf as possible
          for (let j = 1; j < remainingUnpacked.length; j++) {
            const nextPiece = remainingUnpacked[j];
            let nextPlaced = false;

            // Try stacking if it's biscoito
            if (tipo === 'biscoito') {
              const potentialBase = tempShelf.pieces.find(p => 
                !p.stackedOnId && 
                nextPiece.largura <= p.w + 1.5 && 
                nextPiece.profundidade <= p.d + 1.5 &&
                (p.h + nextPiece.altura) <= 30
              );

              if (potentialBase) {
                tempShelf.pieces.push({
                  id: nextPiece.id,
                  nome: nextPiece.nome,
                  tipo: 'biscoito',
                  w: nextPiece.largura,
                  d: nextPiece.profundidade,
                  h: nextPiece.altura,
                  x: potentialBase.x,
                  y: potentialBase.y,
                  color: pieceColors[nextPiece.id],
                  stackedOnId: potentialBase.id
                });
                tempShelf.maxHeight = Math.max(tempShelf.maxHeight, potentialBase.h + nextPiece.altura);
                packedIds.push(nextPiece.id);
                nextPlaced = true;
              }
            }

            if (nextPlaced) continue;

            const result = tryPlacePieceOnShelf(nextPiece, tempShelf, pieceColors[nextPiece.id], padding);
            if (result) {
              tempShelf.pieces.push(result);
              tempShelf.maxHeight = Math.max(tempShelf.maxHeight, nextPiece.altura);
              tempShelf.utilizationArea += nextPiece.largura * nextPiece.profundidade;
              packedIds.push(nextPiece.id);

              // Update support columns rotation
              const currentPieces = tempShelf.pieces.map(p => ({ x: p.x, y: p.y, w: p.w, d: p.d }));
              const safeCols = findSafeColumnsRotation(currentPieces, padding);
              if (safeCols) {
                tempShelf.supportColumns = safeCols;
              }
            }
          }

          // Keep candidate with higher piece count, or higher area utilization if tied
          if (!bestShelf || 
              packedIds.length > bestPackedIds.length || 
              (packedIds.length === bestPackedIds.length && tempShelf.utilizationArea > bestShelf.utilizationArea)) {
            bestShelf = tempShelf;
            bestPackedIds = packedIds;
          }
        }
      }

      // Add the chosen shelf layout to shelves and mark all packed items as placed
      if (bestShelf) {
        shelves.push(bestShelf);
        for (const id of bestPackedIds) {
          placedSet.add(id);
        }
      }
    }
  };

  packGroup(biscoitoPieces, 'biscoito');
  packGroup(esmaltePieces, 'esmalte');
  packGroup(monoqueimaPieces, 'monoqueima');
  packGroup(terceiraPieces, 'terceira_queima');

  return shelves;
}

// Try finding a valid position on a shelf
function tryPlacePieceOnShelf(piece: PieceItem, shelf: ShelfLevel, color: string, padding: number): PackedPiece | null {
  const w = piece.largura;
  const d = piece.profundidade;

  // We scan in spiral rings starting from center out to SHELF_RADIUS
  // This packs pieces tighter around the center (1.0cm steps for finer placement)
  for (let r = 0; r <= SHELF_RADIUS - Math.min(w, d) / 2; r += 1.0) {
    const numSteps = r === 0 ? 1 : Math.max(12, Math.floor(2 * Math.PI * r / 1.0));
    for (let i = 0; i < numSteps; i++) {
      const angle = (i * 2 * Math.PI) / numSteps;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);

      // 1. Check if rectangle fits inside the circular useful shelf area
      if (!rectangleFitsInCircle(x, y, w, d, SHELF_RADIUS)) {
        continue;
      }

      // 2. Check overlap with existing packed pieces (using the specific padding)
      let overlapsPiece = false;
      for (const p of shelf.pieces) {
        if (rectanglesOverlap(x, y, w, d, p.x, p.y, p.w, p.d, padding)) {
          overlapsPiece = true;
          break;
        }
      }
      if (overlapsPiece) {
        continue;
      }

      // 3. Check if there is a safe support column rotation for the updated set of pieces
      const trialPieces = [
        ...shelf.pieces.map(p => ({ x: p.x, y: p.y, w: p.w, d: p.d })),
        { x, y, w, d }
      ];
      const safeCols = findSafeColumnsRotation(trialPieces, padding);
      if (!safeCols) {
        continue; // No safe column orientation can be found for this layout, skip
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
        <div className="p-4 bg-[#FDF7F5] border border-[#E57373]/30 rounded-xl text-xs space-y-2.5 text-[#4A443F]">
          <p className="font-semibold text-[#C15E3F] flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> Como funciona o cálculo e arrumação inteligente?
          </p>
          <ul className="list-disc pl-4 space-y-2 text-[#4A443F]/90 text-[11.5px] leading-relaxed">
            <li><strong>Separação de Temperatura:</strong> Peças de Biscoito (1000ºC) e Esmalte (1240ºC) são agrupadas separadamente por razões técnicas.</li>
            <li><strong>Espaço Útil Reais (50 cm):</strong> A prateleira tem 53 cm de diâmetro externo total (facetada). O sistema calcula a arrumação segura considerando a área plana útil de <strong>50 cm de diâmetro</strong> (marcada em tracejado vermelho).</li>
            <li><strong>Colunas de Sustentação (3,5 cm):</strong> Reservamos o espaço exato das 3 colunas de sustentação de 3,5 cm de largura (em cinza), impedindo colisão com as peças.</li>
            <li><strong>Comportamento por Tipo de Queima:</strong>
              <ul className="list-circle pl-5 mt-1 space-y-1 text-[11px] text-[#6E675F]">
                <li><strong>Queima de Biscoito (1000ºC):</strong> Permite que as peças fiquem encostadas (mínimo de 1 mm para visualização) e <strong>sobrepostas/empilhadas</strong> verticalmente, maximizando o aproveitamento do forno.</li>
                <li><strong>Queima de Esmalte (1240ºC):</strong> As peças <strong>nunca podem se tocar ou se sobrepor</strong> (risco de fusão permanente). O sistema impõe um espaçamento estrito de <strong>3 a 5 mm</strong> (ajustado em 4 mm) entre as peças.</li>
              </ul>
            </li>
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
              const getTipoBadgeStyle = (tipo: FiringType) => {
                if (tipo === 'biscoito') return 'bg-orange-100 text-orange-700';
                if (tipo === 'esmalte') return 'bg-amber-100 text-amber-700';
                if (tipo === 'monoqueima') return 'bg-red-100 text-red-700';
                return 'bg-purple-100 text-purple-700';
              };
              
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
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${getTipoBadgeStyle(s.tipo)}`}>
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
                  {activeShelf.tipo === 'biscoito' ? (
                    <><Flame className="w-3 h-3 text-[#C15E3F]" /> Queima de Biscoito (1000ºC)</>
                  ) : activeShelf.tipo === 'esmalte' ? (
                    <><Sparkles className="w-3 h-3 text-amber-500" /> Queima de Esmalte (1240ºC)</>
                  ) : activeShelf.tipo === 'monoqueima' ? (
                    <><Sparkles className="w-3 h-3 text-red-500" /> Monoqueima (1240ºC)</>
                  ) : (
                    <><Sparkles className="w-3 h-3 text-purple-500" /> Terceira Queima (750ºC)</>
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

                {/* 50cm useful flat area (subtle dashed line in terracotta) */}
                <circle 
                  cx="0" 
                  cy="0" 
                  r="25" 
                  fill="none" 
                  stroke="#C15E3F" 
                  strokeWidth="0.45" 
                  strokeDasharray="1,1.5"
                  opacity="0.8"
                />

                {/* Grid guidelines for scaling (subtle) */}
                <circle cx="0" cy="0" r="20" fill="none" stroke="#D5D0C5" strokeWidth="0.2" strokeDasharray="1,1" />
                <circle cx="0" cy="0" r="10" fill="none" stroke="#D5D0C5" strokeWidth="0.2" strokeDasharray="1,1" />
                <line x1="-26.5" y1="0" x2="26.5" y2="0" stroke="#D5D0C5" strokeWidth="0.1" strokeDasharray="1,1" />
                <line x1="0" y1="-26.5" x2="0" y2="26.5" stroke="#D5D0C5" strokeWidth="0.1" strokeDasharray="1,1" />

                {/* Support Columns (3 support props, 3.5cm diameter -> 1.75cm radius) */}
                {(activeShelf?.supportColumns || SUPPORT_COLUMNS).map((col, idx) => (
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
                  const currentPadding = p.tipo === 'biscoito' ? SAFETY_PADDING_BISCOITO : SAFETY_PADDING_ESMALTE;

                  return (
                    <g key={p.id}>
                      {/* Safety Padding Boundary (Dashed line) - Only draw for non-stacked base pieces to avoid clutter */}
                      {!isStacked && (
                        <rect
                          x={x - (halfW + currentPadding / 2)}
                          y={y - (halfD + currentPadding / 2)}
                          width={w + currentPadding}
                          height={d + currentPadding}
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
