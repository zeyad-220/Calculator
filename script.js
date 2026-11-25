/* Calculator: safe expression engine + UI.
   The engine section is pure (no DOM) so it can be unit-tested in Node. */

(function (root) {
  'use strict';

  /* =====================================================
     ENGINE
     Tokens: numbers, + - * / ^ ( ) ! % , mod, pi, e, x and functions.
     ===================================================== */

  var FUNCS = ['asin', 'acos', 'atan', 'sin', 'cos', 'tan', 'ln', 'log', 'exp', 'abs',
               'nCr', 'nPr', 'gcd', 'lcm', '√', '∛'];

  function tokenize(input) {
    var tokens = [];
    var i = 0;
    while (i < input.length) {
      var ch = input[i];
      if (ch === ' ') { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        var num = '', dots = 0;
        while (i < input.length && /[0-9.]/.test(input[i])) {
          if (input[i] === '.') { dots++; if (dots > 1) throw new Error('bad number'); }
          num += input[i++];
        }
        if (num === '.') throw new Error('bad number');
        tokens.push({ t: 'num', v: parseFloat(num) });
        continue;
      }
      var matched = false;
      for (var f = 0; f < FUNCS.length; f++) {
        var name = FUNCS[f];
        if (input.substr(i, name.length + 1) === name + '(') {
          tokens.push({ t: 'func', v: name });
          tokens.push({ t: '(' });
          i += name.length + 1;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      if (input.substr(i, 3) === 'mod') { tokens.push({ t: 'mod' }); i += 3; continue; }
      if (ch === 'π') { tokens.push({ t: 'num', v: Math.PI }); i++; continue; }
      if (ch === 'e') { tokens.push({ t: 'num', v: Math.E }); i++; continue; }
      if (ch === 'x') { tokens.push({ t: 'var' }); i++; continue; }
      if ('+-*/^()!%,'.indexOf(ch) !== -1) { tokens.push({ t: ch }); i++; continue; }
      throw new Error('bad char');
    }
    return tokens;
  }

  /* ---- parser: tokens -> AST ---- */
  function parse(input) {
    var tokens = tokenize(input);
    var pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }

    function parseExpr() {
      var node = parseTerm();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        var op = next().t;
        var rhs = parseTerm();
        if (rhs.k === 'pct') {
          /* 200 + 10%  means 200 + 10% of 200 */
          rhs = { k: 'bin', op: '*', a: node, b: rhs };
        }
        node = { k: 'bin', op: op, a: node, b: rhs };
      }
      return node;
    }
    function parseTerm() {
      var node = parseUnary();
      while (peek()) {
        var t = peek().t;
        if (t === '*' || t === '/' || t === 'mod') {
          next();
          node = { k: 'bin', op: t, a: node, b: parseUnary() };
        } else if (t === 'num' || t === 'func' || t === '(' || t === 'var') {
          node = { k: 'bin', op: '*', a: node, b: parseUnary() }; /* implicit: 2π, 3(4+1), 2x */
        } else break;
      }
      return node;
    }
    function parseUnary() {
      if (peek() && peek().t === '-') { next(); return { k: 'neg', a: parseUnary() }; }
      if (peek() && peek().t === '+') { next(); return parseUnary(); }
      return parsePower();
    }
    function parsePower() {
      var base = parsePostfix();
      if (peek() && peek().t === '^') {
        next();
        return { k: 'bin', op: '^', a: base, b: parseUnary() }; /* right-associative */
      }
      return base;
    }
    function parsePostfix() {
      var node = parseAtom();
      while (peek() && (peek().t === '!' || peek().t === '%')) {
        node = { k: next().t === '!' ? 'fact' : 'pct', a: node };
      }
      return node;
    }
    function parseAtom() {
      var tok = next();
      if (!tok) throw new Error('unexpected end');
      if (tok.t === 'num') return { k: 'num', v: tok.v };
      if (tok.t === 'var') return { k: 'var' };
      if (tok.t === 'func') {
        next(); /* the "(" the tokenizer paired with the name */
        var args = [parseExpr()];
        while (peek() && peek().t === ',') { next(); args.push(parseExpr()); }
        var close = next();
        if (!close || close.t !== ')') throw new Error('expected )');
        return { k: 'fn', name: tok.v, args: args };
      }
      if (tok.t === '(') {
        var inner = parseExpr();
        var c = next();
        if (!c || c.t !== ')') throw new Error('expected )');
        return inner;
      }
      throw new Error('unexpected token');
    }

    var ast = parseExpr();
    if (pos !== tokens.length) throw new Error('trailing tokens');
    return ast;
  }

  function factorial(n) {
    if (n < 0 || Math.floor(n) !== n) throw new Error('bad factorial');
    if (n > 170) return Infinity;
    var r = 1;
    for (var k = 2; k <= n; k++) r *= k;
    return r;
  }
  function isInt(n) { return Math.floor(n) === n && isFinite(n); }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }
  function clean(v) { return Math.abs(v) < 1e-14 ? 0 : v; }

  function applyFunc(name, a, deg) {
    var x = a[0];
    var toRad = deg ? Math.PI / 180 : 1;
    var toAng = deg ? 180 / Math.PI : 1;
    if (a.length !== (name === 'nCr' || name === 'nPr' || name === 'gcd' || name === 'lcm' ? 2 : 1)) {
      throw new Error('wrong arguments');
    }
    switch (name) {
      case 'sin': return clean(Math.sin(x * toRad));
      case 'cos': return clean(Math.cos(x * toRad));
      case 'tan':
        var c = Math.cos(x * toRad);
        if (Math.abs(c) < 1e-12) throw new Error('tan undefined');
        return clean(Math.sin(x * toRad) / c);
      case 'asin': if (x < -1 || x > 1) throw new Error('bad asin'); return Math.asin(x) * toAng;
      case 'acos': if (x < -1 || x > 1) throw new Error('bad acos'); return Math.acos(x) * toAng;
      case 'atan': return Math.atan(x) * toAng;
      case 'ln': if (x <= 0) throw new Error('bad ln'); return Math.log(x);
      case 'log': if (x <= 0) throw new Error('bad log'); return Math.log10(x);
      case 'exp': return Math.exp(x);
      case 'abs': return Math.abs(x);
      case '√': if (x < 0) throw new Error('bad sqrt'); return Math.sqrt(x);
      case '∛': return Math.cbrt(x);
      case 'nCr':
      case 'nPr':
        var n = a[0], k = a[1];
        if (!isInt(n) || !isInt(k) || n < 0 || k < 0 || k > n) throw new Error('bad nCr');
        var r = 1;
        for (var i = 0; i < k; i++) r = r * (n - i);
        if (name === 'nCr') r = r / factorial(k);
        return Math.round(r);
      case 'gcd':
        if (!isInt(a[0]) || !isInt(a[1])) throw new Error('bad gcd');
        return gcd(a[0], a[1]);
      case 'lcm':
        if (!isInt(a[0]) || !isInt(a[1])) throw new Error('bad lcm');
        if (a[0] === 0 || a[1] === 0) return 0;
        return Math.abs(a[0] * a[1]) / gcd(a[0], a[1]);
    }
    throw new Error('unknown func');
  }

  function run(node, ctx) {
    switch (node.k) {
      case 'num': return node.v;
      case 'var':
        if (ctx.x === undefined) throw new Error('x undefined');
        return ctx.x;
      case 'neg': return -run(node.a, ctx);
      case 'pct': return run(node.a, ctx) / 100;
      case 'fact': return factorial(run(node.a, ctx));
      case 'fn': return applyFunc(node.name, node.args.map(function (n) { return run(n, ctx); }), ctx.deg);
      case 'bin':
        var l = run(node.a, ctx), r = run(node.b, ctx);
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return l / r;
          case '^': return Math.pow(l, r);
          case 'mod':
            if (r === 0) throw new Error('mod by zero');
            return l - r * Math.floor(l / r);
        }
    }
    throw new Error('bad node');
  }

  /* deg defaults to true so the original behaviour is kept. */
  function evaluate(input, opts) {
    opts = opts || {};
    var ctx = { deg: opts.deg !== false, x: opts.x };
    var result = run(parse(input), ctx);
    if (typeof result !== 'number' || isNaN(result)) throw new Error('not a number');
    return result;
  }

  /* Compile once for plotting; returns f(x) giving NaN where undefined. */
  function compile(input, deg) {
    var ast = parse(input);
    return function (x) {
      try { return run(ast, { deg: !!deg, x: x }); } catch (e) { return NaN; }
    };
  }

  function autoClose(input) {
    var open = 0;
    for (var i = 0; i < input.length; i++) {
      if (input[i] === '(') open++;
      else if (input[i] === ')') open--;
    }
    var patched = input;
    for (var j = 0; j < open; j++) patched += ')';
    return patched;
  }

  function evaluateAutoClose(input, opts) { return evaluate(autoClose(input), opts); }

  function formatResult(value) {
    if (!isFinite(value)) throw new Error('out of range');
    if (value === 0) return '0';
    var abs = Math.abs(value);
    if (abs >= 1e12 || abs < 1e-9) return value.toExponential(6).replace(/\.?0+e/, 'e');
    return String(parseFloat(value.toPrecision(10)));
  }

  function pretty(expr) {
    return expr.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
  }

  var api = {
    evaluate: evaluate, evaluateAutoClose: evaluateAutoClose, autoClose: autoClose,
    formatResult: formatResult, pretty: pretty, compile: compile
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  root.CalcEngine = api;

  /* =====================================================
     UI HELPERS
     ===================================================== */
  function $(id) { return document.getElementById(id); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('calc.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('calc.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1400);
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied ' + text); } catch (e) { toast('Copy failed'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied ' + text); }, fallback);
    } else fallback();
  }

  var reduceMotion = typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function num(v) {
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? NaN : n;
  }
  function fmt(n, d) {
    if (!isFinite(n)) return '–';
    return n.toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 2 : d, minimumFractionDigits: d === undefined ? 2 : 0 });
  }
  function fmtSmart(n) {
    if (!isFinite(n)) return '–';
    if (n === 0) return '0';
    var a = Math.abs(n);
    if (a >= 1e12 || a < 1e-7) return n.toExponential(6).replace(/\.?0+e/, 'e');
    return String(parseFloat(n.toPrecision(10)));
  }
  function resultsHTML(rows) {
    return rows.map(function (r) {
      return '<div class="res' + (r[2] ? ' big' : '') + '"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');
  }

  /* =====================================================
     THEME + TABS
     ===================================================== */
  var themes = ['ember', 'moss', 'coral'];
  function setTheme(name) {
    if (themes.indexOf(name) < 0) name = 'ember';
    document.documentElement.setAttribute('data-theme', name);
    $$('.theme-dot').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-theme-set') === name); });
    store.set('theme', name);
    drawGraph();
  }
  $$('.theme-dot').forEach(function (b) {
    b.addEventListener('click', function () { setTheme(b.getAttribute('data-theme-set')); });
  });

  var currentTab = 'calc';
  function setTab(name) {
    currentTab = name;
    $$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + name); });
    store.set('tab', name);
    if (name === 'graph') { sizeGraph(); drawGraph(); }
    if (name !== 'calc') closeHistory();
  }
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () { setTab(t.getAttribute('data-tab')); });
  });

  /* =====================================================
     CALC
     ===================================================== */
  var exprEl = $('expr'), resultEl = $('result'), calcEl = $('calculator');

  var entry = '';
  var ans = 0;
  var justEvaluated = false;
  var hasError = false;
  var deg = store.get('deg', true);
  var shift = false;
  var memory = store.get('mem', 0);
  var history = store.get('hist', []);

  /* Scientific key spec. i = insert text, f = function name (adds "("). */
  var SCI = [
    { l: '(', i: '(' }, { l: ')', i: ')' },
    { l: 'x²', i: '^2', al: 'x³', ai: '^3' },
    { l: '√', f: '√', al: '∛', af: '∛' },
    { l: 'x<sup>y</sup>', i: '^', al: 'ʸ√x', ai: '^(1/' },
    { l: 'x!', i: '!' },

    { l: 'sin', f: 'sin', al: 'sin⁻¹', af: 'asin' },
    { l: 'cos', f: 'cos', al: 'cos⁻¹', af: 'acos' },
    { l: 'tan', f: 'tan', al: 'tan⁻¹', af: 'atan' },
    { l: 'ln', f: 'ln', al: 'eˣ', af: 'exp' },
    { l: 'log', f: 'log', al: '10ˣ', ai: '10^(' },
    { l: 'π', i: 'π', al: 'e', ai: 'e' },

    { l: '|x|', f: 'abs' },
    { l: '1/x', i: '1/(' },
    { l: 'mod', i: 'mod' },
    { l: 'nCr', f: 'nCr', al: 'nPr', af: 'nPr' },
    { l: 'gcd', f: 'gcd', al: 'lcm', af: 'lcm' },
    { l: ',', i: ',' }
  ];

  var sciGrid = $('sciGrid');
  SCI.forEach(function (k, idx) {
    var b = document.createElement('button');
    b.className = 'key key-sci';
    b.setAttribute('data-sci', idx);
    b.innerHTML = k.l;
    sciGrid.appendChild(b);
  });
  function refreshSciLabels() {
    $$('.key-sci', sciGrid).forEach(function (b) {
      var k = SCI[+b.getAttribute('data-sci')];
      b.innerHTML = shift && k.al ? k.al : k.l;
      b.classList.toggle('alt', shift && !!k.al);
    });
    $('shiftToggle').classList.toggle('on', shift);
  }

  function scrollDisplay() {
    resultEl.scrollLeft = resultEl.scrollWidth;
    exprEl.scrollLeft = exprEl.scrollWidth;
  }
  function updateMemFlag() { $('memFlag').hidden = memory === 0; }
  function updateDegLabel() { $('degToggle').textContent = deg ? 'DEG' : 'RAD'; $('degToggle').classList.toggle('rad', !deg); }

  function previewText() {
    if (entry === '') return '';
    try {
      var v = evaluateAutoClose(entry, { deg: deg });
      return '= ' + formatResult(v);
    } catch (e) { return ''; }
  }

  function render() {
    if (entry === '') {
      exprEl.innerHTML = '&nbsp;';
      resultEl.textContent = '0';
    } else {
      var p = previewText();
      exprEl.textContent = p || ' ';
      exprEl.classList.toggle('preview', !!p);
      resultEl.textContent = pretty(entry);
    }
    resultEl.classList.remove('error');
    scrollDisplay();
  }
  function showError() {
    hasError = true;
    exprEl.classList.remove('preview');
    exprEl.textContent = pretty(entry) || ' ';
    resultEl.textContent = 'Error';
    resultEl.classList.add('error');
    scrollDisplay();
  }
  function clearAll() { entry = ''; hasError = false; justEvaluated = false; exprEl.classList.remove('preview'); render(); }

  function isOp(ch) { return ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^'; }

  function insert(text) {
    if (hasError) clearAll();
    if (justEvaluated) {
      if (isOp(text) || text === '%' || text === 'mod') entry = formatForEntry(ans) + text;
      else if (text === '!' || text === ')') entry = formatForEntry(ans) + text;
      else entry = text;
      justEvaluated = false;
      exprEl.classList.remove('preview');
      render();
      return;
    }
    if (isOp(text) && entry.length > 0) {
      var last = entry[entry.length - 1];
      if (isOp(last) && !(text === '-' && last !== '-')) {
        entry = entry.slice(0, -1) + text;
        render();
        return;
      }
    }
    entry += text;
    render();
  }
  /* Numbers carried into an expression use full precision, trimmed of float noise. */
  function formatForEntry(v) {
    var s = String(parseFloat(v.toPrecision(12)));
    return s.indexOf('e') >= 0 ? '(' + s.replace('e', '*10^') + ')' : s;
  }

  function backspace() {
    if (hasError || justEvaluated) { clearAll(); return; }
    /* remove a whole function name like "sin(" in one go */
    var m = entry.match(/(asin|acos|atan|sin|cos|tan|ln|log|exp|abs|nCr|nPr|gcd|lcm|√|∛)\($/);
    if (m) entry = entry.slice(0, -m[0].length);
    else if (/mod$/.test(entry)) entry = entry.slice(0, -3);
    else entry = entry.slice(0, -1);
    render();
  }

  function negate() {
    if (hasError) clearAll();
    if (justEvaluated) { entry = formatForEntry(ans); justEvaluated = false; }
    if (entry === '') return;
    var m = entry.match(/^-\((.*)\)$/);
    entry = m ? m[1] : '-(' + entry + ')';
    render();
  }

  function currentValue() {
    if (entry !== '' && !hasError) {
      try { return evaluateAutoClose(entry, { deg: deg }); } catch (e) { return null; }
    }
    if (justEvaluated) return ans;
    return 0;
  }

  function addHistory(expr, text, value) {
    history.unshift({ e: expr, r: text, v: value });
    if (history.length > 60) history.length = 60;
    store.set('hist', history);
    renderHistory();
  }

  function equals() {
    if (entry === '' || hasError) return;
    try {
      var closed = autoClose(entry);
      var value = evaluate(closed, { deg: deg });
      var text = formatResult(value);
      ans = value;
      var shown = pretty(closed);
      exprEl.classList.remove('preview');
      exprEl.textContent = shown + ' =';
      resultEl.textContent = text;
      resultEl.classList.remove('error', 'flash');
      void resultEl.offsetWidth;
      resultEl.classList.add('flash');
      addHistory(closed, text, value);
      entry = '';
      justEvaluated = true;
      hasError = false;
      scrollDisplay();
    } catch (err) {
      showError();
    }
  }

  function memAction(a) {
    if (a === 'mc') { memory = 0; toast('Memory cleared'); }
    else if (a === 'mr') {
      if (memory === 0) { toast('Memory is empty'); return; }
      insert(formatForEntry(memory));
    } else {
      var v = currentValue();
      if (v === null || !isFinite(v)) { toast('Nothing to store'); return; }
      memory = memory + (a === 'mplus' ? v : -v);
      if (entry !== '' && !hasError) {
        /* the typed expression is committed, so the next digit starts fresh */
        ans = v; entry = ''; justEvaluated = true;
        exprEl.classList.remove('preview');
        exprEl.textContent = (a === 'mplus' ? 'M+ ' : 'M− ') + 'stored';
        resultEl.textContent = formatResult(v);
        scrollDisplay();
      }
      toast('Memory: ' + formatResult(memory));
    }
    store.set('mem', memory);
    updateMemFlag();
  }

  function useAns() { insert(formatForEntry(ans)); }

  function rippleOn(btn, ev) {
    if (reduceMotion) return;
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    var x = (ev && ev.clientX ? ev.clientX : rect.left + rect.width / 2) - rect.left - size / 2;
    var y = (ev && ev.clientY ? ev.clientY : rect.top + rect.height / 2) - rect.top - size / 2;
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    btn.appendChild(ripple);
    setTimeout(function () { ripple.remove(); }, 550);
  }

  $$('#panel-calc .key').forEach(function (btn) {
    btn.addEventListener('click', function (ev) {
      rippleOn(btn, ev);
      var action = btn.getAttribute('data-action');
      var ins = btn.getAttribute('data-insert');
      var sci = btn.getAttribute('data-sci');
      if (action === 'clear') clearAll();
      else if (action === 'back') backspace();
      else if (action === 'ans') useAns();
      else if (action === 'equals') equals();
      else if (action === 'negate') negate();
      else if (action === 'mc' || action === 'mr' || action === 'mplus' || action === 'mminus') memAction(action);
      else if (sci !== null) {
        var k = SCI[+sci];
        var f = shift && k.af ? k.af : (shift && k.ai ? null : k.f);
        var i = shift && k.ai ? k.ai : (shift && k.af ? null : k.i);
        if (f) insert(f + '(');
        else if (i) insert(i);
        if (shift) { shift = false; refreshSciLabels(); }
      } else if (ins) insert(ins);
    });
  });

  $('degToggle').addEventListener('click', function () {
    deg = !deg; store.set('deg', deg); updateDegLabel();
    if (!justEvaluated && !hasError) render();
    toast(deg ? 'Degrees' : 'Radians');
  });
  $('shiftToggle').addEventListener('click', function () { shift = !shift; refreshSciLabels(); });
  $('copyBtn').addEventListener('click', function () {
    var text = hasError ? '' : (justEvaluated ? resultEl.textContent : (entry === '' ? '0' : previewText().replace('= ', '') || resultEl.textContent));
    if (text) copyText(text);
  });

  /* History */
  function renderHistory() {
    var list = $('histList');
    list.innerHTML = '';
    $('histEmpty').hidden = history.length > 0;
    history.forEach(function (h) {
      var li = document.createElement('li');
      var eb = document.createElement('button');
      eb.className = 'h-expr';
      eb.textContent = pretty(h.e);
      eb.title = 'Load this expression';
      eb.addEventListener('click', function () {
        hasError = false; justEvaluated = false; entry = h.e; setTab('calc'); render(); closeHistory();
      });
      var rb = document.createElement('button');
      rb.className = 'h-res';
      rb.textContent = '= ' + h.r;
      rb.title = 'Use this result';
      rb.addEventListener('click', function () {
        setTab('calc'); insert(formatForEntry(h.v)); closeHistory();
      });
      li.appendChild(eb); li.appendChild(rb);
      list.appendChild(li);
    });
  }
  function openHistory() { $('history').classList.add('open'); }
  function closeHistory() { $('history').classList.remove('open'); }
  $('histOpen').addEventListener('click', function () { setTab('calc'); openHistory(); });
  $('histClose').addEventListener('click', closeHistory);
  $('histClear').addEventListener('click', function () { history = []; store.set('hist', history); renderHistory(); });

  /* Keyboard */
  function flashKey(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(function () { el.classList.remove('pressed'); }, 120);
  }
  document.addEventListener('keydown', function (ev) {
    if (currentTab !== 'calc') return;
    var tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var k = ev.key;
    if (/^[0-9.]$/.test(k)) { insert(k); flashKey('#panel-calc [data-insert="' + k + '"]'); }
    else if (k === '+' || k === '-' || k === '*' || k === '/') { ev.preventDefault(); insert(k); }
    else if (k === '^' || k === '!' || k === '(' || k === ')' || k === '%' || k === ',') insert(k);
    else if (k === 'Enter' || k === '=') { ev.preventDefault(); equals(); }
    else if (k === 'Backspace') backspace();
    else if (k === 'Escape') clearAll();
    else if (k === 'p' || k === 'P') insert('π');
    else if (k === 's') insert('sin(');
    else if (k === 'c') insert('cos(');
    else if (k === 't') insert('tan(');
    else if (k === 'l') insert('ln(');
    else if (k === 'r') insert('√(');
    else if (k === 'a') useAns();
    else return;
  });

  /* Gentle tilt on desktop pointers */
  var wrap = document.querySelector('.scene');
  if (wrap && !reduceMotion && window.matchMedia('(hover: hover) and (min-width: 1000px)').matches) {
    wrap.addEventListener('pointermove', function (ev) {
      var rect = wrap.getBoundingClientRect();
      var px = (ev.clientX - rect.left) / rect.width - 0.5;
      var py = (ev.clientY - rect.top) / rect.height - 0.5;
      calcEl.style.transform = 'perspective(1400px) rotateY(' + (px * 4).toFixed(2) + 'deg) rotateX(' + (-py * 4).toFixed(2) + 'deg)';
    });
    wrap.addEventListener('pointerleave', function () { calcEl.style.transform = ''; });
  }

  /* =====================================================
     CONVERTER
     ===================================================== */
  var UNITS = {
    Length: { base: 'm', u: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852 }, def: ['km', 'mi'] },
    Mass: { u: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 }, def: ['kg', 'lb'] },
    Temp: { temp: true, u: { '°C': 1, '°F': 1, K: 1 }, def: ['°C', '°F'] },
    Area: { u: { 'cm²': 1e-4, 'm²': 1, ha: 1e4, 'km²': 1e6, 'ft²': 0.09290304, ac: 4046.8564224, feddan: 4200.83 }, def: ['m²', 'ft²'] },
    Volume: { u: { mL: 0.001, L: 1, 'm³': 1000, tsp: 0.00492892159375, tbsp: 0.01478676478125, cup: 0.2365882365, 'fl oz': 0.0295735295625, gal: 3.785411784 }, def: ['L', 'gal'] },
    Speed: { u: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 1852 / 3600 }, def: ['km/h', 'mph'] },
    Time: { u: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800, year: 31557600 }, def: ['h', 'min'] },
    Data: { u: { bit: 0.125, B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 }, def: ['GB', 'MB'] }
  };
  var convCat = store.get('cat', 'Length');
  if (!UNITS[convCat]) convCat = 'Length';

  function toBase(cat, unit, v) {
    if (UNITS[cat].temp) {
      if (unit === '°C') return v;
      if (unit === '°F') return (v - 32) * 5 / 9;
      return v - 273.15;
    }
    return v * UNITS[cat].u[unit];
  }
  function fromBase(cat, unit, v) {
    if (UNITS[cat].temp) {
      if (unit === '°C') return v;
      if (unit === '°F') return v * 9 / 5 + 32;
      return v + 273.15;
    }
    return v / UNITS[cat].u[unit];
  }
  function convert(cat, from, to, v) { return fromBase(cat, to, toBase(cat, from, v)); }

  function fillUnits(cat) {
    var names = Object.keys(UNITS[cat].u);
    [$('convUnitA'), $('convUnitB')].forEach(function (sel, i) {
      sel.innerHTML = names.map(function (n) { return '<option>' + n + '</option>'; }).join('');
      sel.value = UNITS[cat].def[i];
    });
  }
  function convCalc(fromSide) {
    var a = $('convA'), b = $('convB');
    var ua = $('convUnitA').value, ub = $('convUnitB').value;
    if (fromSide === 'B') {
      var vb = num(b.value);
      a.value = isNaN(vb) ? '' : fmtSmart(convert(convCat, ub, ua, vb));
    } else {
      var va = num(a.value);
      b.value = isNaN(va) ? '' : fmtSmart(convert(convCat, ua, ub, va));
    }
    var one = convert(convCat, ua, ub, 1);
    $('convFormula').textContent = '1 ' + ua + ' = ' + fmtSmart(one) + ' ' + ub;
    renderQuick();
  }
  function renderQuick() {
    var ua = $('convUnitA').value, ub = $('convUnitB').value;
    var va = num($('convA').value);
    var base = isNaN(va) ? 1 : va;
    var box = $('convQuick');
    var names = Object.keys(UNITS[convCat].u).filter(function (n) { return n !== ua; });
    box.innerHTML = names.map(function (n) {
      return '<button class="q' + (n === ub ? ' on' : '') + '" data-u="' + n + '"><span>' + n + '</span><b>' + fmtSmart(convert(convCat, ua, n, base)) + '</b></button>';
    }).join('');
    $$('.q', box).forEach(function (q) {
      q.addEventListener('click', function () { $('convUnitB').value = q.getAttribute('data-u'); convCalc('A'); });
    });
  }
  function buildCats() {
    var box = $('convCats');
    box.innerHTML = Object.keys(UNITS).map(function (c) {
      return '<button class="cat' + (c === convCat ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>';
    }).join('');
    $$('.cat', box).forEach(function (b) {
      b.addEventListener('click', function () {
        convCat = b.getAttribute('data-cat'); store.set('cat', convCat);
        $$('.cat', box).forEach(function (x) { x.classList.toggle('active', x === b); });
        fillUnits(convCat); convCalc('A');
      });
    });
  }
  $('convA').addEventListener('input', function () { convCalc('A'); });
  $('convB').addEventListener('input', function () { convCalc('B'); });
  $('convUnitA').addEventListener('change', function () { convCalc('A'); });
  $('convUnitB').addEventListener('change', function () { convCalc('A'); });
  $('convSwap').addEventListener('click', function () {
    var ua = $('convUnitA').value, ub = $('convUnitB').value;
    $('convUnitA').value = ub; $('convUnitB').value = ua;
    convCalc('A');
  });
  buildCats(); fillUnits(convCat); convCalc('A');

  /* =====================================================
     MONEY
     ===================================================== */
  function pct(a, b) { return (a / 100) * b; }
  function moneyCalc() {
    var a = num($('p1a').value), b = num($('p1b').value);
    $('p1o').textContent = isNaN(a) || isNaN(b) ? '–' : fmtSmart(pct(a, b));
    a = num($('p2a').value); b = num($('p2b').value);
    $('p2o').textContent = isNaN(a) || isNaN(b) || b === 0 ? '–' : fmtSmart(a / b * 100) + '%';
    a = num($('p3a').value); b = num($('p3b').value);
    if (isNaN(a) || isNaN(b) || a === 0) $('p3o').textContent = '–';
    else { var c = (b - a) / Math.abs(a) * 100; $('p3o').textContent = (c > 0 ? '+' : '') + fmtSmart(c) + '%'; }

    var price = num($('d_price').value), disc = num($('d_disc').value), vat = num($('d_vat').value);
    if ([price, disc, vat].some(isNaN)) $('d_out').innerHTML = '';
    else {
      var off = pct(disc, price), after = price - off, tax = pct(vat, after), total = after + tax;
      $('d_out').innerHTML = resultsHTML([['You save', fmt(off)], ['After discount', fmt(after)], ['VAT', fmt(tax)], ['Total', fmt(total), true]]);
    }

    var bill = num($('s_bill').value), tip = num($('s_tip').value), ppl = num($('s_ppl').value);
    var pplOk = isFinite(ppl) && ppl >= 1 && Math.floor(ppl) === ppl;
    $('s_ppl').classList.toggle('bad', !pplOk);
    if (!pplOk) $('s_out').innerHTML = '<p class="note err">Enter a whole number of people, 1 or more.</p>';
    else if ([bill, tip].some(isNaN)) $('s_out').innerHTML = '';
    else {
      var tipAmt = pct(tip, bill), tot = bill + tipAmt;
      $('s_out').innerHTML = resultsHTML([['Tip', fmt(tipAmt)], ['Total', fmt(tot)], ['Each (' + ppl + ')', fmt(tot / ppl), true]]);
    }

    var amt = num($('l_amt').value), rate = num($('l_rate').value), yrs = num($('l_yrs').value);
    if ([amt, rate, yrs].some(isNaN) || amt < 0 || rate < 0 || Math.round(yrs * 12) < 1) $('l_out').innerHTML = '';
    else {
      var n = Math.round(yrs * 12), r = rate / 100 / 12;
      var pay = r === 0 ? amt / n : amt * r / (1 - Math.pow(1 + r, -n));
      $('l_out').innerHTML = resultsHTML([['Per month', fmt(pay), true], ['Total paid', fmt(pay * n)], ['Total interest', fmt(pay * n - amt)]]);
    }
  }
  $$('#panel-money input').forEach(function (i) { i.addEventListener('input', moneyCalc); });
  moneyCalc();

  /* =====================================================
     DATES
     ===================================================== */
  function iso(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function nice(d) { return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function ymd(a, b) { /* a <= b */
    var months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (addMonths(a, months) > b) months--;
    var d = dayDiff(addMonths(a, months), b);
    return { y: Math.floor(months / 12), m: months % 12, d: d };
  }
  function dayDiff(a, b) { return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); }
  function addMonths(d, n) {
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(d.getDate(), last));
    return t;
  }
  function datesCalc() {
    var a = parseISO($('dt_from').value), b = parseISO($('dt_to').value);
    if (!a || !b) $('dt_out').innerHTML = '';
    else {
      var neg = a > b; if (neg) { var t = a; a = b; b = t; }
      var p = ymd(a, b), days = dayDiff(a, b);
      var parts = [];
      if (p.y) parts.push(plural(p.y, 'year'));
      if (p.m) parts.push(plural(p.m, 'month'));
      if (p.d || !parts.length) parts.push(plural(p.d, 'day'));
      $('dt_out').innerHTML = resultsHTML([[neg ? 'Earlier by' : 'Difference', parts.join(', '), true], ['Total days', fmt(days, 0)], ['Weeks', fmt(Math.floor(days / 7), 0) + ' w ' + (days % 7) + ' d']]);
    }

    var s = parseISO($('da_start').value), n = num($('da_n').value);
    if (!s || isNaN(n)) $('da_out').innerHTML = '';
    else {
      n = n * +$('da_dir').value;
      var u = $('da_unit').value, r;
      if (u === 'd') r = new Date(s.getFullYear(), s.getMonth(), s.getDate() + n);
      else if (u === 'w') r = new Date(s.getFullYear(), s.getMonth(), s.getDate() + n * 7);
      else if (u === 'm') r = addMonths(s, n);
      else r = addMonths(s, n * 12);
      $('da_out').innerHTML = resultsHTML([['Result', nice(r), true]]);
    }

    var born = parseISO($('ag_born').value), today = new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!born || born > today) $('ag_out').innerHTML = '';
    else {
      var ag = ymd(born, today);
      var nb = new Date(today.getFullYear(), born.getMonth(), born.getDate());
      if (nb < today) nb = new Date(today.getFullYear() + 1, born.getMonth(), born.getDate());
      var left = dayDiff(today, nb);
      $('ag_out').innerHTML = resultsHTML([['Age', ag.y + ' years, ' + plural(ag.m, 'month') + ', ' + plural(ag.d, 'day'), true], ['Days alive', fmt(dayDiff(born, today), 0)], ['Next birthday', left === 0 ? 'Today' : 'in ' + plural(left, 'day')]]);
    }
  }
  (function initDates() {
    var t = new Date();
    $('dt_from').value = iso(t);
    $('dt_to').value = iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 30));
    $('da_start').value = iso(t);
  })();
  $$('#panel-dates input, #panel-dates select').forEach(function (i) {
    i.addEventListener('input', datesCalc); i.addEventListener('change', datesCalc);
  });
  datesCalc();

  /* =====================================================
     HEX / BASES
     ===================================================== */
  var base = 10;
  var DIG = '0123456789abcdef';
  function parseBig(str, b) {
    str = String(str).trim().toLowerCase().replace(/[\s_]/g, '');
    var neg = false;
    if (str[0] === '-') { neg = true; str = str.slice(1); }
    if (b === 16 && str.indexOf('0x') === 0) str = str.slice(2);
    if (b === 2 && str.indexOf('0b') === 0) str = str.slice(2);
    if (str === '') return null;
    var v = 0n, bb = BigInt(b);
    for (var i = 0; i < str.length; i++) {
      var d = DIG.indexOf(str[i]);
      if (d < 0 || d >= b) return null;
      v = v * bb + BigInt(d);
    }
    return neg ? -v : v;
  }
  function bigToBase(v, b) {
    var neg = v < 0n; if (neg) v = -v;
    var s = v.toString(b).toUpperCase();
    if (b === 2) s = s.replace(/(?=(\d{4})+$)/g, ' ').trim();
    if (b === 16 && s.length > 4) s = s.replace(/(?=([0-9A-F]{4})+$)/g, ' ').trim();
    return (neg ? '-' : '') + s;
  }
  var NAMES = { 10: 'DEC', 16: 'HEX', 2: 'BIN', 8: 'OCT' };
  function progCalc() {
    var v = parseBig($('progIn').value, base);
    var box = $('progOut');
    if (v === null) {
      box.innerHTML = '<p class="note err">Not a valid ' + NAMES[base] + ' number</p>';
      $('bitOut').innerHTML = '';
      return;
    }
    box.innerHTML = [10, 16, 2, 8].map(function (b) {
      var t = bigToBase(v, b);
      return '<button class="base-row' + (b === base ? ' on' : '') + '" data-copy="' + t.replace(/ /g, '') + '"><span>' + NAMES[b] + '</span><b>' + t + '</b></button>';
    }).join('');
    $$('.base-row', box).forEach(function (r) {
      r.addEventListener('click', function () { copyText(r.getAttribute('data-copy')); });
    });
    var LIM = 1n << 63n;
    var over = v >= LIM || v < -LIM;
    var bv = parseBig($('progB').value, base);
    var out = [];
    var M = 64n;
    var u = BigInt.asUintN(64, v);
    out.push(['NOT A', bigToBase(BigInt.asIntN(64, ~u), base)]);
    if (bv !== null) {
      var ub = BigInt.asUintN(64, bv);
      out.push(['A AND B', bigToBase(BigInt.asIntN(64, u & ub), base)]);
      out.push(['A OR B', bigToBase(BigInt.asIntN(64, u | ub), base)]);
      out.push(['A XOR B', bigToBase(BigInt.asIntN(64, u ^ ub), base)]);
      if (bv >= 0n && bv < M) {
        out.push(['A << B', bigToBase(BigInt.asIntN(64, u << bv), base)]);
        out.push(['A >> B', bigToBase(v >> bv, base)]);
      }
    }
    $('bitOut').innerHTML = (over ? '<p class="note err">Beyond 64 bits: bitwise results use the low 64 bits.</p>' : '') + resultsHTML(out);
  }
  $$('#baseChips .cat').forEach(function (c) {
    c.addEventListener('click', function () {
      var nb = +c.getAttribute('data-base');
      var cur = parseBig($('progIn').value, base);
      var curB = parseBig($('progB').value, base);
      base = nb;
      if (cur !== null) $('progIn').value = bigToBase(cur, base).replace(/ /g, '');
      if (curB !== null) $('progB').value = bigToBase(curB, base).replace(/ /g, '');
      $$('#baseChips .cat').forEach(function (x) { x.classList.toggle('active', x === c); });
      progCalc();
    });
  });
  $('progIn').addEventListener('input', progCalc);
  $('progB').addEventListener('input', progCalc);
  progCalc();

  /* =====================================================
     GRAPH
     ===================================================== */
  var cv = $('graph'), ctx2 = cv.getContext('2d');
  var view = { cx: 0, cy: 0, s: 40 }; /* centre in world units, s = pixels per unit */
  var gw = 400, gh = 280, dpr = 1;
  var fnA = null, fnB = null, fnAErr = false, fnBErr = false;
  var hover = null;

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function sizeGraph() {
    var rect = cv.getBoundingClientRect();
    if (!rect.width) return;
    dpr = window.devicePixelRatio || 1;
    gw = Math.round(rect.width); gh = Math.round(rect.height);
    cv.width = gw * dpr; cv.height = gh * dpr;
  }
  function compileFns() {
    function mk(id) {
      var s = $(id).value.trim();
      if (!s) return { f: null, err: false };
      try { return { f: compile(autoClose(s), false), err: false }; } catch (e) { return { f: null, err: true }; }
    }
    var a = mk('fn1'), b = mk('fn2');
    fnA = a.f; fnAErr = a.err; fnB = b.f; fnBErr = b.err;
    $('fn1').classList.toggle('bad', fnAErr);
    $('fn2').classList.toggle('bad', fnBErr);
  }
  function niceStep(target) {
    var p = Math.pow(10, Math.floor(Math.log10(target)));
    var m = target / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function wx(px) { return view.cx + (px - gw / 2) / view.s; }
  function wy(py) { return view.cy - (py - gh / 2) / view.s; }
  function sx(x) { return gw / 2 + (x - view.cx) * view.s; }
  function sy(y) { return gh / 2 - (y - view.cy) * view.s; }

  function plot(fn, color) {
    if (!fn) return;
    ctx2.strokeStyle = color; ctx2.lineWidth = 2.2; ctx2.lineJoin = 'round';
    ctx2.beginPath();
    var pen = false, prevY = 0;
    for (var px = 0; px <= gw; px += 0.75) {
      var y = fn(wx(px));
      if (!isFinite(y)) { pen = false; continue; }
      var py = sy(y);
      if (pen && Math.abs(py - prevY) > gh * 1.5) pen = false; /* asymptote */
      if (!pen) { ctx2.moveTo(px, py); pen = true; } else ctx2.lineTo(px, py);
      prevY = py;
    }
    ctx2.stroke();
  }
  function drawGraph() {
    if (currentTab !== 'graph' || !gw) return;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.clearRect(0, 0, gw, gh);
    var grid = cssVar('--grid'), axis = cssVar('--axis'), dim = cssVar('--text-dim');
    var step = niceStep(60 / view.s);
    ctx2.font = '10px JetBrains Mono, monospace';
    ctx2.lineWidth = 1;
    var x0 = Math.floor(wx(0) / step) * step, x1 = wx(gw);
    for (var x = x0; x <= x1; x += step) {
      var X = Math.round(sx(x)) + 0.5;
      ctx2.strokeStyle = Math.abs(x) < step / 1e3 ? axis : grid;
      ctx2.beginPath(); ctx2.moveTo(X, 0); ctx2.lineTo(X, gh); ctx2.stroke();
    }
    var y0 = Math.floor(wy(gh) / step) * step, y1 = wy(0);
    for (var y = y0; y <= y1; y += step) {
      var Y = Math.round(sy(y)) + 0.5;
      ctx2.strokeStyle = Math.abs(y) < step / 1e3 ? axis : grid;
      ctx2.beginPath(); ctx2.moveTo(0, Y); ctx2.lineTo(gw, Y); ctx2.stroke();
    }
    ctx2.fillStyle = dim;
    var ax = Math.min(Math.max(sy(0), 12), gh - 4);
    var ay = Math.min(Math.max(sx(0) + 4, 2), gw - 36);
    ctx2.textAlign = 'center';
    for (x = x0; x <= x1; x += step) {
      if (Math.abs(x) < step / 1e3) continue;
      ctx2.fillText(fmtSmart(parseFloat(x.toPrecision(6))), sx(x), Math.min(ax + 12, gh - 4));
    }
    ctx2.textAlign = 'left';
    for (y = y0; y <= y1; y += step) {
      if (Math.abs(y) < step / 1e3) continue;
      ctx2.fillText(fmtSmart(parseFloat(y.toPrecision(6))), ay, sy(y) - 3);
    }
    plot(fnA, cssVar('--accent'));
    plot(fnB, cssVar('--accent2'));
    if (hover) {
      ctx2.strokeStyle = cssVar('--text-dim'); ctx2.setLineDash([4, 4]); ctx2.lineWidth = 1;
      ctx2.beginPath(); ctx2.moveTo(hover.px + 0.5, 0); ctx2.lineTo(hover.px + 0.5, gh); ctx2.stroke();
      ctx2.setLineDash([]);
      [[fnA, '--accent'], [fnB, '--accent2']].forEach(function (p) {
        if (!p[0]) return;
        var yv = p[0](hover.x);
        if (!isFinite(yv)) return;
        ctx2.fillStyle = cssVar(p[1]);
        ctx2.beginPath(); ctx2.arc(hover.px, sy(yv), 4.5, 0, 6.2832); ctx2.fill();
      });
    }
  }
  function readout() {
    var el = $('graphRead');
    if (!hover) { el.textContent = 'Drag to pan, scroll or use + / − to zoom'; return; }
    var parts = ['x = ' + fmtSmart(parseFloat(hover.x.toPrecision(5)))];
    [[fnA, 'f'], [fnB, 'g']].forEach(function (p) {
      if (!p[0]) return;
      var v = p[0](hover.x);
      parts.push(p[1] + ' = ' + (isFinite(v) ? fmtSmart(parseFloat(v.toPrecision(5))) : 'undefined'));
    });
    el.textContent = parts.join('   ');
  }
  function zoom(f, px, py) {
    px = px === undefined ? gw / 2 : px; py = py === undefined ? gh / 2 : py;
    var bx = wx(px), by = wy(py);
    view.s = Math.min(4000, Math.max(2, view.s * f));
    view.cx = bx - (px - gw / 2) / view.s;
    view.cy = by + (py - gh / 2) / view.s;
    drawGraph();
  }
  var drag = null;
  cv.addEventListener('pointerdown', function (ev) {
    cv.setPointerCapture(ev.pointerId);
    drag = { x: ev.clientX, y: ev.clientY, cx: view.cx, cy: view.cy };
    cv.classList.add('grab');
  });
  cv.addEventListener('pointermove', function (ev) {
    var rect = cv.getBoundingClientRect();
    var px = ev.clientX - rect.left;
    if (drag) {
      view.cx = drag.cx - (ev.clientX - drag.x) / view.s;
      view.cy = drag.cy + (ev.clientY - drag.y) / view.s;
    }
    hover = { px: px, x: wx(px) };
    drawGraph(); readout();
  });
  function endDrag() { drag = null; cv.classList.remove('grab'); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag) { hover = null; drawGraph(); readout(); } });
  cv.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    var rect = cv.getBoundingClientRect();
    zoom(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.clientX - rect.left, ev.clientY - rect.top);
  }, { passive: false });
  $('gZoomIn').addEventListener('click', function () { zoom(1.4); });
  $('gZoomOut').addEventListener('click', function () { zoom(1 / 1.4); });
  $('gReset').addEventListener('click', function () { view = { cx: 0, cy: 0, s: 40 }; hover = null; drawGraph(); readout(); });
  $('fn1').addEventListener('input', function () { compileFns(); drawGraph(); readout(); });
  $('fn2').addEventListener('input', function () { compileFns(); drawGraph(); readout(); });
  window.addEventListener('resize', function () { sizeGraph(); drawGraph(); });
  compileFns();

  /* =====================================================
     INIT
     ===================================================== */
  updateDegLabel(); updateMemFlag(); refreshSciLabels(); renderHistory(); render();
  setTheme(store.get('theme', 'ember'));
  setTab(store.get('tab', 'calc'));

})(typeof window !== 'undefined' ? window : globalThis);
