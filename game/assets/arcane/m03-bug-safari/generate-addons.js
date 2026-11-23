/* Original Bug Safari UI and 9 arena thumbnails. Evaluates to { build, arenas }. */
((G)=>{
const arenas=["meadow","orchard","pond_edge","forest","dunes","cliffs","marsh","lantern_glade","night_glade"];
const themes=[["#477e58","#8bc275"],["#59784a","#afce6e"],["#53887d","#67b3bc"],["#294d4b","#3c8159"],["#b68e62","#d3bd8d"],["#747b83","#b7c0b8"],["#466456","#759b86"],["#243f52","#547b69"],["#222e4f","#52667f"]];
const mk=G.mk;
function dot(a,x,y,c){x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<a.w&&y<a.h)a.p[y*a.w+x]=c}
function ln(a,x,y,X,Y,c){let n=Math.max(1,Math.ceil(Math.max(Math.abs(X-x),Math.abs(Y-y))));for(let t=0;t<=n;t++)dot(a,x+(X-x)*t/n,y+(Y-y)*t/n,c)}
function circle(a,x,y,r,c){for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++)if(i*i+j*j<=r*r)dot(a,x+i,y+j,c)}
function icon(type,frame=0){let a=mk(32,32);
if(type==="net"||type==="swing"){let dx=type==="swing"?[-3,0,2,0][frame]:0;ln(a,11+dx,27,19+dx,14,1);ln(a,12+dx,27,20+dx,14,3);circle(a,20+dx,11,7,1);circle(a,20+dx,11,5,4);circle(a,20+dx,11,4,0);for(let i=-3;i<=3;i+=2){ln(a,20+dx+i,7,20+dx+i,15,5);ln(a,16+dx,11+i,24+dx,11+i,5)}}
else {let full=type==="full";for(let y=7;y<27;y++)for(let x=9;x<=23;x++)if(x===9||x===23||y===26)dot(a,x,y,1);for(let x=10;x<23;x++)for(let y=full?17:24;y<26;y++)dot(a,x,y,full?7:3);for(let x=11;x<=21;x++)for(let y=5;y<=8;y++)dot(a,x,y,y===5?1:5);for(let x=12;x<=20;x++)dot(a,x,13,6);if(full){circle(a,16,20,4,2);circle(a,15,19,2,4)}}return a}
function build(i){const files=[];for(let k=i*5;k<Math.min((i+1)*5,13);k++){let file,im,palette;
if(k<4){const [name,type,count]=[["ui_bug_net","net",1],["ui_bug_net_swing","swing",4],["ui_bug_jar_empty","empty",1],["ui_bug_jar_full","full",1]][k];if(count===1)im=icon(type);else{im=mk(32*count,32);for(let f=0;f<count;f++){let a=icon(type,f);for(let y=0;y<32;y++)im.p.set(a.p.subarray(y*32,(y+1)*32),y*im.w+32*f)}}file="ui/"+name+".png";palette=["ui","#7599b1","#d6d5aa","beetle"];
}else{let q=k-4;file="arenas/bug_arena_"+arenas[q]+".png";im=mk(96,64);let night=q>=7,water=q===2||q===6;for(let y=0;y<64;y++)for(let x=0;x<96;x++)dot(im,x,y,y<25?(night?1:3):y<38?2:5);
for(let j=0;j<26;j++){let x=(j*37+q*13)%96,y=39+(j*11%24);dot(im,x,y,j%3===0?7:4)}
if(water)for(let y=43;y<60;y++)for(let x=12;x<85;x++)if((x+y*2+q*9)%17<13)dot(im,x,y,3);
if([1,3,7,8].includes(q))for(let tx of [17,70]){ln(im,tx,39,tx,16,1);circle(im,tx,14,q===3?10:8,night?5:2);circle(im,tx-3,11,3,4)}
if(q===4)for(let x=4;x<93;x++)for(let y=40;y<64;y++)if(y>49+Math.sin(x/11)*5)dot(im,x,y,4);
if(q===5)for(let x=9;x<86;x+=20){ln(im,x,42,x+10,29,1);ln(im,x+10,29,x+19,43,1)}
if(night)for(let j=0;j<12;j++)circle(im,(j*23+11)%96,5+j*13%31,1,7);
palette=["arena",...themes[q],"beetle"];
}files.push({path:"game/assets/arcane/m03-bug-safari/"+file,content:G.png(im,palette,k===1?4:1)})}return files}
return {build,arenas,themes};
})