import { useEffect, useRef, useState } from 'react';
import { VISUAL_CONFIG } from '../lib/gameConfig';

const PuzzleCanvas = ({
  grid,
  gridSize,
  ghostImage,
  settings,
  onCellClick,
  onPieceDrop,
  draggedPiece,
  dragPosition,
  zoom = 1,
  offset = { x: 0, y: 0 }
}) => {
  const canvasRef = useRef(null);
  const [ghostImageLoaded, setGhostImageLoaded] = useState(null);
  const [pieceImages, setPieceImages] = useState({});
  const [snapPreview, setSnapPreview] = useState(null);

  const CELL_SIZE = 60;
  const LABEL_MARGIN = 30;
  const SNAP_THRESHOLD = 30;

  // Load ghost image
  useEffect(() => {
    if (!ghostImage || !settings?.showGhostImage) {
      setGhostImageLoaded(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setGhostImageLoaded(img);
    img.onerror = () => setGhostImageLoaded(null);
    img.src = ghostImage;
  }, [ghostImage, settings?.showGhostImage]);

  // Load piece images
  useEffect(() => {
    if (!grid) return;

    const loadPieceImages = async () => {
      const images = {};
      const promises = [];

      grid.forEach((piece) => {
        if (piece && piece.imageData && !pieceImages[piece.id]) {
          const promise = new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              images[piece.id] = img;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = piece.imageData;
          });
          promises.push(promise);
        }
      });

      await Promise.all(promises);
      if (Object.keys(images).length > 0) {
        setPieceImages(prev => ({ ...prev, ...images }));
      }
    };

    loadPieceImages();
  }, [grid, pieceImages]);

  // Load dragged piece image
  useEffect(() => {
    if (!draggedPiece || !draggedPiece.imageData || pieceImages[draggedPiece.id]) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setPieceImages(prev => ({ ...prev, [draggedPiece.id]: img }));
    };
    img.src = draggedPiece.imageData;
  }, [draggedPiece, pieceImages]);

  // Calculate snap preview
  useEffect(() => {
    if (!draggedPiece || !dragPosition) {
      setSnapPreview(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = dragPosition.x - rect.left;
    const canvasY = dragPosition.y - rect.top;

    // Transform to grid coordinates
    const x = (canvasX - offset.x) / zoom - LABEL_MARGIN;
    const y = (canvasY - offset.y) / zoom - LABEL_MARGIN;

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
      const gridIndex = row * gridSize + col;
      const cellCenterX = LABEL_MARGIN + col * CELL_SIZE + CELL_SIZE / 2;
      const cellCenterY = LABEL_MARGIN + row * CELL_SIZE + CELL_SIZE / 2;

      const distance = Math.sqrt(
        Math.pow((x + LABEL_MARGIN) - cellCenterX, 2) +
        Math.pow((y + LABEL_MARGIN) - cellCenterY, 2)
      );

      if (distance < SNAP_THRESHOLD && (!grid || !grid[gridIndex])) {
        setSnapPreview({ row, col, gridIndex });
        return;
      }
    }

    setSnapPreview(null);
  }, [draggedPiece, dragPosition, grid, gridSize, zoom, offset]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const totalSize = LABEL_MARGIN + gridSize * CELL_SIZE;

    // Set canvas size
    canvas.width = totalSize;
    canvas.height = totalSize;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context
    ctx.save();

    // Apply zoom and pan transforms
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // 1. Draw ghost image
    if (ghostImageLoaded && settings?.showGhostImage) {
      ctx.globalAlpha = VISUAL_CONFIG.GHOST_OPACITY;
      ctx.drawImage(
        ghostImageLoaded,
        LABEL_MARGIN,
        LABEL_MARGIN,
        gridSize * CELL_SIZE,
        gridSize * CELL_SIZE
      );
      ctx.globalAlpha = 1.0;
    }

    // 2. Draw external labels
    if (settings?.showGridLabels) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = VISUAL_CONFIG.GRID_LABEL_OPACITY;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Column letters (A-J) on top
      for (let col = 0; col < gridSize; col++) {
        const letter = String.fromCharCode(65 + col); // A=65
        const x = LABEL_MARGIN + col * CELL_SIZE + CELL_SIZE / 2;
        const y = LABEL_MARGIN / 2;
        ctx.fillText(letter, x, y);
      }

      // Row numbers (1-10) on left
      for (let row = 0; row < gridSize; row++) {
        const number = row + 1;
        const x = LABEL_MARGIN / 2;
        const y = LABEL_MARGIN + row * CELL_SIZE + CELL_SIZE / 2;
        ctx.fillText(number.toString(), x, y);
      }

      ctx.globalAlpha = 1.0;
    }

    // 3. Draw grid cells
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const x = LABEL_MARGIN + col * CELL_SIZE;
        const y = LABEL_MARGIN + row * CELL_SIZE;
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }

    // 4. Draw placed pieces
    if (grid) {
      grid.forEach((piece, index) => {
        if (piece && pieceImages[piece.id]) {
          const col = index % gridSize;
          const row = Math.floor(index / gridSize);
          const x = LABEL_MARGIN + col * CELL_SIZE;
          const y = LABEL_MARGIN + row * CELL_SIZE;

          ctx.drawImage(pieceImages[piece.id], x, y, CELL_SIZE, CELL_SIZE);

          // Highlight edges if enabled
          if (settings?.highlightEdges && piece.isEdge) {
            ctx.strokeStyle = VISUAL_CONFIG.EDGE_HIGHLIGHT_COLOR;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
          }
        }
      });
    }

    // 5. Draw snap preview
    if (snapPreview) {
      const x = LABEL_MARGIN + snapPreview.col * CELL_SIZE;
      const y = LABEL_MARGIN + snapPreview.row * CELL_SIZE;

      ctx.strokeStyle = VISUAL_CONFIG.SNAP_PREVIEW_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
      ctx.setLineDash([]);
    }

    // Restore context before drawing dragged piece (outside transforms)
    ctx.restore();

    // 6. Draw dragged piece at cursor (in screen coordinates, not transformed)
    if (draggedPiece && dragPosition && pieceImages[draggedPiece.id]) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const canvasX = dragPosition.x - rect.left;
      const canvasY = dragPosition.y - rect.top;

      // Draw shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;

      ctx.drawImage(
        pieceImages[draggedPiece.id],
        canvasX - CELL_SIZE / 2,
        canvasY - CELL_SIZE / 2,
        CELL_SIZE,
        CELL_SIZE
      );

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
  }, [
    grid,
    gridSize,
    ghostImageLoaded,
    settings,
    pieceImages,
    draggedPiece,
    dragPosition,
    snapPreview,
    zoom,
    offset
  ]);

  // Handle click
  const handleClick = (e) => {
    if (!onCellClick || draggedPiece) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const gridIndex = getGridIndexFromCanvasPosition(canvasX, canvasY);
    if (gridIndex !== -1) {
      onCellClick(gridIndex);
    }
  };

  // Handle drop
  const handleDrop = (e) => {
    if (!onPieceDrop || !draggedPiece) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const gridIndex = getGridIndexFromCanvasPosition(canvasX, canvasY);
    if (gridIndex !== -1) {
      onPieceDrop(draggedPiece.id, gridIndex);
    }
  };

  const getGridIndexFromCanvasPosition = (canvasX, canvasY) => {
    const x = (canvasX - offset.x) / zoom - LABEL_MARGIN;
    const y = (canvasY - offset.y) / zoom - LABEL_MARGIN;

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return -1;
    return row * gridSize + col;
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onMouseUp={handleDrop}
      className="border border-slate-700 rounded-lg bg-slate-900"
      style={{
        cursor: draggedPiece ? 'grabbing' : 'pointer',
        imageRendering: 'auto'
      }}
    />
  );
};

export default PuzzleCanvas;
