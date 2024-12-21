import { it, expect } from 'vitest';
import { lastValueFrom, of } from 'rxjs';
import { parallel } from '../src';

it('default', async () => {
  const input$ = of([{ a: 1 }]);
  const output$ = input$.pipe(
    parallel(
      () => 'x',
      async v => v.a * 2
    )
  );

  const result = await lastValueFrom(output$);
  console.log('@@@', 'result ->', result);
});
