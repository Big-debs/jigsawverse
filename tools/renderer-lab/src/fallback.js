import { KINDS, KIND_COLORS } from './demoState.js';

const COLORS = { ivory: '#fff4db', brass: '#d7aa55', teal: '#4bdac5', ink: '#111827' };
const fillRound = (ctx, x, y, w, h, rad, fill, stroke) => {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, rad);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
};

function drawGlyph(ctx, kind, x, y, cell) {
  const k = KINDS.indexOf(kind);
  const cx = x + cell / 2, cy = y + cell / 2, r = cell * .23;
  const light = [0,5].includes(k) ? '#172640' : '#fff4db';
  ctx.save(); ctx.lineWidth = Math.max(2, cell * .075); ctx.strokeStyle = light; ctx.fillStyle = light;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.translate(cx, cy);
  if (k === 0) {
    ctx.beginPath(); ctx.arc(0,0,r*.6,0,Math.PI*2); ctx.stroke();
    for(let a=0;a<8;a++){let ang=a*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(ang)*r*.9,Math.sin(ang)*r*.9);ctx.lineTo(Math.cos(ang)*r*1.3,Math.sin(ang)*r*1.3);ctx.stroke();}
  } else if (k === 1) {
    for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(-r, i*r*.6);ctx.bezierCurveTo(-r*.4,-r*.25+i*r*.6,r*.2,r*.45+i*r*.6,r,i*r*.6);ctx.stroke();}
  } else if (k === 2) {
    ctx.beginPath();ctx.moveTo(0,r);ctx.lineTo(0,-r*.3);ctx.stroke();
    for(const s of [-1,1]){ctx.beginPath();ctx.ellipse(s*r*.46,-r*.25,r*.45,r*.2,s*.45,0,Math.PI*2);ctx.stroke();}
  } else if (k === 3) {
    ctx.beginPath();ctx.moveTo(0,-r*1.4);ctx.bezierCurveTo(r*.65,-r*.35,r*1.05,r*.6,0,r*1.3);ctx.bezierCurveTo(-r*1.1,r*.7,-r*.6,-r*.3,0,-r*1.4);ctx.stroke();
  } else if (k === 4) {
    ctx.rotate(Math.PI/4);ctx.strokeRect(-r*.7,-r*.7,r*1.4,r*1.4);ctx.strokeRect(-r*.33,-r*.33,r*.66,r*.66);
  } else {
    fillRound(ctx,-r*.75,-r*.65,r*1.5,r*1.35,r*.22,null,light);
    ctx.beginPath();ctx.moveTo(-r*.9,-r*.85);ctx.lineTo(r*.9,-r*.85);ctx.stroke();
    ctx.beginPath();ctx.arc(0,r*.1,r*.4,0,Math.PI);ctx.stroke();
  }
  ctx.restore();
}

export class FallbackRenderer {
  constructor(container, onAction) {
    this.container = container; this.onAction = onAction;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'fallback-canvas';
    this.canvas.tabIndex = 0; this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Two-dimensional reference view. Use the accessible controls below for interaction.');
    container.replaceChildren(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.handlePointer = e => this.pick(e);
    this.canvas.addEventListener('pointerdown',this.handlePointer);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }
  setState(state, options) { this.state=state; this.options=options; this.draw(); }
  resize() {
    const rect=this.container.getBoundingClientRect(); this.width=Math.max(280,Math.floor(rect.width));this.height=Math.max(350,Math.floor(rect.height));
    const dpr=Math.min(2,window.devicePixelRatio||1);
    this.canvas.width=Math.floor(this.width*dpr);this.canvas.height=Math.floor(this.height*dpr);
    this.canvas.style.width=`${this.width}px`;this.canvas.style.height=`${this.height}px`;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);this.draw();
  }
  draw() {
    if(!this.state||!this.ctx)return;
    const ctx=this.ctx,w=this.width,h=this.height;
    ctx.clearRect(0,0,w,h);
    const gr=ctx.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#23314a');gr.addColorStop(.55,'#1e2941');gr.addColorStop(1,'#102c37');
    ctx.fillStyle=gr;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.globalAlpha=.06;ctx.strokeStyle='#f6cc85';
    for(let i=-h;i<w+h;i+=30){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+h,h);ctx.stroke();}ctx.restore();
    const assemble=this.state.family==='assemble',n=assemble?5:6;
    const maxBoard=assemble?Math.min(w*.82,h*.62):Math.min(w*.84,h*.82);
    const size=Math.floor(maxBoard),cell=size/n,x=(w-size)/2,y=assemble?Math.max(18,(h-size-(Math.min(h*.23,116)))/2):Math.max(20,(h-size)/2);
    this.boardRect={x,y,size,cell,n};
    fillRound(ctx,x-14,y-14,size+28,size+28,12,'#19273a','#d7aa55');
    fillRound(ctx,x-7,y-7,size+14,size+14,6,'#0b1424','#627b89');
    for(let i=0;i<n*n;i++){
      const row=Math.floor(i/n),col=i%n,px=x+col*cell,py=y+row*cell;
      fillRound(ctx,px+1,py+1,cell-2,cell-2,Math.max(1,cell*.05),'#263549','#405668');
      if(assemble){
        const piece=this.state.uvProof?i:this.state.board[i];
        if(piece!==null){
          // Asymmetric schematic colors prove orientation/top-row ordering in fallback; GPU uses the actual reference image.
          const color=`hsl(${30+Math.floor(piece/n)*20+piece%n*8} 42% ${38+((piece*3)%19)}%)`;
          fillRound(ctx,px+2,py+2,cell-4,cell-4,2,color,'#a99267');
          ctx.fillStyle='#fff7dd';ctx.font=`${Math.max(8,cell*.22)}px system-ui`;ctx.fillText(`${piece}`,px+cell*.13,py+cell*.72);
        }
      } else {
        const kind=this.state.board[i].kind,k=KINDS.indexOf(kind);
        fillRound(ctx,px+2,py+2,cell-4,cell-4,Math.max(2,cell*.1),KIND_COLORS[k], '#b8a07c');
        drawGlyph(ctx,kind,px,py,cell);
      }
    }
    this.rackRects=[];
    if(assemble){
      const remaining= this.state.rack;const cols=5;
      const s=Math.min(cell*.82,(w-42)/5-5,(h-y-size-23)/2-5);
      const rackY=y+size+19;
      for(let i=0;i<10;i++){
        const px=(w-(5*s+4*5))/2+(i%cols)*(s+5),py=rackY+Math.floor(i/cols)*(s+5);
        const piece=remaining[i];this.rackRects.push({x:px,y:py,size:s,id:piece});
        fillRound(ctx,px,py,s,s,4,piece==null?'#203047':piece===this.state.selected?'#4bdac5':'#a68a62',piece===this.state.selected?'#fff4db':'#79694f');
        if(piece!=null){ctx.fillStyle='#14243a';ctx.font=`${Math.max(10,s*.24)}px system-ui`;ctx.fillText(String(piece),px+s*.15,py+s*.63);}
      }
    }
    ctx.fillStyle='#f7e5c1';ctx.font='600 12px system-ui';ctx.fillText(assemble?'ASSEMBLE • 5 × 5 • 10-SLOT RACK':'PLANAR • 6 × 6 • SIX KINDS',20,h-16);
    ctx.fillStyle='#bddbd6';ctx.textAlign='right';ctx.fillText('2D FALLBACK',w-20,h-16);ctx.textAlign='left';
  }
  pick(event) {
    if(this.state?.family!=='assemble')return;
    const r=this.canvas.getBoundingClientRect(),x=(event.clientX-r.left),y=(event.clientY-r.top),b=this.boardRect;
    if(x>=b.x&&x<b.x+b.size&&y>=b.y&&y<b.y+b.size){
      const col=Math.floor((x-b.x)/b.cell),row=Math.floor((y-b.y)/b.cell);this.onAction({type:'place',cell:row*5+col});return;
    }
    const rack=this.rackRects.find(t=>x>=t.x&&x<t.x+t.size&&y>=t.y&&y<t.y+t.size&&t.id!=null);
    if(rack)this.onAction({type:'select',pieceId:rack.id});
  }
  dispose(){this.resizeObserver?.disconnect();this.canvas.removeEventListener('pointerdown',this.handlePointer);this.canvas.remove();}
}
