/** CPU-testable UV rectangle contracts (no Three.js dependency).
 * PlaneGeometry rotated -90deg around X: visual top is negative Z.
 * Image rows are top-first; UV V=1 represents texture top with flipY=true.
 */
import { KINDS } from './demoState.js';
export function imageUvRect(n,row,col) {
  if(!Number.isInteger(n)||n<1||!Number.isInteger(row)||!Number.isInteger(col)||row<0||col<0||row>=n||col>=n)throw new RangeError('Invalid image fragment');
  return {u0:col/n,u1:(col+1)/n,v0:1-(row+1)/n,v1:1-row/n};
}
export function glyphUvRect(kind) {
  const i=KINDS.indexOf(kind);
  if(i<0)throw new RangeError('Unknown Planar kind');
  const u0=(i%3)/3,u1=u0+1/3,v1=1-Math.floor(i/3)/2,v0=v1-.5;
  return {u0,u1,v0,v1};
}
