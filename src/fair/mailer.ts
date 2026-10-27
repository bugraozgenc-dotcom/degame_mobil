import { renderShareCard, type ShareData } from './shareCard';

/**
 * E-POSTA AYARLARI — sonra doldurulacak.
 *
 * endpoint boşken gönderimler bu cihazda "gönderim kuyruğu"na kaydedilir (localStorage).
 * endpoint doldurulunca oyun her açılışta kuyruğu otomatik gönderir.
 *
 * Sunucuya giden istek (POST, JSON):
 * {
 *   to: "ziyaretci@ornek.com",
 *   name: "Ayşe Yılmaz",
 *   subject: "...", text: "...",
 *   image: "data:image/jpeg;base64,...",   // paylaşım kartı
 *   score, stars, mission, marketingConsent, createdAt
 * }
 * Örnek arka uçlar: kendi API'niz, bir form/e-posta servisi (ör. SMTP köprüsü, Make/Zapier webhook).
 */
export const MAIL_CONFIG = {
  endpoint: '', // ör. 'https://api.desecure.com.tr/fair/send-score'
  headers: {} as Record<string, string>, // ör. { Authorization: 'Bearer ...' }
  subject: 'Desecure Santral Güvenlik Görevi — Puan kartın',
};

export interface MailRequest {
  id: string;
  to: string;
  data: ShareData;
  marketingConsent: boolean;
  createdAt: number;
  sentAt?: number;
  error?: string;
}

const KEY = 'desecure-mail-outbox';

export function loadOutbox(): MailRequest[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}
function saveOutbox(list: MailRequest[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* depolama yoksa yoksay */
  }
}

export const isMailConfigured = () => !!MAIL_CONFIG.endpoint;

export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

async function send(req: MailRequest) {
  const canvas = await renderShareCard(req.data);
  const image = canvas.toDataURL('image/jpeg', 0.86);
  const text = `Merhaba ${req.data.name},\n\n${req.data.mission} görevinde ${Math.round(req.data.score).toLocaleString('tr-TR')} puan aldın (${req.data.title}).\n\nBizi Instagram'da takip et: https://www.instagram.com/${req.data.handle}/\nAlarm İzleme Merkezimizi YouTube'da izle: https://www.youtube.com/@DesecureTechnology\n\nDesecure Technology · 7/24 Alarm İzleme Merkezi\nhttps://desecuretechnology.com`;
  const res = await fetch(MAIL_CONFIG.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...MAIL_CONFIG.headers },
    body: JSON.stringify({
      to: req.to,
      name: req.data.name,
      subject: MAIL_CONFIG.subject,
      text,
      image,
      score: req.data.score,
      stars: req.data.stars,
      mission: req.data.mission,
      marketingConsent: req.marketingConsent,
      createdAt: req.createdAt,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Talebi kaydeder; ayar varsa hemen gönderir. Dönüş: 'sent' | 'queued' */
export async function requestEmail(to: string, data: ShareData, marketingConsent: boolean): Promise<'sent' | 'queued'> {
  const req: MailRequest = { id: `${Date.now()}-${Math.floor(Math.random() * 1e4)}`, to: to.trim(), data, marketingConsent, createdAt: Date.now() };
  const list = loadOutbox();
  list.push(req);
  saveOutbox(list);
  if (!isMailConfigured()) return 'queued';
  try {
    await send(req);
    markSent(req.id);
    return 'sent';
  } catch (e) {
    markError(req.id, String(e));
    return 'queued';
  }
}

function markSent(id: string) {
  saveOutbox(loadOutbox().map((r) => (r.id === id ? { ...r, sentAt: Date.now(), error: undefined } : r)));
}
function markError(id: string, err: string) {
  saveOutbox(loadOutbox().map((r) => (r.id === id ? { ...r, error: err } : r)));
}

/** Ayar yapıldıktan sonra bekleyenleri gönderir */
export async function flushOutbox() {
  if (!isMailConfigured()) return;
  for (const r of loadOutbox()) {
    if (r.sentAt) continue;
    try {
      await send(r);
      markSent(r.id);
    } catch (e) {
      markError(r.id, String(e));
    }
  }
}

export function outboxCsv() {
  const rows = [['tarih', 'ad_soyad', 'eposta', 'gorev', 'puan', 'yildiz', 'pazarlama_izni', 'gonderildi']];
  for (const r of loadOutbox()) {
    rows.push([new Date(r.createdAt).toLocaleString('tr-TR'), r.data.name, r.to, r.data.mission, String(Math.round(r.data.score)), String(r.data.stars), r.marketingConsent ? 'evet' : 'hayır', r.sentAt ? 'evet' : 'hayır']);
  }
  return rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(';')).join('\n');
}

export function clearOutbox() {
  saveOutbox([]);
}
