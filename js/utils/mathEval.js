/**
 * Evaluador matemático seguro y preciso para Dolarfy.
 * Reemplaza el uso de eval() y new Function() en la calculadora.
 * Soporta + - * / (y símbolos ÷ × −), paréntesis, multiplicación implícita,
 * decimales con coma o punto, separadores de miles (1.000,50 / 1,234.56),
 * notación científica y previene divisiones por cero.
 */

function parseLocalizedNumber(rawToken) {
  let s = rawToken.trim();
  if (!s || s === '.' || s === ',') return 0;

  // Manejo de notación científica (ej: 1.5e+6 o 1,5e6)
  if (/e/i.test(s)) {
    const normalizedSci = s.replace(/,/g, '.');
    const n = Number(normalizedSci);
    if (isNaN(n)) {
      throw new Error(`Número inválido: ${rawToken}`);
    }
    return n;
  }

  const dotCount = (s.match(/\./g) || []).length;
  const commaCount = (s.match(/,/g) || []).length;

  if (dotCount > 0 && commaCount > 0) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Formato es-VE: 1.000,50 -> puntos son miles, coma es decimal
      if (commaCount > 1) throw new Error(`Número inválido: ${rawToken}`);
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato en-US: 1,234.56 -> comas son miles, punto es decimal
      if (dotCount > 1) throw new Error(`Número inválido: ${rawToken}`);
      s = s.replace(/,/g, '');
    }
  } else if (commaCount > 1) {
    // Múltiples comas sin puntos: solo válido si son grupos exactos de miles (1,000,000)
    if (/^\d{1,3}(,\d{3})+$/.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      throw new Error(`Número inválido: ${rawToken}`);
    }
  } else if (dotCount > 1) {
    // Múltiples puntos sin comas: solo válido si son grupos exactos de miles (1.000.000)
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    } else {
      throw new Error(`Número inválido: ${rawToken}`);
    }
  } else if (commaCount === 1) {
    s = s.replace(',', '.');
  }

  const num = parseFloat(s);
  if (isNaN(num)) {
    throw new Error(`Número inválido: ${rawToken}`);
  }
  return num;
}

function tokenize(expr) {
  const normalized = expr
    .replace(/÷/g, '/')
    .replace(/×/g, '*')
    .replace(/−/g, '-');

  const rawTokens = [];
  let i = 0;
  const n = normalized.length;

  while (i < n) {
    const ch = normalized[i];

    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    if (ch === '(' || ch === ')' || ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      rawTokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if ((ch >= '0' && ch <= '9') || ch === ',' || ch === '.') {
      let j = i;
      while (j < n) {
        const c = normalized[j];
        if ((c >= '0' && c <= '9') || c === ',' || c === '.') {
          j++;
          continue;
        }
        if ((c === 'e' || c === 'E') && j > i) {
          j++;
          if (j < n && (normalized[j] === '+' || normalized[j] === '-')) {
            j++;
          }
          continue;
        }
        break;
      }
      const raw = normalized.slice(i, j);
      const num = parseLocalizedNumber(raw);
      rawTokens.push({ type: 'num', value: num });
      i = j;
      continue;
    }

    throw new Error(`Carácter inesperado: ${ch}`);
  }

  // Insertar multiplicación implícita: 2(3+4) -> 2 * (3+4), (2+3)(4+5) -> (2+3) * (4+5), (2+3)4 -> (2+3) * 4
  const tokens = [];
  for (let k = 0; k < rawTokens.length; k++) {
    const curr = rawTokens[k];
    if (tokens.length > 0) {
      const prev = tokens[tokens.length - 1];
      const isPrevValue = prev.type === 'num' || (prev.type === 'op' && prev.value === ')');
      const isCurrValue = curr.type === 'num' || (curr.type === 'op' && curr.value === '(');
      if (isPrevValue && isCurrValue) {
        tokens.push({ type: 'op', value: '*' });
      }
    }
    tokens.push(curr);
  }

  return tokens;
}

export function evaluateMath(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') return 0;

  const tokens = tokenize(expr.trim());
  if (tokens.length === 0) return 0;

  // Ignorar operadores binarios colgantes al final mientras el usuario escribe en vivo (ej. "10 + ")
  while (
    tokens.length > 1 &&
    tokens[tokens.length - 1].type === 'op' &&
    ['+', '-', '*', '/'].includes(tokens[tokens.length - 1].value)
  ) {
    tokens.pop();
  }

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
      const close = peek();
      if (close && close.type === 'op' && close.value === ')') {
        next();
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
