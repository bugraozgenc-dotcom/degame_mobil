# Desecure AİM Game · Mobil

Desecure Technology fuar oyununun **telefon tarayıcısında** oynanan sürümü. Masaüstü/kiosk sürümü ayrı depodadır (`desecureaimgame`); bu depo ondan türetilmiştir ve bağımsız geliştirilir.

- **Canlı:** https://bugraozgenc-dotcom.github.io/desecureaimgame-mobil/
- **Geliştirme:** `npm install` → `npm run dev` · derleme `npm run build` (çıktı `dist/`)
- **Yayın:** `main` dalına her push'ta GitHub Actions derler ve GitHub Pages'e yükler (`.github/workflows/pages.yml`).

## Mobil sürümde ne farklı?

- **Yalnızca fuar modu**, şifre yok (`loadExpoMode()` her zaman `true`): bullet kameralar çit hattına, termal 3× menzil, süresiz kurulum, AİM her olayı kendisi sınıflandırır.
- **Yatay ekran.** Dikey tutulunca "Telefonu yatay çevir" uyarısı çıkar (`RotateHint`). Başla düğmesi tam ekran ve yatay kilit ister (Android; iOS Safari desteklemez).
- **Kiosk mantığı kapalı:** bekleme ekranı yerine sade giriş kartı (`src/fair/MobileStart.tsx`), hareketsizlik sıfırlaması yok, sonuç ekranı kendiliğinden kapanmaz.
- **Dokunmatik (Clash of Clans tarzı):** ekipmana dokun → hayalet çit hattında belirir → parmakla sürükle (bullet kamera en yakın çit hücresine yapışır) → ✓ onayla / ✗ vazgeç. Hayalet parmağın ~64 px üstünde durur (parmak örtmez); hayalete dokunup sürüklemek onu taşır, boş yere dokunup sürüklemek haritayı kaydırır, boş yere dokunmak hayaleti oraya götürür; çubuktaki oklar bir hücre kaydırır. Hayalet belirince kamera ona yakınlaşır, çit hattı yeşil kılavuzla parlar. Seçili cihazda "Taşı" aynı akışı açar. Yerleştirme dışında tek parmak kaydırır, iki parmak yakınlaştırır. Mantık: `MOBILE_PLACE`, `snapToFence` (`store.ts`), `MobilePlaceBar` (`FairApp.tsx`).
- **Düzen:** `src/fair/mobile.css` — 1100 px'den dar ya da 560 px'den basık ekranlarda devreye giren mobil katman. Geniş ekranda fuar düzeni olduğu gibi kalır.
- **Performans:** piksel oranı en çok 1,5 (`GameScene.tsx`), "Grafik: Otomatik" kare hızı düşerse kaliteyi düşürür.
- **PWA:** `public/manifest.webmanifest` — "Ana ekrana ekle" ile uygulama gibi tam ekran açılır.

## Nerede ne var

| Dosya | İçerik |
| --- | --- |
| `src/fair/MobileStart.tsx` | Giriş ekranı, dikey uyarı, tam ekran isteği |
| `src/fair/mobile.css` | Mobil düzen kuralları (üst bar, mağaza, kartlar, sonuç) |
| `src/fair/FairApp.tsx` | Fuar akışı (kayıt → görev → kurulum → savunma → sonuç) |
| `src/fair/fairStore.ts` | Akış durumu, puanlama, skor tablosu (cihazda `localStorage`) |
| `src/game/config/expo.ts` | Fuar modu kuralları |
| `src/game/`, `src/scene/` | Simülasyon ve 3D sahne (masaüstü sürümüyle ortak) |

Sürüm: `src/version.ts` (`m1.3`).
