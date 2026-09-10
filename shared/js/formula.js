/* ============================================================
   formula.js — the small expression language an instructor
   writes experiments in. No eval: expressions are tokenised,
   parsed into a tree and walked, so a formula typed into the
   admin console can never become code.

   Understands
     numbers            2, 1.5, 6.02e23
     names              B, V_H, I, e, pi
     operators          + - * / ^  and parentheses
     functions          sqrt abs ln log exp sin cos tan asin acos
                        atan round
     column functions   mean(V) sum(V) min(V) max(V) count(V)
                        slope(x, y) intercept(x, y) r2(x, y)

   Names resolve against the scope: first the row being worked
   out, then constants, then quantities already derived.
   ============================================================ */

(function (root) {
  "use strict";

  var FUNCS1 = {
    sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10 || function (x) { return Math.log(x) / Math.LN10; },
    log10: Math.log10 || function (x) { return Math.log(x) / Math.LN10; },
    exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, round: Math.round
  };
  var COLFN1 = ["mean", "sum", "min", "max", "count"];
  var COLFN2 = ["slope", "intercept", "r2"];

  function tokenize(src) {
    var out = [], i = 0;
    while (i < src.length) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        var m = /^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/.exec(src.slice(i));
        if (!m) throw new Error("Bad number at " + i);
        out.push({ t: "num", v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var n = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
        out.push({ t: "name", v: n });
        i += n.length;
        continue;
      }
      if ("+-*/^(),".indexOf(c) >= 0) { out.push({ t: c }); i++; continue; }
      throw new Error("Cannot read '" + c + "'");
    }
    return out;
  }

  function parse(src) {
    var ts = tokenize(src), pos = 0;
    function peek() { return ts[pos]; }
    function eat(t) {
      var tok = ts[pos];
      if (!tok || (t && tok.t !== t)) throw new Error("Expected " + (t || "something") + " in the formula");
      pos++;
      return tok;
    }
    function expr() { return addsub(); }
    function addsub() {
      var left = muldiv();
      while (peek() && (peek().t === "+" || peek().t === "-")) {
        var op = eat().t;
        left = { n: "bin", op: op, a: left, b: muldiv() };
      }
      return left;
    }
    function muldiv() {
      var left = unary();
      while (peek() && (peek().t === "*" || peek().t === "/")) {
        var op = eat().t;
        left = { n: "bin", op: op, a: left, b: unary() };
      }
      return left;
    }
    function unary() {
      if (peek() && peek().t === "-") { eat("-"); return { n: "neg", a: unary() }; }
      if (peek() && peek().t === "+") { eat("+"); return unary(); }
      return power();
    }
    function power() {
      var base = atom();
      if (peek() && peek().t === "^") { eat("^"); return { n: "bin", op: "^", a: base, b: unary() }; }
      return base;
    }
    function atom() {
      var tok = peek();
      if (!tok) throw new Error("The formula ends too early");
      if (tok.t === "num") { eat("num"); return { n: "num", v: tok.v }; }
      if (tok.t === "(") { eat("("); var e = expr(); eat(")"); return e; }
      if (tok.t === "name") {
        eat("name");
        if (peek() && peek().t === "(") {
          eat("(");
          var args = [];
          if (peek() && peek().t !== ")") {
            args.push(expr());
            while (peek() && peek().t === ",") { eat(","); args.push(expr()); }
          }
          eat(")");
          return { n: "call", name: tok.v, args: args };
        }
        return { n: "name", v: tok.v };
      }
      throw new Error("Unexpected symbol in the formula");
    }
    var tree = expr();
    if (pos !== ts.length) throw new Error("Extra symbols after the formula");
    return tree;
  }

  var cache = {};
  function compile(src) {
    if (!cache[src]) cache[src] = parse(src);
    return cache[src];
  }

  /* scope = { vars: {name: number}, cols: {key: [numbers]} } */
  function evaluate(src, scope) {
    var tree = compile(src);
    return walk(tree, scope || {});
  }

  function walk(node, scope) {
    switch (node.n) {
      case "num": return node.v;
      case "neg": return -walk(node.a, scope);
      case "name": return lookup(node.v, scope);
      case "bin": {
        var a = walk(node.a, scope), b = walk(node.b, scope);
        switch (node.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return a / b;
          case "^": return Math.pow(a, b);
        }
        return NaN;
      }
      case "call": return call(node, scope);
    }
    return NaN;
  }

  function lookup(name, scope) {
    var v = scope.vars ? scope.vars[name] : undefined;
    if (v !== undefined && v !== "" && v !== null) {
      var n = typeof v === "number" ? v : parseFloat(v);
      return isFinite(n) ? n : NaN;
    }
    if (name === "pi" || name === "PI") return Math.PI;
    if (name === "e" && !(scope.vars && "e" in scope.vars)) return Math.E;
    return NaN;
  }

  function column(node, scope) {
    if (node.n !== "name") throw new Error("That function needs a column name");
    var col = (scope.cols || {})[node.v];
    if (!col) return [];
    return col.map(function (x) { return typeof x === "number" ? x : parseFloat(x); })
      .filter(function (x) { return isFinite(x); });
  }

  function pairs(a, b) {
    var n = Math.min(a.length, b.length), out = [];
    for (var i = 0; i < n; i++) if (isFinite(a[i]) && isFinite(b[i])) out.push([a[i], b[i]]);
    return out;
  }

  function fit(pts) {
    var n = pts.length;
    if (n < 2) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    pts.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; syy += p[1] * p[1]; });
    var den = n * sxx - sx * sx;
    if (!den) return null;
    var m = (n * sxy - sx * sy) / den;
    var c = (sy - m * sx) / n;
    var num = n * sxy - sx * sy;
    return { m: m, c: c, r2: (num * num) / (den * (n * syy - sy * sy) || 1) };
  }

  function call(node, scope) {
    var name = node.name;
    if (FUNCS1[name]) {
      if (node.args.length !== 1) throw new Error(name + " takes one value");
      return FUNCS1[name](walk(node.args[0], scope));
    }
    if (COLFN1.indexOf(name) >= 0) {
      var col = column(node.args[0], scope);
      if (name === "count") return col.length;
      if (!col.length) return NaN;
      if (name === "sum") return col.reduce(function (a, b) { return a + b; }, 0);
      if (name === "mean") return col.reduce(function (a, b) { return a + b; }, 0) / col.length;
      if (name === "min") return Math.min.apply(null, col);
      if (name === "max") return Math.max.apply(null, col);
    }
    if (COLFN2.indexOf(name) >= 0) {
      if (node.args.length !== 2) throw new Error(name + " takes two column names");
      var f = fit(pairs(column(node.args[0], scope), column(node.args[1], scope)));
      if (!f) return NaN;
      return name === "slope" ? f.m : name === "intercept" ? f.c : f.r2;
    }
    throw new Error("There is no function called " + name);
  }

  /* Names an expression depends on — used to warn about typos in the builder */
  function names(src) {
    var out = [];
    (function visit(n) {
      if (!n) return;
      if (n.n === "name" && out.indexOf(n.v) < 0) out.push(n.v);
      if (n.n === "bin") { visit(n.a); visit(n.b); }
      if (n.n === "neg") visit(n.a);
      if (n.n === "call") n.args.forEach(visit);
    })(compile(src));
    return out;
  }

  function validate(src) {
    try {
      var tree = compile(src);
      var bad = null;
      (function visit(n) {
        if (!n || bad) return;
        if (n.n === "call" && !FUNCS1[n.name] && COLFN1.indexOf(n.name) < 0 && COLFN2.indexOf(n.name) < 0) {
          bad = "There is no function called " + n.name;
        }
        if (n.n === "bin") { visit(n.a); visit(n.b); }
        if (n.n === "neg") visit(n.a);
        if (n.n === "call") n.args.forEach(visit);
      })(tree);
      if (bad) return { ok: false, error: bad };
      return { ok: true, names: names(src) };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  root.Formula = { evaluate: evaluate, validate: validate, names: names, fit: fit, pairs: pairs };
  if (typeof module !== "undefined" && module.exports) module.exports = root.Formula;

})(typeof window !== "undefined" ? window : globalThis);
