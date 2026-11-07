import { act, fireEvent, render, screen } from '@testing-library/react';
import { TelefactorRequestError } from '@williamthorsen/telefactor/client';
import { describe, expect, it, vi } from 'vitest';

import { createFakeNotesClient } from '#src/test-utils/create-fake-notes-client.ts';

import { NotesPanel } from '../NotesPanel.tsx';

const NOTES = {
  version: 1,
  state: {
    notes: [
      { id: 'a', text: 'First' },
      { id: 'b', text: 'Second' },
    ],
    selectedId: 'b',
  },
};

describe(NotesPanel, () => {
  it('shows the empty state from the first snapshot', () => {
    const { client } = createFakeNotesClient();

    render(<NotesPanel client={client} />);

    expect(screen.getByText('No notes.')).toBeInTheDocument();
  });

  it('renders a pushed snapshot with its selection', () => {
    const { client, push } = createFakeNotesClient();
    render(<NotesPanel client={client} />);

    act(() => push(NOTES));

    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds a note and clears the field', async () => {
    const call = vi.fn(() => Promise.resolve(NOTES));
    const { client } = createFakeNotesClient({ call });
    render(<NotesPanel client={client} />);

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Third' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await vi.waitFor(() => expect(screen.getByLabelText('Note')).toHaveValue(''));
    expect(call).toHaveBeenCalledWith('addNote', { text: 'Third' });
  });

  it('disables Add while the field is blank', () => {
    const { client } = createFakeNotesClient();
    render(<NotesPanel client={client} />);

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: '  ' } });

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('selects and removes a note by its id', () => {
    const call = vi.fn(() => Promise.resolve(NOTES));
    const { client, push } = createFakeNotesClient({ call });
    render(<NotesPanel client={client} />);
    act(() => push(NOTES));

    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Second' }));

    expect(call).toHaveBeenNthCalledWith(1, 'selectNote', { id: 'a' });
    expect(call).toHaveBeenNthCalledWith(2, 'removeNote', { id: 'b' });
  });

  it('shows why an action was refused', async () => {
    const { client, push } = createFakeNotesClient({
      call: () => Promise.reject(new TelefactorRequestError(422, 'No note has the id "a".')),
    });
    render(<NotesPanel client={client} />);
    act(() => push(NOTES));

    fireEvent.click(screen.getByRole('button', { name: 'First' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No note has the id "a".');
  });

  it('announces a change that the agent makes', () => {
    const { client, push } = createFakeNotesClient();
    render(<NotesPanel client={client} />);

    act(() => push({ ...NOTES, change: { action: 'selectNote', origin: 'agent' } }));

    expect(screen.getByRole('status')).toHaveTextContent('The agent selected Second.');
  });

  it('does not announce a change that the page makes', () => {
    const { client, push } = createFakeNotesClient();
    render(<NotesPanel client={client} />);

    act(() => push({ ...NOTES, change: { action: 'addNote', origin: 'page' } }));

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('unsubscribes when it unmounts', () => {
    const unsubscribe = vi.fn();
    const { client } = createFakeNotesClient({ subscribe: () => unsubscribe });

    render(<NotesPanel client={client} />).unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
