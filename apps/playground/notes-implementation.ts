import { implementContract } from '@williamthorsen/telefactor/server';

import { notesContract } from './src/notes/notes-contract.ts';

/** The server side of the notes contract, starting from an empty list; the page never imports it. */
export const notesImplementation = implementContract(notesContract, {
  initialState: { notes: [] },
  handlers: {
    addNote: (state, { text }) => ({
      ...state,
      notes: [...state.notes, { id: crypto.randomUUID(), text: text.trim() }],
    }),
    removeNote: (state, { id }) => {
      requireNote(state.notes, id);
      const notes = state.notes.filter((note) => note.id !== id);
      return state.selectedId === id ? { notes } : { ...state, notes };
    },
    selectNote: (state, { id }) => {
      requireNote(state.notes, id);
      return { ...state, selectedId: id };
    },
  },
});

// region | Helpers
function requireNote(notes: readonly { id: string }[], id: string): void {
  if (notes.every((note) => note.id !== id)) throw new Error(`No note has the id "${id}".`);
}
// endregion | Helpers
