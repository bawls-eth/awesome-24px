/* Original Angler pixel-art asset generator. Deterministic, no dependencies, no I/O.
   Evaluates to an object exposing build(group), catalog and manifest().
   Each group is four species; build returns [{path,content}] where content is a base64 PNG. */
(()=>{
const catalog=[
["minnow",32,.42,.22,"#91bbc5","#d5e3dc","#44697d","slender"],
["perch",32,.38,.47,"#b4ae61","#e7d69e","#485b48","bars"],
["sunfish",32,.33,.66,"#d7a95b","#f3d58d","#956241","disk"],
["bluegill",32,.34,.60,"#62a2a0","#cbbd86","#39536f","gill"],
["smelt",32,.41,.24,"#83b5c3","#e3e6df","#47748a","slender"],
["goby",32,.34,.42,"#a18f70","#d1bd99","#554b42","bottom"],
["tetra",32,.39,.27,"#4fc1ba","#e2aa6b","#356494","stripe"],
["guppy",32,.35,.28,"#dba36b","#abdbce","#8050a1","fancy"],
["trout",48,.41,.33,"#8eaa90","#e9d4af","#536c65","spots"],
["bass",48,.42,.43,"#82997a","#dfd0aa","#456348","stripe"],
["carp",48,.40,.52,"#c29c67","#f4d5a0","#80613f","scales"],
["catfish",48,.43,.40,"#708b93","#c3b4ab","#344d5c","whiskers"],
["pike",48,.46,.25,"#78946b","#d5d5a7","#53664b","long"],
["char",48,.41,.34,"#5d8798","#d4ad9b","#344f72","spots"],
["mackerel",48,.44,.30,"#5b91af","#dce9e7","#27516a","zigzag"],
["sea_bream",48,.36,.60,"#c7999a","#ebd2bf","#806274","disk"],
["salmon",64,.43,.34,"#a29b9c","#eac8bc","#646578","spots"],
["sturgeon",64,.45,.31,"#748d90","#c5baa5","#465765","armor"],
["eel",64,.49,.18,"#7b967a","#c2c6a8","#455c56","eel"],
["koi",64,.39,.49,"#e6d2b3","#f5ecdb","#ce7150","koi"],
["ice_cod",64,.42,.42,"#87b9c6","#e3f3ef","#517c98","ice"],
["lanternfish",48,.41,.42,"#406680","#80abb1","#26425b","lantern"],
["mangrove_snapper",48,.43,.46,"#ba766d","#e5b99a","#743c57","stripe"],
["moonfish",64,.32,.70,"#99b8db","#e4e9e3","#5975ad","moon"]
];
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),mix=(a,b,t)=>a.map((v,i)=>Math.round(v*(1-t)+b[i]*t));
const pal=s=>[[0,0,0],hex("#1b2140"),hex(s[4]),hex(s[5]),mix(hex(s[4]),[255,244,210],.4),hex(s[6]),mix(hex(s[6]),hex("#1b2140"),.28),[255,244,210],[240,193,106]];
const mk=(w,h)=>({w,h,p:new Uint8Array(w*h)});
function put(a,x,y,c){x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<a.w&&y<a.h)a.p[y*a.w+x]=c}
function ell(a,x,y,rx,ry,c){for(let j=Math.max(0,Math.floor(y-ry));j<Math.min(a.h,Math.ceil(y+ry)+1);j++)for(let i=Math.max(0,Math.floor(x-rx));i<Math.min(a.w,Math.ceil(x+rx)+1);i++)if(((i-x)/rx)**2+((j-y)/ry)**2<=1)put(a,i,j,c)}
function polygon(a,v,c){for(let y=Math.max(0,Math.floor(Math.min(...v.map(z=>z[1]))));y<Math.min(a.h,Math.ceil(Math.max(...v.map(z=>z[1])))+1);y++)for(let x=0;x<a.w;x++){let ins=false;for(let i=0,j=v.length-1;i<v.length;j=i++){let p=v[i],q=v[j];if((p[1]>y)!==(q[1]>y)&&x<(q[0]-p[0])*(y-p[1])/(q[1]-p[1])+p[0])ins=!ins}if(ins)put(a,x,y,c)}}
function line(a,x0,y0,x1,y1,c){let n=Math.max(1,Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0))));for(let i=0;i<=n;i++)put(a,x0+(x1-x0)*i/n,y0+(y1-y0)*i/n,c)}
function fish(a,s,f,act){
let [id,n,L,R,b,v,acc,kind]=s,w=a.w,h=a.h,cx=w*.52,cy=h*.5,rx=w*L*.87,ry=h*R*.56,off=act==="flop"?[-ry*.33,ry*.08,ry*.4][f%3]:[0,-.5,0,.5][f%4],y=cy+off,tw=(act==="flop"?[-1,0,1][f%3]:[-1,0,1,0][f%4])*ry*.42;
polygon(a,[[cx-rx*.8,y],[cx-rx*1.58,y-ry*.82+tw],[cx-rx*1.38,y],[cx-rx*1.58,y+ry*.82+tw]],1);
polygon(a,[[cx-rx*.85,y],[cx-rx*1.48,y-ry*.57+tw],[cx-rx*1.32,y],[cx-rx*1.48,y+ry*.57+tw]],5);
if(["fancy","koi"].includes(kind))ell(a,cx-rx*1.4,y,rx*.27,ry*.66,5);
let dh=kind==="disk"||kind==="moon"?1.42:kind==="armor"?.72:1;
polygon(a,[[cx-rx*.52,y-ry*.52],[cx-rx*.13,y-ry*dh],[cx+rx*.32,y-ry*.71]],1);
polygon(a,[[cx-rx*.43,y-ry*.55],[cx-rx*.12,y-ry*(dh-.15)],[cx+rx*.15,y-ry*.65]],5);
polygon(a,[[cx-rx*.22,y+ry*.65],[cx,y+ry*1.25],[cx+rx*.44,y+ry*.65]],1);
ell(a,cx,y,rx+1,ry+1,1);ell(a,cx,y,rx,ry,2);
ell(a,cx+rx*.10,y+ry*.26,rx*.79,ry*.63,3);
ell(a,cx-rx*.14,y-ry*.40,rx*.69,ry*.18,4);
if(["eel","long","armor"].includes(kind))polygon(a,[[cx+rx*.73,y-ry*.28],[cx+rx*1.26,y-ry*.04],[cx+rx*.82,y+ry*.23]],2);
if(["bars","armor","scales"].includes(kind)){
 for(let j=0;j<5;j++){let x=cx-rx*.65+j*rx*.27;
 if(kind==="scales")for(let k=0;k<4;k++)put(a,x+(k%2)*rx*.06,y-ry*.52+k*ry*.34,5);
 else if(kind==="armor"){polygon(a,[[x,y-ry*.5],[x+2,y-ry*.38],[x+2,y+ry*.35],[x,y+ry*.46]],5)}
 else line(a,x,y-ry*.6,x+rx*.07,y+ry*.43,5)}
}
if(["spots","koi","ice"].includes(kind)){for(let j=0;j<13;j++){let xx=cx-rx*.70+((j*7)%17)/17*rx*1.42,yy=y-ry*.56+((j*11)%19)/19*ry*1.05;if(((xx-cx)/rx)**2+((yy-y)/ry)**2<.72)ell(a,xx,yy,Math.max(.6,rx*.04),Math.max(.6,ry*.07),kind==="ice"?7:5)}}
if(["stripe","zigzag"].includes(kind)){let prev=null;for(let j=0;j<7;j++){let xx=cx-rx*.63+j*rx*.22,yy=y-ry*.13+(kind==="zigzag"?(j%2?ry*.18:-ry*.18):0);if(prev)line(a,prev[0],prev[1],xx,yy,5);prev=[xx,yy]}}
if(kind==="gill"){ell(a,cx+rx*.1,y,rx*.20,ry*.32,5);line(a,cx+rx*.2,y-ry*.25,cx+rx*.18,y+ry*.4,1)}
if(kind==="moon")ell(a,cx-rx*.28,y-ry*.14,rx*.26,ry*.28,7);
if(kind==="lantern"){line(a,cx+rx*.20,y-ry*.70,cx+rx*.35,y-ry*1.25,1);ell(a,cx+rx*.35,y-ry*1.25,Math.max(1,rx*.10),Math.max(1,ry*.16),8)}
if(kind==="whiskers")for(let j=-1;j<=1;j++)line(a,cx+rx*.85,y+ry*.15,cx+rx*1.35,y+ry*(.17+j*.42),1);
if(kind==="bottom")ell(a,cx-rx*.20,y+ry*.81,rx*.22,ry*.23,6);
ell(a,cx+rx*.63,y-ry*.20,Math.max(1.4,rx*.14),Math.max(1.4,ry*.20),1);
ell(a,cx+rx*.63,y-ry*.20,Math.max(1,rx*.08),Math.max(1,ry*.13),7);
put(a,cx+rx*.65,y-ry*.20,1);line(a,cx+rx*.89,y+ry*.18,cx+rx*1.02,y+ry*.18,1);
}
function sprite(s,act){const n=s[1],count=act==="swim"?4:3,a=mk(n*count,n);for(let f=0;f<count;f++){let z=mk(n,n);fish(z,s,f,act);for(let y=0;y<n;y++)a.p.set(z.p.subarray(y*n,(y+1)*n),y*a.w+f*n)}return a}
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const ct=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function chunk(tag,data){let t=[...tag].map(c=>c.charCodeAt(0)),z=[...t,...data],crc=0xffffffff;for(let b of z)crc=ct[(crc^b)&255]^(crc>>>8);return [...u32(data.length),...z,...u32((crc^0xffffffff)>>>0)]}
function png(a,s,scale){let W=a.w*scale,H=a.h*scale,bytes=Math.ceil(W/2),raw=new Uint8Array((bytes+1)*H);
for(let y=0;y<H;y++){let o=y*(bytes+1);for(let x=0;x<W;x++){let p=a.p[Math.floor(y/scale)*a.w+Math.floor(x/scale)]&15;raw[o+1+(x>>1)]|=(x&1)?p:p<<4}}
let z=[0x78,0x01],ad=1,bd=0;for(let u of raw){ad=(ad+u)%65521;bd=(bd+ad)%65521}
for(let i=0;i<raw.length;i+=65535){let n=Math.min(65535,raw.length-i);z.push(i+n===raw.length?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255);for(let j=i;j<i+n;j++)z.push(raw[j])}
z.push(bd>>>8,bd&255,ad>>>8,ad&255);
let all=[137,80,78,71,13,10,26,10,...chunk("IHDR",[...u32(W),...u32(H),4,3,0,0,0]),...chunk("PLTE",pal(s).flat()),...chunk("tRNS",pal(s).map((_,i)=>i?255:0)),...chunk("IDAT",z),...chunk("IEND",[])];
let abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",out=[];
for(let i=0;i<all.length;i+=3){let A=all[i],B=all[i+1]||0,C=all[i+2]||0;out.push(abc[A>>2]+abc[((A&3)<<4)|(B>>4)]+(i+1<all.length?abc[((B&15)<<2)|(C>>6)]:"=")+(i+2<all.length?abc[C&63]:"="))}
return out.join("")
}
function build(g){const files=[];for(const s of catalog.slice(g*4,(g+1)*4)){const [id,n]=s,dir="game/assets/arcane/m02-angler-fish/fish/"+id+"/";for(const a of ["swim","flop"])files.push({path:dir+"fish_"+id+"_"+a+"_right.png",content:png(sprite(s,a),s,4)});let im=mk(32,32),ss=[...s];ss[2]=Math.min(.43,s[2]*.95);fish(im,ss,0,"swim");files.push({path:dir+"fish_"+id+"_icon.png",content:png(im,s,1)})}return files}
return {catalog,build}
})()