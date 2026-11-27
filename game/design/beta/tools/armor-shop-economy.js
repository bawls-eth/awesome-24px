const path=require('path').join(__dirname,'..','..','..','shared')+'/'; // D cycle 16: tier-1 armour in the Realm shop vs drops and shard income (shared modules only, no browser). Run: node game/design/beta/tools/armor-shop-economy.js
const Z=require(path+'mm-zones.js'),GD=require(path+'mm-gear-drops.js'),G=require(path+'mm-gear.js'),RNG=require(path+'rng.js');
const N=40000, T=Z.TABLES;
for (const cls of ['ranger','warlock','paladin']) {
 for (const zone of [0,1]) {
  const c={t1arm:0,t1armR:[0,0,0,0],armAny:0,gear:0,shards:0,bags:0,t3arm:0};
  for (let i=0;i<N;i++){
   const tierIdx=[0,0,0,0,0,0,0,1,1,2][i%10];
   const sm=T.ZONE_MUL.shard[zone]*T.TIER_MUL.shard[tierIdx];
   const info={zone,tier:tierIdx,shardMul:sm};
   if (RNG.create('dc:'+zone+':'+i).next()>=Z.dropChance(info)) continue;
   const bag=Z.rollDrop(info,'s'+zone+i).bag; c.bags++; c.shards+=bag.shards;
   bag.items.forEach((it,k)=>{const g=GD.rollGear({src:'mob',zone,r:it.r,bagTier:bag.tierIndex,k,cls},'g'+zone+i+':'+k); if(!g)return; c.gear++;
     if(g.id.indexOf('arm_')===0){c.armAny++; const fam=G.armorFamilyOf(cls); if(g.id===G.armorId(fam,1)&&g.t===1){c.t1arm++;c.t1armR[g.r]++;}
       if(g.id===G.armorId(fam,3)&&g.t<=4)c.t3arm++; }});
  }
  console.log(cls,G.armorFamilyOf(cls),'zone',zone,'shards/kill',(c.shards/N).toFixed(3),'gear/kill',(c.gear/N).toFixed(4),'armour/kill',(c.armAny/N).toFixed(4),'own T1 armour/kill',(c.t1arm/N).toFixed(5),'byRarity',c.t1armR.join('/'),'-> kills per own T1 drop',c.t1arm?Math.round(N/c.t1arm):'inf','own band2 armour/kill',(c.t3arm/N).toFixed(5));
 }}
console.log('stats T1 per fam/rarity');
for (const f of ['light','robe','heavy']) for (const r of [0,1,2]) { const s=G.armorStats(G.armorId(f,1),1,r); console.log(f,r,'hp',s.hp,'grd',s.guard,'spd',s.speed); }
console.log('T3 common',['light','robe','heavy'].map(f=>JSON.stringify(G.armorStats(G.armorId(f,3),3,0))).join(' '));
