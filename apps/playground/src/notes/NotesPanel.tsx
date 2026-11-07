import type { ContractClient, StateChange } from '@williamthorsen/telefactor/client';
import type { ContractState } from '@williamthorsen/telefactor/contract';
import { RequestError, useAgentSession } from '@williamthorsen/telefactor/react';
import { type ReactElement, type SyntheticEvent, useState } from 'react';

import type { notesContract } from './notes-contract.ts';

/**
 * The notes that the page and the agent share: the list with its selection, a form that adds a note, and a status line
 * that announces each change that the agent makes.
 */
export function NotesPanel({ client }: NotesPanelProps): ReactElement {
  const { state, call, error, announcement } = useAgentSession(client, { describeChange: describeNotesChange });
  const [text, setText] = useState('');

  async function addNote(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    if (await call('addNote', { text })) setText('');
  }

  const notes = state?.notes;
  return (
    <section className="stack" aria-labelledby="notes-heading">
      <h2 id="notes-heading">Notes</h2>
      {notes !== undefined && notes.length === 0 && <p className="secondary">No notes.</p>}
      {notes !== undefined && notes.length > 0 && (
        <ul className="stack">
          {notes.map((note) => (
            <li key={note.id} className="row">
              <button
                type="button"
                className="note"
                aria-pressed={note.id === state?.selectedId}
                onClick={() => void call('selectNote', { id: note.id })}
              >
                {note.text}
              </button>
              <button
                type="button"
                aria-label={`Remove ${note.text}`}
                onClick={() => void call('removeNote', { id: note.id })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="row" onSubmit={(event) => void addNote(event)}>
        <label htmlFor="note-text">Note</label>
        <input id="note-text" value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit" disabled={text.trim() === ''}>
          Add
        </button>
      </form>
      <p className="secondary" role="status">
        {announcement !== undefined && <span key={announcement.version}>{announcement.text}</span>}
      </p>
      {error !== undefined && <RequestError error={error} />}
    </section>
  );
}

export interface NotesPanelProps {
  client: ContractClient<typeof notesContract>;
}

// region | Helpers
function describeNotesChange(change: StateChange, state: ContractState<typeof notesContract>): string {
  switch (change.action) {
    case 'addNote':
      return 'The agent added a note.';
    case 'removeNote':
      return 'The agent removed a note.';
    case 'selectNote': {
      const selected = state.notes.find((note) => note.id === state.selectedId);
      return selected === undefined ? 'The agent selected a note.' : `The agent selected ${selected.text}.`;
    }
    default:
      return `The agent ran ${change.action}.`;
  }
}
// endregion | Helpers
