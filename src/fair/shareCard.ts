import logoDarkUrl from '../assets/desecure-logo-dark.svg';
import igQrUrl from '../assets/instagram-qr.svg';
import ytQrUrl from '../assets/youtube-qr.svg';

// Paylaşım kartı: puan + ad soyad + Instagram QR tek görselde (1080×1350, Instagram dikey oranı).
// Ekranda gösterilen ve e-postayla gönderilen görsel aynıdır.

export interface ShareData {
  name: string;
  mission: string; // "GES-1 Sahasını Koru"
  code: string; // GES / RES / TES
  score: number;
  stars: number;
  title: string;
  stats: { label: string; value: string }[];
  handle: string;
  youtube: string;
  date: number;
  badges?: string[];
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImg(src: string) {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

const FONT = '"Be Vietnam Pro", "Segoe UI", Arial, sans-serif';

function fitText(g: CanvasRenderingContext2D, text: string, max: number, size: number, weight = 800) {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > max && s > 28) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 === 0 ? r : r * 0.45;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
}

export async function renderShareCard(d: ShareData): Promise<HTMLCanvasElement> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    // kanvas yazı tipini kendiliğinden yüklemez: kullanılan kalınlıkları Türkçe harflerle birlikte önceden yükle
    const loads = fonts ? [500, 600, 700, 800].map((w) => fonts.load(`${w} 32px "Be Vietnam Pro"`, 'AaİıŞşĞğÇçÖöÜü0123456789')) : [];
    await Promise.race([Promise.all(loads).then(() => fonts?.ready), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* yazı tipi yüklenemezse yedek kullanılır */
  }
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;

  // zemin
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#16171b');
  bg.addColorStop(1, '#0c0c0e');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.85, 120, 20, W * 0.85, 120, 700);
  glow.addColorStop(0, 'rgba(200,40,75,0.45)');
  glow.addColorStop(1, 'rgba(200,40,75,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.035)';
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 54) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += 54) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  g.fillStyle = '#9e1b39';
  g.fillRect(0, 0, W, 10);

  const P = 80;
  // logo
  try {
    const logo = await loadImg(logoDarkUrl);
    const lw = 620;
    g.drawImage(logo, P, 70, lw, (lw * 217) / 2049);
  } catch {
    g.fillStyle = '#fff';
    g.font = `800 48px ${FONT}`;
    g.fillText('DESECURE TECHNOLOGY', P, 120);
  }

  // başlık bandı
  g.fillStyle = '#ff8a9b';
  g.font = `700 26px ${FONT}`;
  g.fillText(`GÖREV RAPORU · ${d.code}`.split('').join(String.fromCharCode(8202)), P, 200);

  // ad soyad
  g.fillStyle = '#ffffff';
  const ns = fitText(g, d.name, W - P * 2, 92);
  g.fillText(d.name, P, 200 + 22 + ns);
  let y = 200 + 22 + ns + 52;
  g.fillStyle = '#a7a9b0';
  g.font = `500 32px ${FONT}`;
  g.fillText(d.mission, P, y);

  // puan + yıldızlar
  y += 170;
  g.fillStyle = '#ffffff';
  g.font = `800 176px ${FONT}`;
  const sc = Math.round(d.score).toLocaleString('tr-TR');
  g.fillText(sc, P - 6, y);
  const sw = g.measureText(sc).width;
  for (let k = 0; k < 3; k++) {
    star(g, P + sw + 70 + k * 78, y - 110, 32);
    g.fillStyle = k < d.stars ? '#ffc94d' : '#34353b';
    g.fill();
  }
  g.fillStyle = '#ff8a9b';
  // uzun unvan sağ kenardan taşmasın
  let ts = 36;
  g.font = `700 ${ts}px ${FONT}`;
  while (g.measureText(d.title).width > W - P - (P + sw + 38) && ts > 22) {
    ts -= 2;
    g.font = `700 ${ts}px ${FONT}`;
  }
  g.fillText(d.title, P + sw + 38, y - 30);
  g.fillStyle = '#a7a9b0';
  g.font = `600 26px ${FONT}`;
  g.fillText('GÜVENLİK PUANI', P, y + 44);

  // istatistikler
  y += 90;
  const bw = (W - P * 2 - 2 * 20) / 3;
  d.stats.slice(0, 3).forEach((s, k) => {
    const x = P + k * (bw + 20);
    rr(g, x, y, bw, 118, 20);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `800 46px ${FONT}`;
    g.fillText(s.value, x + 24, y + 60);
    g.fillStyle = '#a7a9b0';
    g.font = `600 22px ${FONT}`;
    g.fillText(s.label, x + 24, y + 96);
  });

  // rozetler
  if (d.badges && d.badges.length) {
    let bx = P;
    const by = y + 150;
    g.font = `700 24px ${FONT}`;
    for (const b of d.badges.slice(0, 5)) {
      const tw = g.measureText(b).width + 44;
      if (bx + tw > W - P) break;
      rr(g, bx, by, tw, 46, 23);
      g.fillStyle = 'rgba(255,201,77,0.16)';
      g.fill();
      g.strokeStyle = 'rgba(255,201,77,0.55)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#ffd97a';
      g.fillText(b, bx + 22, by + 32);
      bx += tw + 14;
    }
  }

  // Instagram + YouTube QR paneli (iki QR yan yana)
  const py = H - 430;
  const ph = 360;
  g.fillStyle = '#e6e3df';
  g.font = `700 34px ${FONT}`;
  g.fillText(d.title === 'Pes etti' ? 'Görevi yarım bıraktım. Sen tamamla!' : 'Enerji santralini korudum. Sıra sende!', P, py - 56);
  rr(g, P, py, W - P * 2, ph, 28);
  const pg = g.createLinearGradient(P, py, W - P, py + ph);
  pg.addColorStop(0, '#9e1b39');
  pg.addColorStop(1, '#5c1022');
  g.fillStyle = pg;
  g.fill();
  const half = (W - P * 2) / 2;
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(P + half, py + 34);
  g.lineTo(P + half, py + ph - 34);
  g.stroke();
  const qrs = [
    { src: igQrUrl, kicker: 'INSTAGRAM', handle: `@${d.handle}`, cta: 'Takip et' },
    { src: ytQrUrl, kicker: 'YOUTUBE', handle: `@${d.youtube}`, cta: 'Abone ol' },
  ];
  for (let k = 0; k < qrs.length; k++) {
    const q = qrs[k];
    const cx = P + half * k + half / 2;
    g.textAlign = 'center';
    g.fillStyle = '#ffd0d8';
    g.font = `800 22px ${FONT}`;
    g.fillText(`${q.kicker} · ${q.cta.toLocaleUpperCase('tr-TR')}`, cx, py + 50);
    g.fillStyle = '#ffffff';
    fitText(g, q.handle, half - 50, 38);
    g.fillText(q.handle, cx, py + 98);
    const qs = 196;
    const qx = cx - qs / 2, qy = py + 134;
    rr(g, qx - 10, qy - 10, qs + 20, qs + 20, 16);
    g.fillStyle = '#ffffff';
    g.fill();
    try {
      const img = await loadImg(q.src);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, qx, qy, qs, qs);
      g.imageSmoothingEnabled = true;
    } catch {
      /* QR yüklenemezse boş kalır */
    }
  }
  g.textAlign = 'left';

  // alt bilgi
  g.fillStyle = '#6c6f77';
  g.font = `500 22px ${FONT}`;
  const dt = new Date(d.date);
  g.fillText(`${dt.toLocaleDateString('tr-TR')} · desecuretechnology.com · 7/24 Alarm İzleme Merkezi`, P, H - 30);
  return c;
}
