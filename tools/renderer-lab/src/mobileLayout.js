/** Pass 11: pure screen-space readability diagnostics, not a gameplay rule. */
export const MODE_FRAMING = Object.freeze({
  assemble: Object.freeze({minWidth:6.8,minHeight:9.1,tileSize:0.92,glyphSize:null}),
  planar: Object.freeze({minWidth:8.4,minHeight:8.4,tileSize:0.92,glyphSize:0.72}),
});
export const MIN_RECOMMENDED_GLYPH_PX = 32;
/** Mirrors the orthographic projection dimensions used by the renderer. */
export function calculateViewportFit(family,width,height){
  const mode=MODE_FRAMING[family];
  if(!mode)throw new RangeError('Unknown game family');
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Invalid render surface');
  const aspect=width/height;
  const worldWidth=Math.max(mode.minWidth,mode.minHeight*aspect);
  const worldHeight=worldWidth/aspect;
  const pxPerUnit=width/worldWidth;
  return Object.freeze({
    family,width,height,worldWidth,worldHeight,
    cellPx:Math.round(pxPerUnit*10)/10,
    tilePx:Math.round(pxPerUnit*mode.tileSize*10)/10,
    glyphPx:mode.glyphSize===null?null:Math.round(pxPerUnit*mode.glyphSize*10)/10,
    glyphNeedsReview:mode.glyphSize!==null&&pxPerUnit*mode.glyphSize<MIN_RECOMMENDED_GLYPH_PX,
    landscapeCompact:width>height&&height<400,
  });
}
