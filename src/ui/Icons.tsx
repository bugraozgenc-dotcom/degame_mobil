import type { EquipmentType } from '../game/types';

// Modern çizgisel ikonlar (özgün, 24x24, stroke)
type P = { size?: number; className?: string };
const S = ({ size = 20, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
);

export const Icon = {
  fixedCam: (p: P) => (
    <S {...p}>
      <path d="M3 8.5l11-3 1.6 5.6-11 3z" />
      <path d="M15.6 9.8l3.9-1.3v4.8l-3.2-.9" />
      <path d="M7 13.4l1 4.1H4.5" />
      <path d="M4.5 21V14" />
    </S>
  ),
  bulletCam: (p: P) => Icon.fixedCam(p),
  ptzCam: (p: P) => (
    <S {...p}>
      <path d="M5 5h14" />
      <path d="M12 5v2" />
      <path d="M6 9a6 6 0 0012 0z" />
      <circle cx="12" cy="11.5" r="1.6" />
      <path d="M3.5 16.5a10 10 0 0017 0" strokeDasharray="2 2" />
    </S>
  ),
  thermalCam: (p: P) => (
    <S {...p}>
      <path d="M3 9l11-3 1.6 5.6-11 3z" />
      <path d="M15.6 10.3l3.9-1.3v4.8l-3.2-.9" />
      <path d="M8 20c-1.6-1-1.6-2.6 0-3.6s1.6-2.6 0-3.6" />
      <path d="M12 21c-1.6-1-1.6-2.6 0-3.6" />
    </S>
  ),
  motion: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4" />
      <path d="M5 5a10 10 0 000 14M19 5a10 10 0 010 14" />
    </S>
  ),
  perimeter: (p: P) => (
    <S {...p}>
      <path d="M3 20V7M9 20V7M15 20V7M21 20V7" />
      <path d="M3 10h18M3 16h18" />
      <path d="M11 4l1-1.5L13 4" />
    </S>
  ),
  speaker: (p: P) => (
    <S {...p}>
      <path d="M4 10v4h3l5 4V6L7 10z" />
      <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />
    </S>
  ),
  siren: (p: P) => (
    <S {...p}>
      <path d="M6 18v-5a6 6 0 0112 0v5" />
      <path d="M4 18h16v3H4z" />
      <path d="M12 3v2M4.2 6.2l1.4 1.4M19.8 6.2l-1.4 1.4" />
    </S>
  ),
  light: (p: P) => (
    <S {...p}>
      <path d="M8 21h4M10 21V5h6" />
      <path d="M14 5h5l-1 3h-3z" />
      <path d="M15 11l-1 2M18 11l1 2M16.5 11v2.5" />
    </S>
  ),
  mik: (p: P) => (
    <S {...p}>
      <path d="M12 3v11" />
      <path d="M9 4.5h6" />
      <circle cx="9.5" cy="6.5" r="1.4" />
      <path d="M14 5.5l2.5-1v3z" />
      <path d="M8 14h8v6H8z" />
      <path d="M8 14l-4 3v3M16 20h2l-1.5 1.5" />
      <path d="M4 17l4 1" />
    </S>
  ),
  mas: (p: P) => (
    <S {...p}>
      <path d="M8 4l8-1v3H8z" />
      <path d="M7.5 6h9v5h-9z" />
      <path d="M6.5 11h11v8h-11z" />
      <circle cx="12" cy="15" r="2" />
      <path d="M5 21h14M6.5 19L4.5 21M17.5 19l2 2" />
    </S>
  ),
  mia: (p: P) => (
    <S {...p}>
      <path d="M5 9h11v8H5z" />
      <path d="M10.5 9V4h2" />
      <path d="M12.5 3.5h3v2h-3z" />
      <circle cx="12" cy="18" r="2" />
      <path d="M16 15h5M21 15v3" />
      <path d="M5 17v3" />
    </S>
  ),
  tower: (p: P) => (
    <S {...p}>
      <path d="M8 21l2-11M16 21l-2-11" />
      <path d="M7 10h10l-1-4H8z" />
      <path d="M12 6V3" />
      <path d="M9 15h6M8.5 18h7" />
    </S>
  ),
  drone: (p: P) => (
    <S {...p}>
      <rect x="9" y="10" width="6" height="4" rx="1" />
      <path d="M9 12H5M15 12h4" />
      <circle cx="4" cy="12" r="2.2" />
      <circle cx="20" cy="12" r="2.2" />
      <path d="M2 10h4M18 10h4" />
      <path d="M12 14v2" />
      <circle cx="12" cy="17.5" r="1.3" />
    </S>
  ),
  patrol: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="6" r="2.4" />
      <path d="M8 21v-6l-2-1 2-5h8l2 5-2 1v6" />
      <path d="M10 12l2 1.5 2-1.5" />
    </S>
  ),
  vehicle: (p: P) => (
    <S {...p}>
      <path d="M3 16v-4l2-4h8l3 4h4a1 1 0 011 1v3" />
      <circle cx="7" cy="17" r="1.8" />
      <circle cx="17" cy="17" r="1.8" />
      <path d="M9 4h4" />
    </S>
  ),
  control: (p: P) => (
    <S {...p}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
      <path d="M7 12l3-3 2 2 4-4" />
    </S>
  ),
  play: (p: P) => (
    <S {...p}>
      <path d="M7 5v14l11-7z" />
    </S>
  ),
  pause: (p: P) => (
    <S {...p}>
      <path d="M8 5v14M16 5v14" />
    </S>
  ),
  stop: (p: P) => (
    <S {...p}>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </S>
  ),
  layers: (p: P) => (
    <S {...p}>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </S>
  ),
  eye: (p: P) => (
    <S {...p}>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </S>
  ),
  shield: (p: P) => (
    <S {...p}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </S>
  ),
  coin: (p: P) => (
    <S {...p}>
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </S>
  ),
  clock: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </S>
  ),
  sun: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </S>
  ),
  moon: (p: P) => (
    <S {...p}>
      <path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" />
    </S>
  ),
  rain: (p: P) => (
    <S {...p}>
      <path d="M7 15a4 4 0 01-.5-8 5.5 5.5 0 0110.6 1.5A3.5 3.5 0 0117 15z" />
      <path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5" />
    </S>
  ),
  fog: (p: P) => (
    <S {...p}>
      <path d="M7 11a4 4 0 01-.5-8 5.5 5.5 0 0110.6 1.5A3.5 3.5 0 0117 11" />
      <path d="M4 14h16M6 17.5h12M8 21h8" />
    </S>
  ),
  alert: (p: P) => (
    <S {...p}>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4.5M12 17.5v.2" />
    </S>
  ),
  check: (p: P) => (
    <S {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </S>
  ),
  x: (p: P) => (
    <S {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </S>
  ),
  target: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </S>
  ),
  send: (p: P) => (
    <S {...p}>
      <path d="M4 12l16-8-6 16-2.5-6.5z" />
    </S>
  ),
  radio: (p: P) => (
    <S {...p}>
      <rect x="6" y="8" width="12" height="13" rx="2" />
      <path d="M9 8l6-5" />
      <path d="M9 13h6M9 16.5h6" />
    </S>
  ),
  tag: (p: P) => (
    <S {...p}>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.3" />
    </S>
  ),
  flag: (p: P) => (
    <S {...p}>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </S>
  ),
  trash: (p: P) => (
    <S {...p}>
      <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" />
    </S>
  ),
  move: (p: P) => (
    <S {...p}>
      <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
    </S>
  ),
  rotate: (p: P) => (
    <S {...p}>
      <path d="M20 12a8 8 0 11-2.3-5.7" />
      <path d="M20 4v4.5h-4.5" />
    </S>
  ),
  upgrade: (p: P) => (
    <S {...p}>
      <path d="M12 20V6M6 11.5L12 5.5l6 6" />
      <path d="M5 20h14" />
    </S>
  ),
  menu: (p: P) => (
    <S {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </S>
  ),
  help: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.3M12 17v.2" />
    </S>
  ),
  bulb: (p: P) => (
    <S {...p}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z" />
    </S>
  ),
  fast: (p: P) => (
    <S {...p}>
      <path d="M4 6v12l8-6zM12 6v12l8-6z" />
    </S>
  ),
  wrench: (p: P) => (
    <S {...p}>
      <path d="M14.5 6.5a4 4 0 005 5L13 18a2.1 2.1 0 01-3-3l6.5-6.5" />
      <path d="M14.5 6.5L17 4l3 3-2.5 2.5" />
    </S>
  ),
  chevron: (p: P) => (
    <S {...p}>
      <path d="M9 6l6 6-6 6" />
    </S>
  ),
  grid: (p: P) => (
    <S {...p}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 12h16M12 4v16" />
    </S>
  ),
};

export function EquipIcon({ type, size = 22 }: { type: EquipmentType; size?: number }) {
  const C = Icon[type];
  return <C size={size} />;
}
