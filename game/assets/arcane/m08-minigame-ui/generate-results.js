/* Original M08 pixel-art result UI sprites. Pure JS, no DOM or external assets.
   evaluate this source to obtain build() -> [{path,base64,w,h,frames}]. */
(()=>{
const C=["#000000","#20273e","#495671","#e6d9b7","#f6c765","#b3763b","#faede1","#85c6d4","#71bd89","#ba829f","#7976bc","#cf695d","#f3a14f","#a4a7b8","#f5e3a2","#365c68"];
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),pal=C.map(rgb);
const make=(w,h)=>({w,h,p:new Uint8Array(w*h)});
function dot(a,x,y,c){x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<a.w&&y<a.h)a.p[y*a.w+x]=c}
function rect(a,x,y,w,h,c){for(let j=Math.max(0,y);j<Math.min(a.h,y+h);j++)for(let i=Math.max(0,x);i<Math.min(a.w,x+w);i++)dot(a,i,j,c)}
function line(a,x,y,x2,y2,c){let n=Math.max(1,Math.max(Math.abs(x2-x),Math.abs(y2-y)));for(let j=0;j<=n;j++)dot(a,x+(x2-x)*j/n,y+(y2-y)*j/n,c)}
function ellipse(a,cx,cy,rx,ry,c){for(let j=Math.max(0,Math.floor(cy-ry));j<=Math.min(a.h-1,Math.ceil(cy+ry));j++)for(let i=Math.max(0,Math.floor(cx-rx));i<=Math.min(a.w-1,Math.ceil(cx+rx));i++)if(((i-cx)/rx)**2+((j-cy)/ry)**2<=1)dot(a,i,j,c)}
function poly(a,pts,c){let l=Math.floor(Math.min(...pts.map(p=>p[1]))),u=Math.ceil(Math.max(...pts.map(p=>p[1])));for(let y=Math.max(0,l);y<=Math.min(a.h-1,u);y++)for(let x=0;x<a.w;x++){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){let p=pts[i],q=pts[j];if((p[1]>y)!==(q[1]>y)&&x<(q[0]-p[0])*(y-p[1])/(q[1]-p[1])+p[0])inside=!inside}if(inside)dot(a,x,y,c)}}
function star(a,x,y,r,fill,outline=1){let v=[];for(let i=0;i<10;i++){let angle=-Math.PI/2+i*Math.PI/5,rad=i%2?r*.48:r;v.push([x+Math.cos(angle)*rad,y+Math.sin(angle)*rad])}poly(a,v,outline);let s=v.map(p=>[x+(p[0]-x)*.77,y+(p[1]-y)*.77]);poly(a,s,fill);dot(a,x-2,y-3,6)}
function trophy(id){
 let a=make(32,32);let shade=({angler:7,jam:9,bugs:8,stalk:4,deepdelve:10,pop:11,dash:12,isles:14})[id];
 // dark outlined two-handle cup, symmetrical stand with top-left highlights
 rect(a,5,7,22,2,1);rect(a,5,9,4,11,1);rect(a,23,9,4,11,1);rect(a,6,18,5,3,1);rect(a,21,18,5,3,1);
 rect(a,7,10,4,8,shade);rect(a,21,10,4,8,shade);rect(a,9,8,14,14,1);
 rect(a,10,9,12,11,shade);rect(a,11,10,3,8,6);rect(a,18,10,3,9,5);
 rect(a,11,20,10,3,1);rect(a,12,20,8,2,shade);
 rect(a,14,23,4,4,1);rect(a,15,23,2,4,13);
 rect(a,10,27,12,2,1);rect(a,11,28,10,1,shade);
 // distinct theme emblem in centre, held inside cup
 if(id==="angler"){ // hook + little fish
   line(a,15,11,15,16,1);line(a,15,16,18,17,1);line(a,18,17,19,15,1);dot(a,18,14,6);
 }else if(id==="jam"){line(a,16,11,16,17,1);line(a,16,11,19,12,1);ellipse(a,14,18,2,2,6);dot(a,16,11,6)}
 else if(id==="bugs"){ellipse(a,16,15,2.8,3.6,1);dot(a,16,12,6);line(a,13,14,11,12,1);line(a,19,14,21,12,1);dot(a,15,14,6);dot(a,17,14,6)}
 else if(id==="stalk"){ellipse(a,16,17,3.2,3.2,6);line(a,16,14,15,11,1);line(a,16,13,19,12,8);dot(a,15,16,4)}
 else if(id==="deepdelve"){poly(a,[[16,10],[20,15],[16,20],[12,15]],1);poly(a,[[16,12],[18,15],[16,18],[14,15]],7);line(a,16,12,16,18,6)}
 else if(id==="pop"){star(a,16,15,4.5,6);dot(a,20,11,6)}
 else if(id==="dash"){line(a,12,19,19,12,1);line(a,16,12,20,12,1);dot(a,12,18,6);dot(a,20,13,6)}
 else if(id==="isles"){poly(a,[[12,17],[14,13],[17,12],[20,15],[19,18],[16,19]],1);rect(a,14,14,4,3,8);dot(a,16,12,6)}
 return a;
}
const FONT={
"N":["101","111","111","111","101"],"E":["111","100","110","100","111"],
"W":["101","101","111","111","101"],"B":["110","101","110","101","110"],
"S":["011","100","010","001","110"],"T":["111","010","010","010","010"],
};
function glyph(a,chr,x,y,c){let g=FONT[chr];if(!g)return;for(let j=0;j<5;j++)for(let i=0;i<3;i++)if(g[j][i]==="1")dot(a,x+i,y+j,c)}
function text(a,s,x,y,c){for(let i=0;i<s.length;i++)glyph(a,s[i],x+4*i,y,c)}
function smallStar(full){let a=make(16,16);star(a,8,8,6.8,full?4:2);if(!full){star(a,8,8,4,0)}return a}
function ribbon(){let a=make(48,16);
 poly(a,[[1,2],[9,2],[13,0],[35,0],[39,2],[47,2],[43,8],[47,14],[38,14],[35,15],[13,15],[10,14],[1,14],[5,8]],1);
 poly(a,[[3,4],[9,4],[14,2],[34,2],[39,4],[45,4],[41,8],[45,12],[38,12],[34,13],[14,13],[10,12],[3,12],[7,8]],10);
 rect(a,10,4,28,9,1);rect(a,11,4,26,7,11);line(a,11,4,36,4,6);text(a,"NEW",14,5,6);text(a,"BEST",22,5,4);
 return a}
function panel(){let a=make(48,48);
 rect(a,1,1,46,46,1);rect(a,3,3,42,42,2);rect(a,5,5,38,38,0);
 for(let x=8;x<40;x++){dot(a,x,3,13);dot(a,x,44,13)}
 for(let y=8;y<40;y++){dot(a,3,y,13);dot(a,44,y,13)}
 for(let k=0;k<4;k++){let x=k%2?42:5,y=k<2?5:42;rect(a,x-2,y-2,5,5,1);rect(a,x-1,y-1,3,3,4);dot(a,x,y,6)}
 for(let y=9;y<39;y+=4){dot(a,6,y,3);dot(a,41,y,3)}
 return a}
function rand(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function confetti(){const a=make(32*6,32),r=rand(20261123);
 for(let frame=0;frame<6;frame++){
 for(let j=0;j<18;j++){let x=frame*32+Math.floor((j*23+Math.floor(r()*9)+frame*(j%3-1))%30)+1,y=Math.floor((j*17+frame*6+j%5)%29)+1;
 let color=[4,7,8,9,10,11,12,14][j%8],w=j%3===0?3:2,h=j%2===0?2:3;
 rect(a,x,y,w,h,color);if(j%4===0)dot(a,x,y,6)}
 }
 return a}
const uint32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const ct=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function chunk(tag,data){let t=[...tag].map(c=>c.charCodeAt(0)),z=[...t,...data],crc=0xffffffff;for(let b of z)crc=ct[(crc^b)&255]^(crc>>>8);return [...uint32(data.length),...z,...uint32((crc^0xffffffff)>>>0)]}
function png(a,scale=1){let W=a.w*scale,H=a.h*scale,bytes=Math.ceil(W/2),raw=new Uint8Array((bytes+1)*H);
for(let y=0;y<H;y++){let o=y*(bytes+1);for(let x=0;x<W;x++){let p=a.p[Math.floor(y/scale)*a.w+Math.floor(x/scale)]&15;raw[o+1+(x>>1)]|=(x&1)?p:p<<4}}
let z=[0x78,0x01],ad=1,bd=0;for(let u of raw){ad=(ad+u)%65521;bd=(bd+ad)%65521}
for(let i=0;i<raw.length;i+=65535){let n=Math.min(65535,raw.length-i);z.push(i+n===raw.length?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255);for(let j=i;j<i+n;j++)z.push(raw[j])}
z.push(bd>>>8,bd&255,ad>>>8,ad&255);
let all=[137,80,78,71,13,10,26,10,...chunk("IHDR",[...uint32(W),...uint32(H),4,3,0,0,0]),...chunk("PLTE",pal.flat()),...chunk("tRNS",pal.map((_,i)=>i?255:0)),...chunk("IDAT",z),...chunk("IEND",[])];
let abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",out=[];
for(let i=0;i<all.length;i+=3){let A=all[i],B=all[i+1]||0,D=all[i+2]||0;out.push(abc[A>>2]+abc[((A&3)<<4)|(B>>4)]+(i+1<all.length?abc[((B&15)<<2)|(D>>6)]:"=")+(i+2<all.length?abc[D&63]:"="))}
return out.join("")
}
const names=["angler","jam","bugs","stalk","deepdelve","pop","dash","isles"];
function build(){let out=names.map(n=>({id:"trophy_"+n,w:32,h:32,frames:1,base64:png(trophy(n))}));
out.push({id:"ui_star_full",w:16,h:16,frames:1,base64:png(smallStar(true))});
out.push({id:"ui_star_empty",w:16,h:16,frames:1,base64:png(smallStar(false))});
out.push({id:"ui_new_best",w:48,h:16,frames:1,base64:png(ribbon())});
out.push({id:"ui_result_panel",w:48,h:48,frames:1,base64:png(panel())});
out.push({id:"ui_confetti",w:128,h:128,frames:6,base64:png(confetti(),4)});
return out}
return {build,C,make,put:dot,rect,ellipse,text,trophy,smallStar,ribbon,panel,confetti,png,names}
})()