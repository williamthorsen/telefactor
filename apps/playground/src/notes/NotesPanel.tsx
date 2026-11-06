import type { ContractClient, ContractSnapshot } from '@williamthorsen/telefactor/client';
import { type ReactElement, type SyntheticEvent, useEffect, useState } from 'react';

import { RequestError } from '#src/requests/RequestError.tsx';

import type { notesContract } from './notes-contract.ts';

/** The notes that the page and the agent share: the list with its selection, and a form that adds a note. */
export function NotesPanel({ client }: NotesPanelProps): ReactElement {
  const [snapshot, setSnapshot] = useState<ContractSnapshot<typeof notesContract>>();
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>();

  useEffect(
    () =>
      client.subscribe(
        (next) => {
          setSnapshot(next);
          setError(undefined);
        },
        { onError: setError },
      ),
    [client],
  );

  async function addNote(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    if (await call(() => client.call('addNote', { text }))) setText('');
  }

  /** Runs an action and reports whether it succeeded; the stream delivers the snapshot that it commits. */
  async function call(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      setError(undefined);
      return true;
    } catch (callError: unknown) {
      setError(callError);
      return false;
    }
  }

  const notes = snapshot?.state.notes;
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
                aria-pressed={note.id === snapshot?.state.selectedId}
                onClick={() => void call(() => client.call('selectNote', { id: note.id }))}
              >
                {note.text}
              </button>
              <button
                type="button"
                aria-label={`Remove ${note.text}`}
                onClick={() => void call(() => client.call('removeNote', { id: note.id }))}
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
      {error !== undefined && <RequestError error={error} />}
    </section>
  );
}

export interface NotesPanelProps {
  client: ContractClient<typeof notesContract>;
}
