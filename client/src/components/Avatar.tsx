import type { Character } from '@multigo/shared';

export const CHARACTER_META: Record<Character, { label: string; blurb: string; color: string }> = {
  sloth: { label: 'Sloth', blurb: 'Thinks long, plays slow, never panics.', color: '#f6e3c5' },
  shark: { label: 'Shark', blurb: 'Loves a capturing race.', color: '#cfe8ff' },
  jellyfish: { label: 'Jellyfish', blurb: 'Drifts toward the vital point.', color: '#ead9ff' },
};

interface Props {
  character: Character;
  size?: number;
  className?: string;
  /** Mirror the avatar horizontally. */
  flip?: boolean;
}

export function Avatar({ character, size = 64, className, flip }: Props) {
  const style = flip ? { transform: 'scaleX(-1)' } : undefined;
  const common = { width: size, height: size, viewBox: '0 0 100 100', className, style, 'aria-label': CHARACTER_META[character].label, role: 'img' as const };
  switch (character) {
    case 'sloth':
      return <Sloth {...common} />;
    case 'shark':
      return <Shark {...common} />;
    case 'jellyfish':
      return <Jellyfish {...common} />;
  }
}

type SvgProps = React.SVGProps<SVGSVGElement>;

function Sloth(props: SvgProps) {
  return (
    <svg {...props}>
      {/* branch */}
      <rect x="4" y="16" width="92" height="9" rx="4.5" fill="#b08968" />
      {/* arms holding the branch */}
      <path d="M26 20 C 20 40, 24 58, 34 64" stroke="#c9a27e" strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M74 20 C 80 40, 76 58, 66 64" stroke="#c9a27e" strokeWidth="11" strokeLinecap="round" fill="none" />
      {/* body */}
      <ellipse cx="50" cy="70" rx="27" ry="24" fill="#d9b48f" />
      {/* face */}
      <ellipse cx="50" cy="52" rx="24" ry="20" fill="#f3e2cb" />
      {/* eye patches */}
      <path d="M30 48 C 32 40, 42 40, 46 50 C 42 56, 32 56, 30 48 Z" fill="#8a6a4e" />
      <path d="M70 48 C 68 40, 58 40, 54 50 C 58 56, 68 56, 70 48 Z" fill="#8a6a4e" />
      <circle cx="39" cy="49" r="2.6" fill="#2b2233" />
      <circle cx="61" cy="49" r="2.6" fill="#2b2233" />
      <circle cx="40" cy="48" r="0.9" fill="#fff" />
      <circle cx="62" cy="48" r="0.9" fill="#fff" />
      {/* nose + smile */}
      <ellipse cx="50" cy="57" rx="4" ry="3" fill="#5b4636" />
      <path d="M43 63 Q 50 69 57 63" stroke="#5b4636" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* blush */}
      <circle cx="31" cy="60" r="3.5" fill="#f7b7c6" opacity="0.8" />
      <circle cx="69" cy="60" r="3.5" fill="#f7b7c6" opacity="0.8" />
      {/* claws */}
      <path d="M31 65 l-3 6 M35 66 l-1 7 M39 65 l2 6" stroke="#8a6a4e" strokeWidth="2" strokeLinecap="round" />
      <path d="M69 65 l3 6 M65 66 l1 7 M61 65 l-2 6" stroke="#8a6a4e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Shark(props: SvgProps) {
  return (
    <svg {...props}>
      {/* tail */}
      <path d="M78 55 L 96 38 L 92 60 L 96 76 Z" fill="#7fb3e6" />
      {/* body */}
      <path d="M14 56 C 20 32, 52 26, 72 38 C 84 46, 84 66, 70 72 C 50 80, 24 76, 14 56 Z" fill="#8fc1f0" />
      {/* belly */}
      <path d="M18 60 C 30 70, 56 76, 70 70 C 60 78, 30 78, 18 60 Z" fill="#f4f8ff" />
      {/* dorsal fin */}
      <path d="M46 34 L 56 12 L 64 36 Z" fill="#7fb3e6" />
      {/* side fin */}
      <path d="M44 62 L 36 80 L 56 68 Z" fill="#7fb3e6" />
      {/* eye */}
      <circle cx="32" cy="50" r="5" fill="#fff" />
      <circle cx="33" cy="51" r="2.8" fill="#2b2233" />
      <circle cx="34" cy="50" r="0.9" fill="#fff" />
      {/* mouth with little teeth */}
      <path d="M16 58 Q 26 64 40 62" stroke="#2b2233" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M22 61 l2 4 l2 -4 M28 62 l2 4 l2 -4" fill="#fff" stroke="#2b2233" strokeWidth="1" />
      {/* gills + blush */}
      <path d="M50 46 q 2 8 0 16 M55 44 q 2 9 0 18" stroke="#6fa3d6" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="26" cy="56" r="3" fill="#f7b7c6" opacity="0.7" />
    </svg>
  );
}

function Jellyfish(props: SvgProps) {
  return (
    <svg {...props}>
      {/* tentacles */}
      <path d="M32 58 q -6 10 0 20 q 6 10 -2 18" stroke="#d7b8ff" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M42 60 q 5 10 -1 20 q -5 8 2 16" stroke="#f5b8e6" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M52 60 q -5 10 1 20 q 6 8 -2 16" stroke="#d7b8ff" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M62 60 q 6 10 0 20 q -6 10 2 16" stroke="#f5b8e6" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M70 56 q 8 12 2 24" stroke="#c9b6ff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M28 54 q -8 12 -2 24" stroke="#c9b6ff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* bell */}
      <path d="M18 56 C 18 26, 82 26, 82 56 C 70 64, 30 64, 18 56 Z" fill="#e9c9ff" />
      <path d="M26 52 C 28 34, 72 34, 74 52" fill="#f6dcff" opacity="0.8" />
      {/* highlight */}
      <ellipse cx="38" cy="38" rx="8" ry="4" fill="#fff" opacity="0.6" transform="rotate(-20 38 38)" />
      {/* scallops */}
      <path d="M18 56 q 8 6 16 0 q 8 6 16 0 q 8 6 16 0 q 8 6 16 0" stroke="#c9a6f5" strokeWidth="2" fill="none" />
      {/* face */}
      <circle cx="40" cy="48" r="2.8" fill="#2b2233" />
      <circle cx="60" cy="48" r="2.8" fill="#2b2233" />
      <circle cx="41" cy="47" r="0.9" fill="#fff" />
      <circle cx="61" cy="47" r="0.9" fill="#fff" />
      <path d="M45 54 Q 50 58 55 54" stroke="#2b2233" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="53" r="3" fill="#f7b7c6" opacity="0.8" />
      <circle cx="68" cy="53" r="3" fill="#f7b7c6" opacity="0.8" />
    </svg>
  );
}
