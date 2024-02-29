# tiny-symbol-solver

<p>
  <img src="https://github.com/solidx-js/tiny-symbol-solver/actions/workflows/ci.yml/badge.svg" alt="CI" />
  <img src="https://img.shields.io/npm/dw/tiny-symbol-solver" alt="npm" />
  <img src="https://img.shields.io/npm/v/tiny-symbol-solver" alt="npm" />
</p>

A symbol solver.

- Define symbols and expressions.
- Solve a symbol.
- Get dependencies and effects of a symbol.

## Install

```bash
npm install tiny-symbol-solver --save
```

## Usage

```javascript
import { Solver } from 'tiny-symbol-solver';

const solver = new Solver();
solver.define('a = 1');
solver.define('b = 2');
solver.define('c = a + b');

console.log(solver.solve('c')); // 3
```

## API

### Solver

A class that represents a symbol solver.

```javascript
import { Solver } from 'tiny-symbol-solver';
const solver = new Solver();
```

#### solver.define()

Defines a symbol or an expression.

```javascript
solver.define('a = 1');
solver.define('power2(x) = x * x');
solver.define('c = a + power2(3)');

console.log(solver.solve('c')); // 10
```

You can also define symbols with a native number or function.

```javascript
solver.define('a', 1); // a = 1
solver.define('power2', x => x * x);
solver.define('sin', Math.sin);
```

#### solver.solve()

Solves a symbol.

```javascript
const result = solver.solve('c');
```

**NOTE**: If the symbol is not defined, it will throw an error.

#### solver.deps(), solver.effects()

- `solver.deps(sym)`: Returns a list of dependencies for a symbol.
- `solver.effects(sym)`: Returns a list of symbols that depend on a symbol.

```javascript
/**
 * make a dependency graph
 * a
 * | \
 * b  c
 * | \| \
 * d  e  f
 */
solver.define('a = 1');
solver.define('b = a + 1');
solver.define('c = a + 2');
solver.define('d = b + 3');
solver.define('e = b + c');
solver.define('f = c + 4');

solver.deps('a'); // []
solver.deps('b'); // ['a']
solver.deps('c'); // ['a']
solver.deps('d'); // ['a', 'b']
solver.deps('e'); // ['a', 'b', 'c']
solver.deps('f'); // ['a', 'c']

solver.effects('a'); // ['b', 'c', 'd', 'e', 'f']
solver.effects('b'); // ['d', 'e']
solver.effects('c'); // ['e', 'f']
solver.effects('d'); // []
solver.effects('e'); // []
solver.effects('f'); // []
```

#### solver.events

Listen to events.

event types:

- `solve`: when a symbol is solved.
  - `ev.sym`: the symbol key.

```javascript
solver.events.listen('solve', ev => {
  console.log(`solved: ${ev.sym}`);
});
```
