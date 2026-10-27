import { GFX_DESC, GFX_LABEL, useGfx } from '../scene/gfx';

/** Grafik kalitesi düğmesi: tıkla → Otomatik → Yüksek → Düşük (cihazda saklanır) */
export function GfxToggle({ className = 'icon-btn', label = false }: { className?: string; label?: boolean }) {
  const mode = useGfx((s) => s.mode);
  const cycle = useGfx((s) => s.cycle);
  const short = mode === 'auto' ? 'Oto' : mode === 'high' ? 'Yüksek' : 'Düşük';
  return (
    <button className={`${className} gfx-btn gfx-${mode}`} onClick={cycle} title={`${GFX_LABEL[mode]} — ${GFX_DESC[mode]} (tıkla: değiştir)`} aria-label={GFX_LABEL[mode]}>
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
        {mode === 'high' ? <path d="M7 12l3-3 2 2 4-4" /> : mode === 'low' ? <path d="M7 9l3 3 2-2 4 4" /> : <path d="M7 10h3l2 3 2-5 2 2h1" />}
      </svg>
      <span>{label ? GFX_LABEL[mode] : short}</span>
    </button>
  );
}
