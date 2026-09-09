/**
 * Evaluador matemático seguro para Dolarfy.
 * Reemplaza el uso de eval() y new Function() en la calculadora.
 * Soporta + - * /, paréntesis, y decimales con coma o punto.
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

    if (ch >= '0' && ch <= '9') {
      let j = i;
      let decimalSeen = false;
      while (j < n) {
        const c = expr[j];
        if (c >= '0' && c <= '9') {
          j++;
          continue;
        }
        if ((c === ',' || c === '.') && !decimalSeen && j + 1 < n && expr[j + 1] >= '0' && expr[j + 1] <= '9') {
          decimalSeen = true;
          j++;
          continue;
        }
        break;
      }
      const raw = expr.slice(i, j).replace(/,/g, '.');
      tokens.push({ type: 'num', value: parseFloat(raw) });
      i = j;
      continue;
    }

    throw new Error(`Carácter inesperado: ${ch}`);
  }

  return tokens;
}

export function evaluateMath(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') return NaN;

  const tokens = tokenize(expr);
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
    if (!t) throw new Error('Operando esperado');
    if (t.type === 'num') return t.value;
    if (t.type === 'op' && t.value === '(') {
      const value = parseExpr();
      const close = next();
      if (!close || close.type !== 'op' || close.value !== ')') {
        throw new Error('Paréntesis sin cerrar');
      }
      return value;
    }
    throw new Error('Operando esperado');
  }

  function parseTerm() {
    let value = parseUnary();
    while (true) {
      const t = peek();
      if (t && t.type === 'op' && (t.value === '*' || t.value === '/')) {
        next();
        const rhs = parseUnary();
        if (t.value === '*') value *= rhs;
        else value /= rhs;
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
        if (t.value === '+') value += rhs;
        else value -= rhs;
      } else {
        break;
      }
    }
    return value;
  }

  return parseExpr();
}