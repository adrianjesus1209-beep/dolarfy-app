/**
 * Evaluador matemático seguro y preciso para Dolarfy.
 * Reemplaza el uso de eval() y new Function() en la calculadora.
 * Soporta + - * /, paréntesis, decimales con coma o punto, y previene divisiones por cero.
 */

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const n = expr.length;

  while (i < n) {
    const ch = expr[i];

    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    if (ch === '(' || ch === ')' || ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if ((ch >= '0' && ch <= '9') || ch === ',' || ch === '.') {
      let j = i;
      let decimalSeen = false;
      while (j < n) {
        const c = expr[j];
        if (c >= '0' && c <= '9') {
          j++;
          continue;
        }
        if ((c === ',' || c === '.') && !decimalSeen) {
          decimalSeen = true;
          j++;
          continue;
        }
        break;
      }
      let raw = expr.slice(i, j).replace(/,/g, '.');
      if (raw === '.' || raw === '') raw = '0';
      const num = parseFloat(raw);
      tokens.push({ type: 'num', value: isNaN(num) ? 0 : num });
      i = j;
      continue;
    }

    throw new Error(`Carácter inesperado: ${ch}`);
  }

  return tokens;
}

export function evaluateMath(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') return 0;

  const tokens = tokenize(expr.trim());
  if (tokens.length === 0) return 0;

  let pos = 0;
  const peek = () => tokens[pos] || null;
  const next = () => tokens[pos++];

  function parseUnary() {
    const t = peek();
    if (t && t.type === 'op' && (t.value === '-' || t.value === '+')) {
      next();
      const value = parseUnary();
      return t.value === '-' ? -value : value;
    }
    return parseNumber();
  }

  function parseNumber() {
    const t = next();
    if (!t) return 0;
    if (t.type === 'num') return t.value;
    if (t.type === 'op' && t.value === '(') {
      const value = parseExpr();
      const close = next();
      if (!close || close.type !== 'op' || close.value !== ')') {
        return value;
      }
      return value;
    }
    return 0;
  }

  function parseTerm() {
    let value = parseUnary();
    while (true) {
      const t = peek();
      if (t && t.type === 'op' && (t.value === '*' || t.value === '/')) {
        next();
        const rhs = parseUnary();
        if (t.value === '*') {
          value = value * rhs;
        } else {
          if (rhs === 0) {
            throw new Error('División entre cero');
          }
          value = value / rhs;
        }
        value = Math.round((value + Number.EPSILON) * 1e8) / 1e8;
      } else {
        break;
      }
    }
    return value;
  }

  function parseExpr() {
    let value = parseTerm();
    while (true) {
      const t = peek();
      if (t && t.type === 'op' && (t.value === '+' || t.value === '-')) {
        next();
        const rhs = parseTerm();
        if (t.value === '+') value = value + rhs;
        else value = value - rhs;
        value = Math.round((value + Number.EPSILON) * 1e8) / 1e8;
      } else {
        break;
      }
    }
    return value;
  }

  const result = parseExpr();
  return isFinite(result) ? result : 0;
}
