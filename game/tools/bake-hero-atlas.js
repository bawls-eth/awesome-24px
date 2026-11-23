// Bakes the Town hero atlas: game/assets/arcane/town-heroes-atlas.png, one ~60 KB PNG instead of 60 full-size hero strips (~650 KB).
// Rows = MMTownHeroes.HEROES order (10), columns = MMTownHeroes.frameLayout() (idle/walk x down/up/right), 24 px cells, made with the
// SAME downsample() the browser used to run at load (so the Town looks identical). Re-run after any hero strip changes:
//   python3 -m http.server 8440 &   BASE=http://localhost:8440 NODE_PATH=$(npm root -g) node game/tools/bake-hero-atlas.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const BASE = (process.env.BASE || 'http://localhost:8440').replace(/\/$/, '');
const OUT = path.join(__dirname, '..', 'assets', 'arcane', 'town-heroes-atlas.png');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE + '/game/manifest.json');
  await page.addScriptTag({ url: BASE + '/game/shared/mm-town-heroes.js' });
  const dataUrl = await page.evaluate(async () => {
    const H = window.MMTownHeroes;
    const layout = H.frameLayout();
    const S = H.SIZE;
    const atlas = document.createElement('canvas');
    atlas.width = S * layout.length; atlas.height = S * H.HEROES.length;
    const actx = atlas.getContext('2d');
    const load = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(url)); im.src = url; });
    const scratch = document.createElement('canvas');
    const sctx = scratch.getContext('2d', { willReadFrequently: true });
    const cache = {};
    for (let row = 0; row < H.HEROES.length; row++) {
      const cls = H.HEROES[row].cls;
      for (let idx = 0; idx < layout.length; idx++) {
        const f = layout[idx];
        const url = '/game/' + H.stripUrl(cls, f.action, f.dir);
        if (!cache[url]) {
          const im = await load(url);
          scratch.width = im.width; scratch.height = im.height;
          sctx.clearRect(0, 0, im.width, im.height); sctx.drawImage(im, 0, 0);
          cache[url] = { data: sctx.getImageData(0, 0, im.width, im.height).data, w: im.width, h: im.height };
        }
        const src = cache[url];
        const cells = Math.max(1, Math.floor(src.w / 256));
        const px = H.downsample(src.data, src.w, src.h, (f.i % cells) * 256 + H.CROP_X, H.CROP_Y, S, H.FACTOR);
        actx.putImageData(new ImageData(px, S, S), idx * S, row * S);
      }
    }
    return atlas.toDataURL('image/png');
  });
  fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
  // Chrome's PNG is ~270 KB (the box filter makes ~40k colours); a 256-colour palette (no dither, alpha kept exact) is ~60 KB and
  // differs by ~1 level per channel on average. Needs python3 + Pillow; without it the RGBA file is kept.
  const py = 'from PIL import Image\nimport sys\nim=Image.open(sys.argv[1]).convert("RGBA")\n'
    + 'im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(sys.argv[1], optimize=True)\n';
  const r = require('child_process').spawnSync('python3', ['-I', '-c', py, OUT], { stdio: 'inherit' });
  if (r.status !== 0) console.log('palette step skipped (python3 + Pillow missing): RGBA atlas kept');
  console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
  await browser.close();
})();
