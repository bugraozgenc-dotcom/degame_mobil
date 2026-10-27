import { useGame } from './game/store';
import { GameScene } from './scene/GameScene';
import { GameHUD } from './ui/GameHUD';
import { MainMenu } from './ui/MainMenu';
import { MissionResultScreen } from './ui/MissionResultScreen';
import { FairApp } from './fair/FairApp';

// Varsayılan: fuar görevi. Tam strateji sürümü için adrese #tam ekleyin.
const FULL = typeof location !== 'undefined' && location.hash.replace('#', '') === 'tam';

export default function App() {
  if (!FULL) return <FairApp />;
  return <FullApp />;
}

function FullApp() {
  const phase = useGame((s) => s.phase);
  if (phase === 'menu') return <MainMenu />;
  return (
    <div className="game-root">
      <GameScene />
      {phase !== 'result' && <GameHUD />}
      {phase === 'result' && <MissionResultScreen />}
    </div>
  );
}
