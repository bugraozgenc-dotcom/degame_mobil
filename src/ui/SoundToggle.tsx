import { useSound } from '../audio/sfx';

// Sesleri aç / kapat düğmesi (tercih bu cihazda hatırlanır)
export function SoundToggle({ className = 'icon-btn', label = false }: { className?: string; label?: boolean }) {
  const enabled = useSound((s) => s.enabled);
  const toggle = useSound((s) => s.toggle);
  return (
    <button className={`${className} sound-btn ${enabled ? 'on' : 'off'}`} onClick={toggle} title={enabled ? 'Ses ve müziği kapat' : 'Ses ve müziği aç'} aria-pressed={enabled} aria-label={enabled ? 'Sesi kapat' : 'Sesi aç'}>
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10v4h3l5 4V6L7 10z" />
        {enabled ? <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /> : <path d="M16 9l5 6M21 9l-5 6" />}
      </svg>
      {label && <span>{enabled ? 'Ses açık' : 'Ses kapalı'}</span>}
    </button>
  );
}
