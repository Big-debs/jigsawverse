import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const ZoomControls = ({
  zoom = 1,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  minZoom = 0.5,
  maxZoom = 2.0
}) => {
  const zoomPercent = Math.round(zoom * 100);
  const canZoomIn = zoom < maxZoom;
  const canZoomOut = zoom > minZoom;

  return (
    <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-md rounded-xl p-2 border border-slate-700">
      <button
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className={`p-2 rounded-lg transition-colors ${
          canZoomOut
            ? 'text-white hover:bg-slate-700 active:bg-slate-600'
            : 'text-slate-600 cursor-not-allowed'
        }`}
        title="Zoom Out"
      >
        <ZoomOut className="w-5 h-5" />
      </button>

      <div className="px-3 py-1 text-white font-semibold min-w-[60px] text-center">
        {zoomPercent}%
      </div>

      <button
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className={`p-2 rounded-lg transition-colors ${
          canZoomIn
            ? 'text-white hover:bg-slate-700 active:bg-slate-600'
            : 'text-slate-600 cursor-not-allowed'
        }`}
        title="Zoom In"
      >
        <ZoomIn className="w-5 h-5" />
      </button>

      <div className="w-px h-6 bg-slate-600 mx-1" />

      <button
        onClick={onZoomReset}
        className="p-2 rounded-lg text-white hover:bg-slate-700 active:bg-slate-600 transition-colors"
        title="Reset Zoom (100%)"
      >
        <Maximize2 className="w-5 h-5" />
      </button>
    </div>
  );
};

export default ZoomControls;
