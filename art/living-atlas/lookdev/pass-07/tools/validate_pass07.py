#!/usr/bin/env python3
"""Stand-alone checks for Pass07 concept materials and design contracts; not runtime GPU or 3D performance certification."""
from pathlib import Path
from PIL import Image
import argparse, json, hashlib, sys

TEXT_SUFFIXES={'.json','.md','.py','.svg'}

def manifest_bytes(path):
 data=path.read_bytes()
 # Git may materialize text files as CRLF on Windows. The manifest records
 # repository-canonical LF bytes so validation must use the same form.
 return data.replace(b'\r\n',b'\n') if path.suffix.lower() in TEXT_SUFFIXES else data

def contrast(f,b):
 def lum(s):
  x=[int(s[i:i+2],16)/255 for i in (1,3,5)]
  x=[z/12.92 if z<=.04045 else ((z+.055)/1.055)**2.4 for z in x]
  return .2126*x[0]+.7152*x[1]+.0722*x[2]
 A,B=sorted([lum(f),lum(b)])
 return (B+.05)/(A+.05)

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);a=ap.parse_args();root=a.root
 notes=[]
 def check(ok,label):
  print(('PASS' if ok else 'FAIL')+' '+label)
  if not ok:notes.append(label)
 materials=json.loads((root/'textures/material-presets.json').read_text())
 lighting=json.loads((root/'lighting/lighting-presets.json').read_text())
 fixture=json.loads((root/'fixtures/assemble_uv_fixture.json').read_text())
 check(materials['schemaVersion']==1,'Material schema version 1')
 check(len(materials['materials'])>=6,'All foundational materials present')
 check(set(materials['qualityProfiles'])=={'low','medium','high'},'Low/medium/high tier definitions')
 for basename in ['atlas_basecolor.png','atlas_normal.png','atlas_orm.png']:
  im=Image.open(root/'textures'/basename);check(im.size==(512,512) and im.mode=='RGB',f'{basename} 512x512 RGB')
 im=Image.open(root/'glyphs/planar_glyph_atlas.png');check(im.size==(768,512) and im.mode=='RGBA','Glyph atlas 768x512 RGBA')
 required=['sun','river','seed','ember','indigo','clay'];entries=materials['planarKinds']
 check([v['id'] for v in entries]==required,'Exact six Planar kind identifiers and ordering')
 for v in entries:
  ratio=contrast(v['glyphColor'],v['tileColor']);check(ratio>=3.0,f"{v['id']} glyph contrast {ratio:.2f}:1 >=3:1 (color sample only)")
 check([v['id'] for v in lighting['presets']]==['daylight-gameplay','golden-hour-menu','night-tournament-menu'],'Lighting names and ordering')
 check(lighting['presets'][0]['camera']=='orthographic' and lighting['presets'][0]['postprocessing'] is False,'Stable gameplay lighting')
 check(fixture['exactCpuPixelParity'] and fixture['referenceSha256']==fixture['reconstructionSha256'],'Assemble pixel-exact 5x5 CPU image reconstruction')
 check(materials['gameplayImageFace']['toneMapped'] is False,'Puzzle image faces no tone mapping')
 manifest_path=root/'pass07-manifest.json'
 if manifest_path.exists():
  manifest=json.loads(manifest_path.read_text())
  for obj in manifest['assets']:
   fp=root/obj['path'];present=fp.is_file();check(present,f"exists {obj['path']}")
   if present:
    data=manifest_bytes(fp)
    check(len(data)==obj['bytes'],f"bytes {obj['path']}")
    check(hashlib.sha256(data).hexdigest()==obj['sha256'],f"SHA256 {obj['path']}")
 if notes:
  print('\nVALIDATION FAILED:',len(notes),'failed checks')
  return 1
 print('\nPASS 07 DESIGN/ASSET STATIC CHECKS PASSED. NOT VERIFIED: Three.js GPU UVs, mobile FPS, browser glyph legibility, lighting calibration, permissions or gameplay parity.')
 return 0
if __name__=='__main__':sys.exit(main())
