import { createStateStore } from '@williamthorsen/telefactor/server';
import { describe, expect, it } from 'vitest';

import { notesImplementation } from '../notes-implementation.ts';

describe('notesImplementation', () => {
  it('adds a trimmed note with an id, without selecting it', async () => {
    const store = createStateStore(notesImplementation);

    const outcome = await store.run('addNote', { text: '  Buy milk ' });

    expect(outcome).toMatchObject({
      ok: true,
      snapshot: { state: { notes: [{ id: expect.any(String), text: 'Buy milk' }] } },
    });
    expect(outcome.ok && outcome.snapshot.state).not.toHaveProperty('selectedId');
  });

  it('refuses a blank note', async () => {
    const store = createStateStore(notesImplementation);

    expect(await store.run('addNote', { text: ' ' })).toMatchObject({ ok: false, reason: 'invalid-input' });
  });

  it('selects a note, and clears the selection when it removes that note', async () => {
    const { store, id } = await createStoreWithNote();

    expect(await store.run('selectNote', { id })).toMatchObject({ ok: true, snapshot: { state: { selectedId: id } } });
    expect(await store.run('removeNote', { id })).toStrictEqual({
      ok: true,
      snapshot: { version: 3, state: { notes: [] } },
    });
  });

  it('keeps the selection when it removes another note', async () => {
    const { store, id } = await createStoreWithNote();
    await store.run('addNote', { text: 'Other' });
    await store.run('selectNote', { id });
    const other = noteIds(store)[1] ?? '';

    expect(await store.run('removeNote', { id: other })).toMatchObject({
      ok: true,
      snapshot: { state: { selectedId: id } },
    });
  });

  it.each(['selectNote', 'removeNote'])('refuses %s for an id that does not exist', async (name) => {
    const store = createStateStore(notesImplementation);

    expect(await store.run(name, { id: 'missing' })).toStrictEqual({
      ok: false,
      reason: 'handler-failed',
      message: 'No note has the id "missing".',
    });
  });
});

// region | Helpers
async function createStoreWithNote() {
  const store = createStateStore(notesImplementation);
  await store.run('addNote', { text: 'Note' });
  return { store, id: noteIds(store)[0] ?? '' };
}

function noteIds(store: ReturnType<typeof createStateStore>): string[] {
  const parsed = notesImplementation.contract.state.parse(store.read().state);
  return parsed.notes.map((note) => note.id);
}
// endregion | Helpers
