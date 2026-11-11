import { useCallback, useMemo, useRef, useState } from 'react';
import type { Sign, Vertex } from '@multigo/shared';

interface Props {
  size: number;
  board: Sign[][];
  /** Colour of the stone shown on hover; null disables interaction. */
  hoverSign: Sign | null;
  /** Rotate the board 180° (White's perspective). */
  flipped?: boolean;
  lastMove?: Vertex | null;
  koPoint?: Vertex | null;
  territory?: Sign[][] | null;
  onPlace?: (x: number, y: number) => void;
  showCoordinates?: boolean;
  className?: string;
}

const LETTERS = 'ABCDEFGHJKLMNOPQRST';

function starPoints(size: number): Vertex[] {
  if (size === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
  if (size === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
  if (size === 19) {
    const pts: Vertex[] = [];
    for (const x of [3, 9, 15]) for (const y of [3, 9, 15]) pts.push([x, y]);
    return pts;
  }
  const mid = Math.floor(size / 2);
  return size % 2 === 1 ? [[mid, mid]] : [];
}

/**
 * SVG Go board. Internally everything is drawn in "display" coordinates; when
 * `flipped` is set the board coordinates are rotated 180° so that the local
 * player always sits at the bottom.
 */
export function GoBoard({
  size,
  board,
  hoverSign,
  flipped = false,
  lastMove,
  koPoint,
  territory,
  onPlace,
  showCoordinates = true,
  className,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Vertex | null>(null);

  const margin = showCoordinates ? 1.1 : 0.7;
  const extent = size - 1 + margin * 2;
  const toBoard = useCallback(
    (dx: number, dy: number): Vertex => (flipped ? [size - 1 - dx, size - 1 - dy] : [dx, dy]),
    [flipped, size],
  );
  const toDisplay = toBoard; // the 180° rotation is an involution

  const locate = useCallback(
    (evt: React.PointerEvent<SVGSVGElement>): Vertex | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const px = ((evt.clientX - rect.left) / rect.width) * extent - margin;
      const py = ((evt.clientY - rect.top) / rect.height) * extent - margin;
      const dx = Math.round(px);
      const dy = Math.round(py);
      if (dx < 0 || dy < 0 || dx >= size || dy >= size) return null;
      if (Math.abs(px - dx) > 0.45 || Math.abs(py - dy) > 0.45) return null;
      return [dx, dy];
    },
    [extent, margin, size],
  );

  const interactive = hoverSign !== null && !!onPlace;

  const handleMove = (evt: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const d = locate(evt);
    setHover((prev) => (prev && d && prev[0] === d[0] && prev[1] === d[1] ? prev : d));
  };

  const handleClick = (evt: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const d = locate(evt);
    if (!d) return;
    const [bx, by] = toBoard(d[0], d[1]);
    if (board[by][bx] !== 0) return;
    onPlace?.(bx, by);
  };

  const stars = useMemo(() => starPoints(size), [size]);
  const stones: { x: number; y: number; sign: Sign; key: string }[] = [];
  for (let by = 0; by < size; by++) {
    for (let bx = 0; bx < size; bx++) {
      const sign = board[by][bx];
      if (sign === 0) continue;
      const [dx, dy] = toDisplay(bx, by);
      stones.push({ x: dx, y: dy, sign, key: `${bx},${by}` });
    }
  }

  const hoverBoard = hover ? toBoard(hover[0], hover[1]) : null;
  const showHover = interactive && hover && hoverBoard && board[hoverBoard[1]][hoverBoard[0]] === 0;
  const lastDisplay = lastMove ? toDisplay(lastMove[0], lastMove[1]) : null;
  const koDisplay = koPoint ? toDisplay(koPoint[0], koPoint[1]) : null;
  const r = 0.47;

  return (
    <svg
      ref={svgRef}
      className={['go-board', interactive ? 'go-board--interactive' : '', className ?? ''].join(' ')}
      viewBox={`${-margin} ${-margin} ${extent} ${extent}`}
      onPointerMove={handleMove}
      onPointerLeave={() => setHover(null)}
      onPointerDown={handleClick}
      data-testid="go-board"
      data-size={size}
      data-flipped={flipped ? 'true' : 'false'}
    >
      <defs>
        <radialGradient id="stone-black" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#6b6480" />
          <stop offset="100%" stopColor="#1c1826" />
        </radialGradient>
        <radialGradient id="stone-white" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d8d2e6" />
        </radialGradient>
        <filter id="stone-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0.04" dy="0.06" stdDeviation="0.05" floodColor="#4a3b2a" floodOpacity="0.45" />
        </filter>
      </defs>

      <rect x={-margin} y={-margin} width={extent} height={extent} rx={0.4} className="go-board__wood" />

      {/* grid */}
      {Array.from({ length: size }, (_, i) => (
        <g key={i}>
          <line x1={0} y1={i} x2={size - 1} y2={i} className="go-board__line" />
          <line x1={i} y1={0} x2={i} y2={size - 1} className="go-board__line" />
        </g>
      ))}
      {stars.map(([x, y]) => (
        <circle key={`star-${x}-${y}`} cx={x} cy={y} r={0.1} className="go-board__star" />
      ))}

      {showCoordinates &&
        Array.from({ length: size }, (_, d) => {
          const [bx] = toBoard(d, 0);
          const [, by] = toBoard(0, d);
          return (
            <g key={`coord-${d}`} className="go-board__coord">
              <text x={d} y={size - 1 + margin * 0.72} textAnchor="middle">
                {LETTERS[bx]}
              </text>
              <text x={-margin * 0.72} y={d + 0.12} textAnchor="middle">
                {size - by}
              </text>
            </g>
          );
        })}

      {/* territory overlay */}
      {territory &&
        territory.flatMap((row, by) =>
          row.map((owner, bx) => {
            if (owner === 0 || board[by][bx] !== 0) return null;
            const [dx, dy] = toDisplay(bx, by);
            return (
              <rect
                key={`t-${bx}-${by}`}
                x={dx - 0.22}
                y={dy - 0.22}
                width={0.44}
                height={0.44}
                rx={0.06}
                className={owner === 1 ? 'go-board__territory--black' : 'go-board__territory--white'}
              />
            );
          }),
        )}

      {/* stones */}
      {stones.map((s) => (
        <circle
          key={s.key}
          cx={s.x}
          cy={s.y}
          r={r}
          fill={s.sign === 1 ? 'url(#stone-black)' : 'url(#stone-white)'}
          filter="url(#stone-shadow)"
          className="go-board__stone"
          data-stone={s.sign === 1 ? 'black' : 'white'}
        />
      ))}

      {lastDisplay && (
        <circle
          cx={lastDisplay[0]}
          cy={lastDisplay[1]}
          r={0.18}
          className={board[lastMove![1]][lastMove![0]] === 1 ? 'go-board__last--on-black' : 'go-board__last--on-white'}
        />
      )}

      {koDisplay && (
        <rect x={koDisplay[0] - 0.25} y={koDisplay[1] - 0.25} width={0.5} height={0.5} className="go-board__ko" />
      )}

      {showHover && hover && (
        <circle
          cx={hover[0]}
          cy={hover[1]}
          r={r}
          fill={hoverSign === 1 ? 'url(#stone-black)' : 'url(#stone-white)'}
          className="go-board__hover"
        />
      )}
    </svg>
  );
}
