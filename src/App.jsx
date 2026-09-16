import { Analytics } from '@vercel/analytics/react';
import JigsawVerseApp from './components/JigsawVerseApp';

function App() {
  return (
    <>
      <JigsawVerseApp />
      <Analytics />
    </>
  );
}

export default App;
