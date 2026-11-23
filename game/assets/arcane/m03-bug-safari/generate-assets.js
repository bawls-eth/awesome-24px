/* M03 Bug Safari asset generator. Original opaque/transparent pixel art, no dependencies. */
(()=>{
const S=[
["ladybug","#d95859","#efb783","beetle"],["butterfly","#edbb72","#b27dde","wing"],["beetle","#65a67d","#b7d59e","beetle"],["cricket","#87ac69","#d7c789","legs"],["antlion","#ae906a","#e7c99b","antlion"],["goldbeetle","#e4bb55","#fff2b5","beetle"],["moonwing","#978bd2","#c7e0eb","wing"],["firefly","#7b9b6d","#ffdb65","firefly"],["glowmoth","#9dbcc8","#ebd8a6","wing"]
];
const H=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)),M=(a,b,t)=>a.map((v,i)=>Math.round(v*(1-t)+b[i]*t));
const P=s=>[[0,0,0],H("#1b2140"),H(s[1]),H(s[2]),M(H(s[1]),[255,255,234],.5),M(H(s[1]),[27,33,64],.4),[255,255,234],H("#ffd85d")];
const mk=(w,h)=>({w,h,p:new Uint8Array(w*h)});
function pt(a,x,y,c){x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<a.w&&y<a.h)a.p[y*a.w+x]=c}
function oval(a,x,y,rx,ry,c){for(let yy=Math.floor(y-ry);yy<=y+ry;yy++)for(let xx=Math.floor(x-rx);xx<=x+rx;xx++)if(((xx-x)/rx)**2+((yy-y)/ry)**2<=1)pt(a,xx,yy,c)}
function ln(a,x,y,X,Y,c){let n=Math.max(1,Math.ceil(Math.max(Math.abs(X-x),Math.abs(Y-y))));for(let j=0;j<=n;j++)pt(a,x+(X-x)*j/n,y+(Y-y)*j/n,c)}
function bug(a,s,frame,action){let cx=a.w/2,cy=a.h/2,kind=s[3],t=action==="move"?[-1,0,1,0][frame%4]:[0,1][frame%2],wing=kind==="wing";let dx=t*.75;
for(let j=-1;j<=1;j++)for(let side of [-1,1]){let y=cy+j*3,off=side*(8+Math.abs(j)*2);ln(a,cx+side*3,y,cx+off,y+(j*2)+t*(side>0?1:-1),1);ln(a,cx+off,y+(j*2)+t*(side>0?1:-1),cx+off+side*2,y+j*3,5)}
if(wing){for(let side of [-1,1]){oval(a,cx+side*(7+Math.abs(t)*1.3),cy-4,6,7+Math.abs(t),1);oval(a,cx+side*(7+Math.abs(t)*1.3),cy-4,5,6+Math.abs(t),2);oval(a,cx+side*6,cy+5,5,4,1);oval(a,cx+side*6,cy+5,4,3,3);oval(a,cx+side*8,cy-5,1.5,2.5,4);oval(a,cx+side*6,cy+5,1.3,1.3,6)}}
if(kind==="antlion"){for(let side of [-1,1]){ln(a,cx+side*3,cy-6,cx+side*7,cy-11,1);ln(a,cx+side*7,cy-11,cx+side*9,cy-13,3)}}
if(kind==="firefly"){oval(a,cx,cy+6,5,5,1);oval(a,cx,cy+6,4,4,7)}
oval(a,cx+dx,cy+2,kind==="antlion"?4.5:4,kind==="legs"?7:8,1);
oval(a,cx+dx,cy+2,kind==="antlion"?3.5:3,kind==="legs"?6:7,2);
if(!wing&&kind!=="antlion"){ln(a,cx,cy-4,cx,cy+9,5);for(let side of [-1,1])for(let j=0;j<2;j++)oval(a,cx+side*2.5,cy-1+j*5,1,1,kind==="beetle"?4:3)}
oval(a,cx,cy-7,3.8,3.5,1);oval(a,cx,cy-7,2.8,2.4,5);
ln(a,cx-2,cy-9,cx-5,cy-13,1);ln(a,cx+2,cy-9,cx+5,cy-13,1);
pt(a,cx-1,cy-8,6);pt(a,cx+1,cy-8,6);
}
const u=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const C=Array.from({length:256},(_,i)=>{let v=i;for(let j=0;j<8;j++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0});
function chunk(tag,data){let t=[...tag].map(c=>c.charCodeAt(0)),z=[...t,...data],cr=0xffffffff;for(let b of z)cr=C[(cr^b)&255]^(cr>>>8);return [...u(data.length),...z,...u((cr^0xffffffff)>>>0)]}
function png(a,s,scale){let W=a.w*scale,H=a.h*scale,row=Math.ceil(W/2),raw=new Uint8Array((row+1)*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let p=a.p[Math.floor(y/scale)*a.w+Math.floor(x/scale)]&15,k=y*(row+1)+1+(x>>1);raw[k]|=x&1?p:p<<4}
let z=[0x78,0x01],ad=1,bd=0;for(let v of raw){ad=(ad+v)%65521;bd=(bd+ad)%65521}
for(let i=0;i<raw.length;i+=65535){let n=Math.min(65535,raw.length-i);z.push(i+n===raw.length?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255);for(let j=i;j<i+n;j++)z.push(raw[j])}z.push(bd>>>8,bd&255,ad>>>8,ad&255);
let all=[137,80,78,71,13,10,26,10,...chunk("IHDR",[...u(W),...u(H),4,3,0,0,0]),...chunk("PLTE",P(s).flat()),...chunk("tRNS",P(s).map((_,i)=>i?255:0)),...chunk("IDAT",z),...chunk("IEND",[])],ab="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",o=[];for(let i=0;i<all.length;i+=3){let A=all[i],B=all[i+1]||0,D=all[i+2]||0;o.push(ab[A>>2]+ab[((A&3)<<4)|(B>>4)]+(i+1<all.length?ab[((B&15)<<2)|(D>>6)]:"=")+(i+2<all.length?ab[D&63]:"="))}return o.join("")}
function strip(s,act){let n=act==="idle"?2:4,a=mk(32*n,32);for(let j=0;j<n;j++){let cell=mk(32,32);bug(cell,s,j,act);for(let y=0;y<32;y++)a.p.set(cell.p.subarray(y*32,(y+1)*32),y*a.w+32*j)}return a}
function build(i){let out=[];for(const s of S.slice(i*3,(i+1)*3)){const id=s[0],dir="game/assets/arcane/m03-bug-safari/bugs/"+id+"/";for(let ac of ["idle","move"])out.push({path:dir+"bug_"+id+"_"+ac+".png",data:png(strip(s,ac),s,4)});let a=mk(32,32);bug(a,s,0,"idle");out.push({path:dir+"bug_"+id+"_icon.png",data:png(a,s,1)})}return out}
return {catalog:S,build,bug,mk,png};
})()