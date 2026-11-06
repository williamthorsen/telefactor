import { defineContract } from '@williamthorsen/telefactor/contract';
import { z } from 'zod';

const noteIdSchema = z.object({ id: z.string() });

/** The playground's session state, a list of notes with one optionally selected, shared by the page and the agent. */
export const notesContract = defineContract({
  state: z.object({
    notes: z.array(z.object({ id: z.string(), text: z.string() })),
    selectedId: z.string().optional(),
  }),
  actions: {
    addNote: {
      description: 'Adds a note with the given text to the end of the list. The new note is not selected.',
      input: z.object({ text: z.string().refine((value) => value.trim() !== '', 'Enter the text of the note') }),
    },
    removeNote: {
      description: 'Removes the note with the given id, clearing the selection if it was selected.',
      input: noteIdSchema,
    },
    selectNote: { description: 'Selects the note with the given id.', input: noteIdSchema },
  },
});
