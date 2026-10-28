import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './fonts.css';
import './styles.css';
import { installAudioUnlock } from './audio/sfx';
import { installPwa } from './pwa';

// Yayın ortamı <html lang> etiketini kaldırabilir; Türkçe büyük harf (i → İ) ve heceleme için dili burada sabitle
document.documentElement.lang = 'tr';
installAudioUnlock();
installPwa();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// hata ayıklama / otomasyon için
import { useGame, getEngine } from './game/store';
import { useFair } from "./fair/fairStore";
import { useAim } from './ui/AimPanel';
import { expoPerimeterPlan } from './game/systems/expoBudget';
(window as unknown as { __sc: unknown }).__sc = { useGame, getEngine, useFair, useAim, expoPerimeterPlan };
