// RulesCheck: a tiny, auth-free evaluator for the .validate subset used by game/firebase-rules.draft.json.
// RulesCheck.check(rulesJson, 'players/abc', value) -> { ok, reason }.
// Supported: newData.isString/isNumber/isBoolean/hasChildren([..])/hasChild/exists/val(), string .length and
// .matches(/re/), comparisons, && || !, now, $wildcard variables (including $other). No auth, no data, no root.
// Not modelled: .read/.write, .indexOn, and the .validate of ancestors of the written path (except a literal `false`),
// because those depend on data already stored. To test a parent's required children, check the whole parent value.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RulesCheck = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function wrap(v) {
    const isObj = v !== null && typeof v === 'object';
    return {
      val: () => v,
      exists: () => v !== null && v !== undefined,
      isString: () => typeof v === 'string',
      isNumber: () => typeof v === 'number' && isFinite(v),
      isBoolean: () => typeof v === 'boolean',
      hasChildren: (names) => isObj && (!names || names.every((n) => v[n] !== null && v[n] !== undefined)) && (names ? true : Object.keys(v).length > 0),
      hasChild: (n) => isObj && v[n] !== null && v[n] !== undefined,
    };
  }

  const cache = new Map();
  function compile(expr, names) {
    const key = names.join(',') + '|' + expr;
    let fn = cache.get(key);
    if (!fn) { fn = new Function(...names, 'newData', 'now', '"use strict"; return (' + expr + ');'); cache.set(key, fn); } // eslint-disable-line no-new-func
    return fn;
  }

  function evalExpr(expr, value, vars, now) {
    if (expr === true || expr === false) return expr;
    const names = Object.keys(vars);
    const had = Object.prototype.hasOwnProperty.call(String.prototype, 'matches');
    if (!had) Object.defineProperty(String.prototype, 'matches', { value(re) { return re.test(this); }, configurable: true, writable: true });
    try {
      return !!compile(String(expr), names)(...names.map((n) => vars[n]), wrap(value), now);
    } catch (e) { return false; } finally { if (!had) delete String.prototype.matches; }
  }

  function childRule(node, key) {
    if (!node || typeof node !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(node, key) && key[0] !== '.') return { rule: node[key], bind: null };
    const w = Object.keys(node).find((k) => k[0] === '$');
    return w ? { rule: node[w], bind: w } : null;
  }

  function validateNode(rule, value, vars, now, path) {
    if (value === null || value === undefined) return { ok: true };
    if (typeof value === 'object' && Object.keys(value).length === 0) return { ok: true }; // Firebase stores no empty arrays/objects
    if (rule && rule['.validate'] !== undefined && !evalExpr(rule['.validate'], value, vars, now)) return { ok: false, reason: 'validate failed at /' + path.join('/') };
    if (value !== null && typeof value === 'object') {
      for (const k of Object.keys(value)) {
        const c = childRule(rule, k);
        if (!c) continue; // no rule: allowed (the $other rule is what closes a node)
        const v2 = c.bind ? Object.assign({}, vars, { [c.bind]: k }) : vars;
        const r = validateNode(c.rule, value[k], v2, now, path.concat(k));
        if (!r.ok) return r;
      }
    }
    return { ok: true };
  }

  function check(rulesJson, path, value, opts) {
    const now = (opts && opts.now) || Date.now();
    let node = rulesJson && rulesJson.rules;
    const segs = String(path).split('/').filter(Boolean);
    let vars = {};
    for (let i = 0; i < segs.length; i++) {
      const c = childRule(node, segs[i]);
      if (!c) return { ok: true }; // below the last rule
      if (c.bind) vars = Object.assign({}, vars, { [c.bind]: segs[i] });
      node = c.rule;
      if (node && (node['.validate'] === false || node['.validate'] === 'false') && value !== null) return { ok: false, reason: 'blocked by validate:false at /' + segs.slice(0, i + 1).join('/') };
    }
    if (segs.length === 0) return validateNode(node, value, vars, now, []);
    return validateNode(node, value, vars, now, segs);
  }

  return { check, evalExpr };
}));
