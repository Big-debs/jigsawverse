import { useEffect, useRef } from 'react';
import { AtlasThreeRenderer } from '../../tools/renderer-lab/src/threeScene.js';

/**
 * Explicitly opt-in, solo-only 5x5 proof. No engine instance, opponent data,
 * scoring, correctness or secret fields may be passed through this component.
 * Only the sanitized local visual model reaches the renderer.
 */
export default function AtlasSoloRenderer({
  view, imageUrl, onSelectFragment, onPlaceCell, onFallback,
}) {
  const hostRef = useRef(null);
  const rendererRef = useRef(null);
  const actionRef = useRef({ onSelectFragment, onPlaceCell, onFallback });
  const viewRef = useRef(view);
  actionRef.current = { onSelectFragment, onPlaceCell, onFallback };
  viewRef.current = view;

  const options = {
    family: 'assemble', quality: 'low', light: 'daylight-gameplay',
    world: 'board-only', imageUrl,
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let stopped = false;
    let renderer;
    const fail = () => { if (!stopped) actionRef.current.onFallback?.(); };

    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      if (!gl) { fail(); return undefined; }
      gl.getExtension('WEBGL_lose_context')?.loseContext();

      renderer = new AtlasThreeRenderer(host, (action) => {
        if (action.type === 'select') actionRef.current.onSelectFragment?.(action.pieceId);
        if (action.type === 'place') actionRef.current.onPlaceCell?.(action.cell);
      }, null, fail);
      rendererRef.current = renderer;
      void renderer.mount(viewRef.current, {
        family: 'assemble', quality: 'low', light: 'daylight-gameplay',
        world: 'board-only', imageUrl,
      }).catch(fail);
    } catch { fail(); }

    return () => {
      stopped = true;
      rendererRef.current = null;
      renderer?.dispose();
    };
  // Image changes start a fresh renderer; state changes update the existing one.
  }, [imageUrl]);

  useEffect(() => {
    if (rendererRef.current?.models?.assemble) {
      rendererRef.current.setState(view, options);
    }
  }, [view, imageUrl]);

  return (
    <div className="w-full relative rounded-xl overflow-hidden border border-amber-500/30 bg-slate-950">
      <div ref={hostRef} aria-label="Experimental solo puzzle rendering" className="w-full" style={{ height: 'min(68vh, 680px)', minHeight: 340 }} />
      <div className="text-xs text-amber-200 px-3 py-2 bg-slate-900">
        Atlas 3D preview · solo practice only · Classic Phaser remains available
      </div>
    </div>
  );
}
