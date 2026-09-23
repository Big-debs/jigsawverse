import { Analytics } from '@vercel/analytics/react';
import JigsawVerseApp from './components/JigsawVerseApp';
import PlanarCubePrototype from './components/PlanarCubePrototype';

function App() {
  const params = new URLSearchParams(window.location.search);
  const showPlanarCube = params.get('mode') === 'planar-cube';

  return (
    <>
      {showPlanarCube ? <PlanarCubePrototype /> : <JigsawVerseApp />}
      <Analytics />
    </>
  );
}

export default App;
