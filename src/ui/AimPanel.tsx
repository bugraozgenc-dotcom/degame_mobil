import { useEffect, useState } from 'react';
import { create } from 'zustand';
import logoDark from '../assets/desecure-logo-dark.svg';
import './aim.css';

// Olay Alarm İzleme Merkezi'ne (AİM) bildirildiğinde sağda açılan animasyon:
// operatörler video duvarına bakar, adımlar sırayla tamamlanır, panel kendiliğinden kapanır.

interface AimInfo {
  id: number;
  sector: string;
  label: string; // "KAM-02" / "Operatör"
  falseAlarm?: boolean; // personel / hayvan için yapılan bildirim
}

let seq = 0;
export const useAim = create<{ cur: AimInfo | null; show: (sector: string, label: string, falseAlarm?: boolean) => void; hide: () => void }>((set) => ({
  cur: null,
  show: (sector, label, falseAlarm) => set({ cur: { id: ++seq, sector, label, falseAlarm } }),
  hide: () => set({ cur: null }),
}));

const STEPS = ['Alarm AİM\'e ulaştı', 'Operatör kamera görüntüsünü doğruladı', 'Devriye ekibi yönlendirildi', 'Jandarma ekibi yola çıktı'];
const STEPS_FALSE = ['Alarm AİM\'e ulaştı', 'Operatör kamera görüntüsünü inceledi', 'Tehdit doğrulanmadı: yetkili / zararsız', 'Yanlış alarm kapatıldı, ekip geri çağrıldı'];
const DURATION = 6200;

const short = (t: string) => (t.length > 24 ? t.slice(0, 23) + '…' : t);

function MonitorRoom({ sector, label }: { sector: string; label: string }) {
  // video duvarı: 3×2 ekran, biri alarmda
  const screens = [0, 1, 2, 3, 4, 5];
  return (
    <svg viewBox="0 0 360 230" className="aim-room" role="img" aria-label="Desecure Alarm İzleme Merkezi operatörleri video duvarını izliyor">
      <defs>
        <linearGradient id="aimWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1d23" />
          <stop offset="1" stopColor="#0e0f12" />
        </linearGradient>
        <linearGradient id="aimScreen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f3a4f" />
          <stop offset="1" stopColor="#0f2232" />
        </linearGradient>
        <linearGradient id="aimGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(80,170,255,0.28)" />
          <stop offset="1" stopColor="rgba(80,170,255,0)" />
        </linearGradient>
        <clipPath id="aimClip">
          <rect x="0" y="0" width="360" height="230" rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#aimClip)">
        <rect width="360" height="230" fill="url(#aimWall)" />
        {/* video duvarı */}
        {screens.map((k) => {
          const x = 22 + (k % 3) * 108;
          const y = 16 + Math.floor(k / 3) * 66;
          const alert = k === 1;
          return (
            <g key={k} transform={`translate(${x},${y})`}>
              <rect width="100" height="58" rx="4" fill="url(#aimScreen)" stroke={alert ? '#ff4b5f' : '#2d3b48'} strokeWidth={alert ? 2.5 : 1.2} className={alert ? 'aim-alert' : ''} />
              {/* sahte kamera görüntüsü: zemin + panel sıraları */}
              <rect x="3" y="30" width="94" height="25" rx="2" fill={k % 2 ? '#2f5a2a' : '#3a5f31'} opacity="0.7" />
              {[0, 1, 2].map((r) => (
                <rect key={r} x={8 + r * 30} y={36 + (r % 2) * 6} width="24" height="5" fill="#2a4e9e" opacity="0.85" />
              ))}
              {alert && (
                <g className="aim-intruder">
                  <rect x="60" y="22" width="7" height="16" rx="2" fill="#141518" />
                  <circle cx="63.5" cy="19" r="3.5" fill="#141518" />
                  <rect x="54" y="14" width="20" height="28" fill="none" stroke="#ff4b5f" strokeWidth="1.5" />
                </g>
              )}
              <text x="4" y="10" fontSize="7" fill={alert ? '#ff8a9b' : '#8fb4cf'} fontFamily="monospace">
                {alert ? short(`${label} · ${sector}`) : `KAM-0${k + 1}`}
              </text>
              <rect x="0" y="0" width="100" height="3" fill="rgba(255,255,255,0.06)" className="aim-scan" />
            </g>
          );
        })}
        <rect x="0" y="146" width="360" height="84" fill="url(#aimGlow)" />
        {/* masa */}
        <path d="M0 186 L360 176 L360 230 L0 230Z" fill="#23252b" />
        <rect x="70" y="168" width="64" height="20" rx="3" fill="#0f1114" stroke="#34495a" />
        <rect x="224" y="164" width="64" height="20" rx="3" fill="#0f1114" stroke="#34495a" />
        <rect x="74" y="171" width="56" height="14" fill="#1d3a50" className="aim-flicker" />
        <rect x="228" y="167" width="56" height="14" fill="#3a1d26" className="aim-flicker2" />
        {/* operatör 1 (sırtı dönük) */}
        <g className="aim-op1">
          <path d="M80 230 Q80 196 106 192 Q132 196 132 230Z" fill="#1f2a44" />
          <rect x="99" y="186" width="14" height="10" fill="#c99772" />
          <g className="aim-head">
            <circle cx="106" cy="178" r="13" fill="#2b2118" />
            <path d="M92 176 Q106 158 120 176" stroke="#9e1b39" strokeWidth="3" fill="none" />
            <circle cx="92" cy="179" r="3.5" fill="#9e1b39" />
          </g>
        </g>
        {/* operatör 2 */}
        <g className="aim-op2">
          <path d="M232 230 Q232 194 256 190 Q280 194 280 230Z" fill="#1f2a44" />
          <rect x="249" y="183" width="14" height="10" fill="#d6a37c" />
          <g className="aim-head2">
            <circle cx="256" cy="174" r="12.5" fill="#6b4a2f" />
            <path d="M243 172 Q256 156 269 172" stroke="#9e1b39" strokeWidth="3" fill="none" />
            <circle cx="269" cy="175" r="3.5" fill="#9e1b39" />
          </g>
        </g>
        {/* sandalye sırtları */}
        <rect x="88" y="206" width="36" height="24" rx="6" fill="#121317" />
        <rect x="238" y="204" width="36" height="26" rx="6" fill="#121317" />
      </g>
    </svg>
  );
}

export function AimPanel({ side = 'fair' }: { side?: 'fair' | 'full' }) {
  const cur = useAim((s) => s.cur);
  const hide = useAim((s) => s.hide);
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!cur) return;
    setStep(0);
    setClosing(false);
    const timers = STEPS.map((_, k) => window.setTimeout(() => setStep(k + 1), 700 + k * 1100));
    timers.push(window.setTimeout(() => setClosing(true), DURATION - 450));
    timers.push(window.setTimeout(hide, DURATION));
    return () => timers.forEach(clearTimeout);
  }, [cur, hide]);
  if (!cur) return null;
  const steps = cur.falseAlarm ? STEPS_FALSE : STEPS;
  return (
    <div key={cur.id} className={`aim-panel ${side} ${closing ? 'out' : ''}`} role="status" aria-live="polite">
      <div className="aim-head-row">
        <img src={logoDark} alt="Desecure Technology" />
        <span className="aim-live">
          <i /> CANLI
        </span>
      </div>
      <div className="aim-title">Alarm İzleme Merkezi{cur.falseAlarm ? ' · Yanlış alarm' : ''}</div>
      <MonitorRoom sector={cur.sector} label={cur.label} />
      <ol className="aim-steps">
        {steps.map((s, k) => (
          <li key={s} className={`${step > k ? 'done' : step === k ? 'now' : ''} ${cur.falseAlarm && k === steps.length - 1 ? 'warn' : ''}`}>
            <span className="dot" />
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
