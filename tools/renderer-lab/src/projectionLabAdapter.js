/**
 * Pass 13: strict, read-only bridge to the CURRENT isolated 5x5 Assemble
 * and 6x6 Planar renderer lab. Not a production renderer adapter.
 *
 * Assemble's existing laboratory uses fragment ordinals to sample one image.
 * That is acceptable ONLY for the explicit local solo reference fixture;
 * it must never be used for ranked/multiplayer per-viewer projections.
 */
import { freezeProjection } from './engineProjection.js';

export function planarToLabState(frame) {
  const safe = freezeProjection(frame);
  if (safe.family!=='planar') throw new TypeError('Planar renderer requires a Planar projection');
  const tiles = safe.board.cells.map(c=>Object.freeze({id:c.renderToken,kind:c.kind}));
  return Object.freeze({
    family:'planar',count:6,board:Object.freeze(tiles),
    demoMoves:safe.revision,
  });
}
export function soloAssembleToLabState(frame, {fragmentForToken, allowLocalImageSlices=false}={}) {
  const safe = freezeProjection(frame);
  if (safe.family!=='assemble'||safe.origin!=='solo-local'||allowLocalImageSlices!==true) {
    throw new TypeError('Lab image-slice mapping is explicitly SOLO ONLY');
  }
  if(safe.board.rows!==5||safe.board.cols!==5||safe.rack.length>10) {
    throw new RangeError('Current Assemble lab supports only 5x5 and at most ten rack tiles');
  }
  if(typeof fragmentForToken!=='function') throw new TypeError('Approved local-only fragment registry required');
  const cache=new Map();
  const resolve=(renderToken)=>{
    if(renderToken===null)return null;
    if(!cache.has(renderToken)){
      const visual=fragmentForToken(renderToken);
      if(!Number.isSafeInteger(visual)||visual<0||visual>=25) throw new TypeError('Unapproved local image fragment');
      cache.set(renderToken,visual);
    }
    return cache.get(renderToken);
  };
  const board=safe.board.cells.map(c=>c===null?null:resolve(c.renderToken));
  const rack=safe.rack.map(resolve);
  const present=[...board,...rack].filter(x=>x!==null);
  if(new Set(present).size!==present.length) throw new TypeError('Ambiguous local fragment assets');
  return Object.freeze({
    family:'assemble',count:5,
    board:Object.freeze(board),
    rack:Object.freeze(rack),
    selected:null,uvProof:false,
    demoMoves:safe.revision,
  });
}
