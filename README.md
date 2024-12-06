# recyclex.js

<p>
  <img src="https://github.com/concefly/recyclex.js/actions/workflows/ci.yml/badge.svg" alt="CI" />
  <img src="https://img.shields.io/npm/dw/recyclex.js" alt="npm" />
  <img src="https://img.shields.io/npm/v/recyclex.js" alt="npm" />
</p>

A reactive cycle manager.

- Responsive property and lifecycle management
- Rxjs based

## Install

```bash
npm install recyclex.js --save
```

## Usage

```typescript
import { defineComponent, blueprint, defineContext, IComponentInstance } from 'recyclex.js';

const MyContext = defineContext<number>('MyContext');

const MyComponent = defineComponent({
  defaultProps: { text: '' },
  setup(ctx) {
    ctx.createContext(MyContext, 42);

    ctx.P.text$.subscribe(text => {
      console.log('Text updated:', text);
    });

    return ctx
      .select([ctx.P.text$])
      .pipe(
        map(([text]) => [
          blueprint(ChildComponent, { text: text + '_1' }, 'child1'),
          blueprint(ChildComponent, { text: text + '_2' }, 'child2'),
          blueprint(ChildComponent, { text: text + '_3' }, 'child3'),
        ])
      );
  },
});

const ChildComponent = defineComponent({
  defaultProps: { text: '' },
  setup(ctx) {
    ctx.P.text$.subscribe(text => {
      console.log('Child text:', text);
    });
  },
});

const instance = MyComponent.create('root', { text: 'Hello' });
instance.update({ text: 'World' });
instance.dispose();
```

## API

### `defineComponent`

```typescript
import { defineComponent } from 'recyclex.js';

const MyComponent = defineComponent({
  defaultProps: { text: '' },
  setup(ctx) {
    // setup logic
  },
});
```

### `blueprint`

```typescript
import { blueprint } from 'recyclex.js';

const bp = blueprint(MyComponent, { text: 'Hello' }, 'myKey');
```

### `defineContext`

```typescript
import { defineContext } from 'recyclex.js';

const MyContext = defineContext<number>('MyContext');
```
