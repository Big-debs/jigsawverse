#!/usr/bin/env python3
"""Create standalone design-development PBR material and fidelity assets for Jigsawverse.
Not a game renderer or a shipping-material calibration process.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np, math, json, hashlib, os, random
from pathlib import Path
P=Path(__file__).resolve().parents[1]
for sub in ['textures','glyphs','lighting','fixtures','plates']:(P/sub).mkdir(exist_ok=True,parents=True)
font_candidates=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']
bold_candidates=['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf']
def font(s,bold=False):
 for x in (bold_candidates if bold else font_candidates):
  if os.path.exists(x):return ImageFont.truetype(x,s)
 return ImageFont.load_default()
def color(hex):return tuple(int(hex[i:i+2],16) for i in (1,3,5))
def mean_gray(rgb):return .2126*rgb[...,0]+.7152*rgb[...,1]+.0722*rgb[...,2]
def luminance(h):
 c=np.array(color(h))/255
 c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
 return .2126*c[0]+.7152*c[1]+.0722*c[2]
def contrast(a,b):
 x,y=sorted([luminance(a),luminance(b)])
 return (y+.05)/(x+.05)
MATERIALS=[
 dict(id='atlas.limestone',displayName='Warm limestone',base='#AA9983',roughness=.88,metallic=0,normalScale=.35,kind='stone',role='structural frame and courtyard'),
 dict(id='atlas.brass',displayName='Satin brass',base='#B38C4B',roughness=.42,metallic=.87,normalScale=.12,kind='brass',role='small trims, not puzzle faces'),
 dict(id='atlas.clay',displayName='Terracotta clay',base='#BD7658',roughness=.79,metallic=0,normalScale=.42,kind='clay',role='structural inlays and walls'),
 dict(id='atlas.indigo-stone',displayName='Indigo stone',base='#29264D',roughness=.69,metallic=.02,normalScale=.25,kind='indigo',role='board surround, non-image tile sides')
]
T=256; gutter=8; S=512
base_img=Image.new('RGB',(S,S)); normal_img=Image.new('RGB',(S,S)); orm_img=Image.new('RGB',(S,S))
xx,yy=np.meshgrid(np.arange(T)/T,np.arange(T)/T)
rng=np.random.default_rng(20261013)
for i,m in enumerate(MATERIALS):
 # periodic trigonometric pattern to provide smooth loopable height, combined with reproducible fine detail
 phase=i*.93
 low=(np.sin(2*np.pi*(xx*2+yy*.55)+phase)*.48+np.sin(2*np.pi*(yy*3-xx*.7)-phase)*.35+np.cos(2*np.pi*(xx*5+yy*4)+phase)*.17)
 fine=(np.sin(2*np.pi*(xx*15+yy*8))*np.cos(2*np.pi*(yy*11-xx*4)))*.13
 rough_noise=low*.6+fine
 if m['kind']=='brass':
  rough_noise=.3*np.sin(2*np.pi*(yy*24+xx*.4))+.18*low
 elif m['kind']=='stone':
  rough_noise=.54*low+.13*np.sin(2*np.pi*(xx*9+yy*6))
 elif m['kind']=='clay':
  rough_noise=.68*low+.17*np.sin(2*np.pi*(yy*13+xx*9))
 elif m['kind']=='indigo':
  rough_noise=.40*low+.1*np.cos(2*np.pi*(yy*10-xx*4))
 v=np.clip(rough_noise,-1,1)
 c=np.array(color(m['base']),dtype=float)
 albedo=np.uint8(np.clip(c[None,None,:]*(1+v[:,:,None]*(.035 if m['kind']=='brass' else .075)),0,255))
 # tileable derivative normals from height perturbation
 h=(v-v.min())/max(1e-8,v.max()-v.min())
 gy,gx=np.gradient(h)
 k=m['normalScale']*12
 N=np.dstack((-gx*k,np.ones_like(gx),-gy*k))
 N=N/np.maximum(np.linalg.norm(N,axis=2,keepdims=True),1e-8)
 # tangent-space normal encoding: X, Y, Z in texture; use derivatives as X,Y and +Z normal axis
 normal=np.uint8(np.clip((np.dstack((N[:,:,0],N[:,:,2],N[:,:,1]))*.5+.5)*255,0,255))
 orm=np.zeros((T,T,3),dtype=np.uint8)
 orm[:,:,0]=np.uint8(np.clip((.87+.08*v)*255,0,255)) # AO R channel as standalone mask only if explicitly needed
 orm[:,:,1]=np.uint8(np.clip((m['roughness']+.06*v)*255,0,255))
 orm[:,:,2]=int(round(m['metallic']*255))
 for im,a in [(base_img,albedo),(normal_img,normal),(orm_img,orm)]:
  x=(i%2)*T; y=(i//2)*T
  im.paste(Image.fromarray(a,'RGB'),(x,y))
 # NOTE all quadrant UVs have an 8px inset at render time to prevent bilinear bleeding
 m['atlasRectTopLeftPx']=[(i%2)*T+gutter,(i//2)*T+gutter,T-2*gutter,T-2*gutter]
 m['atlasRectTopLeftNormalized']=[round(z/S,6) for z in m['atlasRectTopLeftPx']]
base_img.save(P/'textures'/'atlas_basecolor.png',optimize=True)
normal_img.save(P/'textures'/'atlas_normal.png',optimize=True)
orm_img.save(P/'textures'/'atlas_orm.png',optimize=True)
# emissive isolated line/timing indicator mask (not for scoring feedback)
em=Image.new('RGB',(256,256),(0,0,0)); ed=ImageDraw.Draw(em);ed.rounded_rectangle((72,14,184,242),radius=24,outline=(45,225,206),width=9);ed.line((128,30,128,226),fill=(12,126,121),width=3);em.save(P/'textures'/'inlay_emissive_mask.png',optimize=True)

# Unique SVG shapes preserving source IDs but using clean paths at uniform icon scale.
# Symbols intentionally have semantic meaning derived from previous pass 06 glyph concepts.
SHAPES={
'sun':'<circle cx="50" cy="50" r="15"/><path d="M50 8v14 M50 78v14 M8 50h14 M78 50h14 M20 20l10 10 M70 70l10 10 M80 20L70 30 M30 70L20 80"/>',
'river':'<path d="M12 25 Q28 11 44 25 T76 25 T92 25 M12 49 Q28 35 44 49 T76 49 T92 49 M12 73 Q28 59 44 73 T76 73 T92 73"/>',
'seed':'<path d="M50 85V37 M50 48 Q21 5 13 37 Q19 57 50 57 M50 39 Q72 11 89 32 Q85 51 50 49"/>',
'ember':'<path d="M50 9 C64 29 61 32 69 37 C82 26 89 53 81 73 C74 89 61 92 50 92 C31 92 15 79 18 60 C21 42 36 37 36 19 C44 28 47 31 50 9 Z M49 83 C38 73 46 59 56 50 C57 65 69 73 60 83"/>',
'indigo':'<path d="M50 8L92 50L50 92L8 50Z M50 29L71 50L50 71L29 50Z"/>',
'clay':'<path d="M25 17H75 M32 19 Q28 53 31 72 Q50 94 69 72 Q72 53 68 19 M38 9H62 M36 60Q50 67 64 60"/>'
}
KINDS=[('sun','#B87C26','#141F35'),('river','#176B82','#FFF5DF'),('seed','#25694D','#FFF5DF'),('ember','#A83B30','#FFF5DF'),('indigo','#44397D','#FFF5DF'),('clay','#D6C1A3','#182B3B')]
# Material token names preserve six kind IDs, not new gameplay types.
svgs=['<svg xmlns="http://www.w3.org/2000/svg" width="768" height="512" viewBox="0 0 768 512">']
for n,(id,bg,fg) in enumerate(KINDS):
 x=(n%3)*256;y=(n//3)*256
 svgs.append(f'<g transform="translate({x},{y})"><path fill="none" d="M0 0h256v256h-256Z"/><g transform="translate(28,28) scale(2)" fill="none" stroke="{fg}" stroke-linecap="round" stroke-linejoin="round" stroke-width="6">{SHAPES[id]}</g></g>')
svgs.append('</svg>')
(P/'glyphs'/'planar_glyph_atlas.svg').write_text(''.join(svgs))
# transparent image atlas with independently rasterized icons from SVG
try:
 import cairosvg
 cairosvg.svg2png(bytestring=''.join(svgs).encode(),write_to=str(P/'glyphs'/'planar_glyph_atlas.png'))
except Exception as e:
 raise RuntimeError('cairosvg is required for deterministic SVG glyph rasterisation') from e

# Pixel-exact test fixture for Assemble image mapping: asymmetric corner labels ensure orientation proof.
W=1000; H=1000
fixture=Image.new('RGB',(W,H));a=np.zeros((H,W,3),dtype=np.uint8)
X,Y=np.meshgrid(np.arange(W),np.arange(H));a[:,:,0]=np.uint8(48+150*X/W);a[:,:,1]=np.uint8(48+128*Y/H);a[:,:,2]=np.uint8(75+90*((X+Y)/2000))
fixture=Image.fromarray(a,'RGB');d=ImageDraw.Draw(fixture)
# draw explicitly asymmetric landmarks and distinguishable corners
colors=[('#E8484D','NW'),('#1898C3','NE'),('#27A77C','SW'),('#E3B43F','SE')]
for (cx,cy),(c,name) in zip([(0,0),(W-126,0),(0,H-126),(W-126,H-126)],colors):
 d.rounded_rectangle((cx+8,cy+8,cx+118,cy+118),radius=15,fill=c)
 d.text((cx+32,cy+41),name,font=font(37,True),fill='#172034')
d.ellipse((370,280,650,560),outline='#FFF5DF',width=13)
d.polygon([(425,555),(570,120),(722,765)],fill='#C77D4F')
d.text((356,818),'ORIENTATION / CROP FIXTURE',font=font(30,True),fill='#111827')
d.text((420,866),'ROW 0 AT TOP',font=font(29,True),fill='#FFF5DF')
fixture.save(P/'fixtures'/'assemble_uv_reference.png',optimize=True)
# Fixture covers 5x5 sample grid; verify split-and-stitch bit-exact, present spaced tiles separately.
R=C=5;tileW=W//C;tileH=H//R
out=Image.new('RGB',(W,H));board=Image.new('RGB',(5*tileW+6*10,5*tileH+6*10),(19,27,42));bd=ImageDraw.Draw(board)
for row in range(R):
 for col in range(C):
  crop=fixture.crop((col*tileW,row*tileH,(col+1)*tileW,(row+1)*tileH))
  out.paste(crop,(col*tileW,row*tileH)); board.paste(crop,((col+1)*10+col*tileW,(row+1)*10+row*tileH))
assert np.array_equal(np.asarray(out),np.asarray(fixture)), 'UV fixture reconstruction failed'
board.save(P/'fixtures'/'assemble_uv_tiles_5x5.png',optimize=True)
# composite proof
uvproof=Image.new('RGB',(1600,875),(16,23,36));dp=ImageDraw.Draw(uvproof)
dp.text((50,27),'ASSEMBLE / IMAGE-SPACE UV RECONSTRUCTION',font=font(33,True),fill='#FFF5DF')
for img,x in [(fixture,60),(out,850)]:
 im=img.resize((680,680),Image.Resampling.NEAREST); uvproof.paste(im,(x,112))
dp.text((65,814),'SOURCE — 1000 x 1000',font=font(23,True),fill='#D7AA55')
dp.text((855,814),'REASSEMBLED — EXACT PIXEL MATCH',font=font(23,True),fill='#4BDAC5')
uvproof.save(P/'fixtures'/'assemble_uv_pixel_proof.png',optimize=True)
(P/'fixtures'/'assemble_uv_fixture.json').write_text(json.dumps({
 'status':'CPU pixel reconstruction; NOT a Three.js texture-upload or GPU UV test','reference':'assemble_uv_reference.png','dimensions':[W,H],
 'rows':R,'cols':C,'origin':'image top-left','tiles':[{'id':r*C+c,'row':r,'col':c,'pixelRectTopLeft':[c*tileW,r*tileH,tileW,tileH],
 'uvRectTopLeftNormalized':[c/C,r/R,1/C,1/R]} for r in range(R) for c in range(C)],
 'referenceSha256':hashlib.sha256(fixture.tobytes()).hexdigest(),'reconstructionSha256':hashlib.sha256(out.tobytes()).hexdigest(),'exactCpuPixelParity':True,
 'runtimeNote':'GLTF/Three.js UV origin and texture flipY handling must be verified against renderer; do not infer from this CPU test.'},indent=2))

# Glyph legibility proof at 32/44/64; nominal icon diameter and high contrast.
glyph_img=Image.open(P/'glyphs'/'planar_glyph_atlas.png').convert('RGBA')
proof=Image.new('RGB',(1460,550),(18,27,42));d=ImageDraw.Draw(proof)
d.text((30,23),'PLANAR / SIX KIND IDENTITIES — SMALL-SCREEN CHECK',font=font(30,True),fill='#FFF5DF')
for j,size in enumerate([32,44,64]):
 d.text((30,100+j*130),f'{size}px glyph',font=font(20,True),fill='#C7D2DF')
 for k,(id,bg,fg) in enumerate(KINDS):
  x=190+k*198;y=91+j*130
  canvas=Image.new('RGB',(82,82),bg)
  icon=glyph_img.crop(((k%3)*256,(k//3)*256,((k%3)+1)*256,((k//3)+1)*256))
  bb=icon.getbbox()
  icon=icon.crop(bb).resize((size,size),Image.Resampling.LANCZOS)
  canvas.paste(icon,((82-size)//2,(82-size)//2),icon)
  proof.paste(canvas,(x,y));d.text((x+4,y+86),id.upper(),font=font(15,True),fill='#FFF5DF')
  if j==0:d.text((x+83,y+10),f'{contrast(bg,fg):.1f}:1',font=font(15),fill='#4BDAC5')
d.text((30,504),'Shape + colour redundancy; human validation on 390x844 devices still required.',font=font(18),fill='#A8B8C9')
proof.save(P/'fixtures'/'planar_glyph_size_proof.png',optimize=True)

# Materials swatch sheet created from actual bitmap assets; not a fake 3D render.
swatch=Image.new('RGB',(1650,840),(18,26,42));dd=ImageDraw.Draw(swatch)
dd.text((50,35),'LIVING ATLAS  /  PROCEDURAL MATERIAL LAB',font=font(37,True),fill='#FFF5DF')
dd.text((50,93),'Actual texture pixels  •  standardized previews  •  not final lighting validation',font=font(20),fill='#BFCBDD')
for k,m in enumerate(MATERIALS):
 x=50+k*401; y=155; row,col=divmod(k,2)
 chip=base_img.crop((col*T,row*T,(col+1)*T,(row+1)*T)).resize((350,350))
 swatch.paste(chip,(x,y))
 dd.rectangle((x,y,x+350,y+350),outline='#D7AA55',width=2)
 dd.text((x,y+376),m['displayName'].upper(),font=font(22,True),fill='#FFF5DF')
 dd.text((x,y+416),f"METAL {m['metallic']:.2f}  /  ROUGH {m['roughness']:.2f}",font=font(17),fill='#BFCBDD')
 dd.text((x,y+448),m['role'][:31],font=font(16),fill='#BFCBDD')
dd.text((50,698),'LOW: flat/unlit colors  •  MEDIUM: base + ORM  •  HIGH: base + normal + ORM',font=font(22,True),fill='#4BDAC5')
dd.text((50,745),'Puzzle image top uses faithful unlit image material; no brass reflections or tint on the photograph.',font=font(19),fill='#C7D2DF')
swatch.save(P/'plates'/'pass07_actual_material_swatch.png',optimize=True)

# Illustration-only tier visualization based on tinted structural surfaces; not real measured GPU render
profile=Image.new('RGB',(1440,790),(17,26,41));d=ImageDraw.Draw(profile)
d.text((40,33),'ATLAS WORKSHOP  /  QUALITY-TIER LOOK DEVELOPMENT',font=font(35,True),fill='#FFF5DF')
labels=[('LOW 3D','Flat color / no texture normal','#25304C'),('MEDIUM 3D','Base + ORM / no postprocessing','#282644'),('HIGH 3D','Base + normal + restrained lighting','#29264D')]
for i,(title,detail,bg) in enumerate(labels):
 x=30+i*476;y=138
 d.rounded_rectangle((x,y,x+454,y+545),radius=22,fill=bg,outline='#D7AA55',width=2)
 d.text((x+25,y+25),title,font=font(28,True),fill='#FFF5DF')
 d.text((x+25,y+67),detail,font=font(15),fill='#BFD2DE')
 # material-driven board schematic to avoid incorrectly implying a 3D runtime
 for r in range(5):
  for c in range(5):
   tx=x+65+c*65; ty=y+145+r*65
   cc=color(MATERIALS[(r+c)%4]['base'])
   if i==0:chip=Image.new('RGB',(57,57),cc)
   else:
    index=(r+c)%4; rr,cc2=divmod(index,2);chip=base_img.crop((cc2*T+40,rr*T+40,cc2*T+96,rr*T+96))
   d.rectangle((tx-4,ty-4,tx+61,ty+61),fill='#B38C4B' if i>0 else '#AA9983')
   profile.paste(chip,(tx,ty))
   if i==2:d.rectangle((tx+1,ty+1,tx+55,ty+55),outline='#E7CC85',width=1)
 d.text((x+25,y+501),'Same 5x5 positions / no rules changes',font=font(16),fill='#FFF5DF')
d.text((40,725),'Production goals only: FPS, GPU memory and temperature require physical-device benchmarks.',font=font(20),fill='#C7D2DF')
profile.save(P/'plates'/'pass07_three_tier_design_proof.png',optimize=True)

# JSON contracts
presets={
 'schemaVersion':1,'status':'procedural-lookdev-not-production','assetWorld':'living-atlas','theme':'atlas-workshop',
 'textureAtlas':{'width':S,'height':S,'tileWidth':T,'gutterPx':gutter,'colorSpace':{'baseColor':'sRGB','normal':'linear','orm':'linear'},
 'metallicRoughnessChannels':{'G':'roughness','B':'metallic'},'ormChannels':{'R':'AO (do not assume standard glTF uses ORM in one sampler)','G':'roughness','B':'metallic'},
 'files':{'baseColor':'atlas_basecolor.png','normal':'atlas_normal.png','ORM':'atlas_orm.png'},
 'uvConvention':'atlasRects recorded top-left; GLTF mesh UV must be transformed/verified in renderer against these before use'},
 'materials':MATERIALS+[{'id':'atlas.ivory','displayName':'Ivory','base':'#FFF5DF','metallic':0,'roughness':.88,'texture':None,'role':'UI/text only; not a reflective puzzle face'},
 {'id':'atlas.energy','displayName':'Energy accent','base':'#4BDAC5','metallic':0,'roughness':1,'emissive':'#4BDAC5','intensity':.35,'texture':None,'role':'inert rails and selection focus only; no hidden correctness cues'}],
 'gameplayImageFace':{'toneMapped':False,'lighting':'unlit','baseColorFactor':[1,1,1,1],
 'colorSpace':'sRGB','alphaMode':'OPAQUE','effects':'none','notes':'Puzzle image must not inherit tinted atlas roughness/metal/normal; image cropping handled by separate UV shader and transparent answer policy.'},
 'qualityProfiles':{'low':{'textures':['flat colors','glyph atlas'],'normalMaps':False,'environment':'poster or graybox','postprocessing':False,'shadows':False,'maxParticles':16},
 'medium':{'textures':['basecolor','ORM','glyph atlas'],'normalMaps':False,'postprocessing':False,'shadows':False,'maxParticles':48},
 'high':{'textures':['basecolor','ORM','normal','glyph atlas'],'normalMaps':True,'postprocessing':'optional restrained effect after measured profiling','shadows':'one directional 1024 max, only if within targets','maxParticles':96}},
 'planarKinds':[{'id':id,'tileColor':bg,'glyphColor':fg,'foregroundBackgroundContrast':round(contrast(bg,fg),2),'glyphCellAtlasTopLeft':[i%3,i//3]} for i,(id,bg,fg) in enumerate(KINDS)]
}
(P/'textures'/'material-presets.json').write_text(json.dumps(presets,indent=2))
lighting={
 'schemaVersion':1,'status':'design parameters not physically benchmarked','unitSystem':'threejs scene units, default cell 1; color values in hex','colorManagement':{'output':'sRGB','referenceExposure':1,'imageFaceToneMapped':False},
 'presets':[
  {'id':'daylight-gameplay','purpose':'Default Assemble/Planar active gameplay','worldBackdrop':'static/daylight','hemisphere':{'sky':'#D6E8FF','ground':'#8E705A','intensity':.8},'key':{'type':'directional','color':'#FFE1B3','intensity':2.0,'direction':[.5,1,.7],'castShadow':'high-only'},'fill':{'type':'ambient','color':'#C6D4EC','intensity':.35},'emissiveIntensity':.25,'postprocessing':False,'camera':'orthographic','needsPhysicalVerification':True},
  {'id':'golden-hour-menu','purpose':'Menu and noninteractive world presentation only','worldBackdrop':'static/golden-hour','hemisphere':{'sky':'#F9CEA2','ground':'#695145','intensity':.75},'key':{'type':'directional','color':'#FFC37D','intensity':2.3,'direction':[-.6,1,.3],'castShadow':'high-only'},'fill':{'type':'ambient','color':'#A8BBDE','intensity':.27},'emissiveIntensity':.3,'postprocessing':'optional menu only','camera':'perspective','needsPhysicalVerification':True},
  {'id':'night-tournament-menu','purpose':'Lobby / tournament results only; not competitive active board','worldBackdrop':'static/night','hemisphere':{'sky':'#6B88D0','ground':'#2B243D','intensity':.55},'key':{'type':'directional','color':'#AFCFFF','intensity':1.35,'direction':[.5,1,.2],'castShadow':False},'fill':{'type':'ambient','color':'#8799C1','intensity':.3},'emissiveIntensity':.45,'postprocessing':'optional menu only','camera':'perspective','needsPhysicalVerification':True}
 ],
 'guardrails':['Puzzle image UV sampled in sRGB without tone mapping or tinted lighting.','No visually graded correct/incorrect placement before authorized reveal.','Planar glyph identity readable with ambient lighting; no reliance on bloom.','Lighting never changes selection targets, logical state, timer or tile kind IDs.','Preview presets must be measured and revised on physical low-tier mobile.']
}
(P/'lighting'/'lighting-presets.json').write_text(json.dumps(lighting,indent=2))
print('Generated Pass07 image/text assets:',sum(1 for _ in P.rglob('*') if _.is_file()))
