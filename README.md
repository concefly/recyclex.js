# recyclex.js

<p>
  <img src="https://github.com/concefly/recyclex.js/actions/workflows/ci.yml/badge.svg" alt="CI" />
  <img src="https://img.shields.io/npm/dw/recyclex.js" alt="npm" />
  <img src="https://img.shields.io/npm/v/recyclex.js" alt="npm" />
</p>

A reactive cycle manager.

- Responsive property and lifecycle management
- Zero dependencies

## Install

```bash
npm install recyclex.js --save
```

## Usage

```javascript
import { Component, Blueprint, Register } from 'recyclex.js';

@Register('Foo')
class Foo extends Component {
  @Reactive() text = '';

  override onUpdate() {
    return [
      Blueprint.of('Bar', { text: this.text + '_1' }),
      Blueprint.of('Bar', { text: this.text + '_2' }),
      Blueprint.of('Bar', { text: this.text + '_3' }),
    ];
  }
}

@Register('Bar')
class Bar extends Component {
  @Reactive() text = '';

  override onUpdate() {
    console.log(this.text);
  }
}

const host = new Host('Foo');
host.flush({ text: 'Hello' });
host.destroy();
```

## API

### `Component`

#### `override onInit() {...}`

Called when the component is initialized.

#### `override onBeforeUpdate() {...}`

Called before the component is updated.

#### `override onUpdate() {...}`

Called when the component is updated.

if the return value is an array of `Blueprint`, the children will be **init or update or destroy** according to the return value, just like the react's `render` method.

It means:

- If the child is **NEW**, it will be initialized.
- If the child is **EXIST**, it will be updated.
- If the child is **NOT EXIST** anymore, it will be destroyed.

**NOTE**: The return item is `Blueprint`, so:

- Class must be registered.
- Class will not be initialized, updated or destroyed immediately, but will be added to the update queue, and managed internally.

#### `override onAfterUpdate() {...}`

Called after the component is updated.

- If there is children, it will be called after all children are updated.

#### `override onDestroy() {...}`

Called when the component is destroyed.

- If there is children, it will be called after all children are destroyed.

#### `this._changes: Map<string, any>`

A map of changes that have occurred in the component.

- Key: property name
- Value: old value

It will be reload before `onBeforeUpdate` is called.

### `Register()`

Register the class.

```javascript
import { Register, Component, ComponentRegistry } from 'recyclex.js';

// Register to the default registry
@Register('Foo')
class Foo extends Component {
  // ...
}

// Register to the custom registry
const myRegistry = new ComponentRegistry();
@Register('Bar', myRegistry)
class Bar extends Component {
  // ...
}
```

### `Blueprint()`

Create a blueprint.

```javascript
import { Blueprint } from 'recyclex.js';

// Foo is already registered
const blueprint = Blueprint.of('Foo', { text: 'Hello' });
```

### `Host()`

Create a host.

```javascript
import { Host } from 'recyclex.js';

// Foo is already registered
const host = new Host('Foo');

// Flush the host with props
host.flush({ text: 'Hello' });

// Destroy the host
host.destroy();
```

### `Reactive()`

Make the property reactive.

- If the property is set to a new value, the component will go through the update cycle.

```javascript
import { Reactive } from 'recyclex.js';

class Foo {
  @Reactive() text = '';
  @Reactive() count = 0;
}
```
