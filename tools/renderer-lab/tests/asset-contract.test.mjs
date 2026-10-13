import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const art = (path)=>join(root,'art/living-atlas',path);

test('renderer laboratory references existing reusable atlas library rather than duplicate art', () => {
  for(const path of [
    'modeling/pass-06/glb/assemble_5x5_with_rack_graybox.glb',
    'modeling/pass-06/glb/planar_6x6_with_rails_graybox.glb',
    'modeling/pass-06/glb/tile_beveled.glb',
    'lookdev/pass-07/glyphs/planar_glyph_atlas.png',
    'lookdev/pass-07/fixtures/assemble_uv_reference.png',
    'lookdev/pass-07/textures/atlas_basecolor.png',
    'lookdev/pass-07/textures/atlas_normal.png',
    'lookdev/pass-07/textures/atlas_orm.png',
    'lookdev/pass-07/lighting/lighting-presets.json',
    'lookdev/pass-07/textures/material-presets.json',
  ]) assert.ok(statSync(art(path)).size>0,path);
});
test('original GLBs retain valid glTF binary header',()=>{
  for(const name of ['assemble_5x5_with_rack_graybox.glb','planar_6x6_with_rails_graybox.glb','tile_beveled.glb']){
    const buffer=readFileSync(art('modeling/pass-06/glb/'+name));
    assert.equal(buffer.toString('ascii',0,4),'glTF');assert.equal(buffer.readUInt32LE(4),2);
    assert.equal(buffer.readUInt32LE(8),buffer.length);
  }
});
test('light and material preset schema exists',()=>{
  const lighting=JSON.parse(readFileSync(art('lookdev/pass-07/lighting/lighting-presets.json')));
  assert.deepEqual(lighting.presets.map(x=>x.id),['daylight-gameplay','golden-hour-menu','night-tournament-menu']);
  const materials=JSON.parse(readFileSync(art('lookdev/pass-07/textures/material-presets.json')));
  for(const id of ['atlas.limestone','atlas.brass','atlas.clay','atlas.indigo-stone'])assert.ok(materials.materials.some(m=>m.id===id));
});
test('lab is isolated from production gameplay and multiplayer imports',()=>{
  const source=readFileSync(join(root,'tools/renderer-lab/src/threeScene.js'),'utf-8');
  assert.doesNotMatch(source,/gameLogic|multiplayer|supabase|planarMatchEngine|MatchGame/);
  assert.match(source,/GLTFLoader/);
  assert.match(source,/WebGLRenderer/);
});
