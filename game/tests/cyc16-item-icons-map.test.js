// MMItemIcons (the Town's item-art loader, no enemy art) must resolve exactly like MMArt.loadItems: same ITEM_ICON_MAP. Node only.
const { check, done } = require('./helpers');
const MMArt = require('../shared/mm-art.js'); const Icons = require('../shared/mm-item-icons.js');
const a = JSON.stringify(Object.entries(MMArt.ITEM_ICON_MAP).sort()); const b = JSON.stringify(Object.entries(Icons.ITEM_ICON_MAP).sort());
check('MMItemIcons.ITEM_ICON_MAP equals MMArt.ITEM_ICON_MAP', a === b, a === b ? '' : a + ' vs ' + b);
const set = new Icons.ItemSet(); set.byId.wand_spark = { url: 'x/wand_spark.png', tags: [] };
check('iconUrl maps a game item id through the table; unknown and non-string give null', (() => { try { return set.iconUrl('sparkwand') === 'x/wand_spark.png' && set.iconUrl('nope') === null && set.iconUrl(5) === null; } catch (e) { return false; } })());
done();
