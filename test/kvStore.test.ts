import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KvStore } from '../src/memory/kvStore.js';

test('KvStore set/get/list/delete', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fastf1-mcp-'));
  const filePath = join(dir, 'memory.json');
  const store = new KvStore(filePath);

  await store.set('ns', 'a', { x: 1 });
  await store.set('ns', 'b', 'y');

  assert.deepEqual(await store.get('ns', 'a'), { x: 1 });
  assert.equal(await store.get('ns', 'b'), 'y');
  assert.equal(await store.get('ns', 'missing'), undefined);

  assert.deepEqual(await store.list('ns'), ['a', 'b']);
  assert.deepEqual(await store.list('ns', 'a'), ['a']);

  assert.equal(await store.delete('ns', 'a'), true);
  assert.equal(await store.delete('ns', 'a'), false);

  assert.deepEqual(await store.list('ns'), ['b']);
  await rm(dir, { recursive: true, force: true });
});

