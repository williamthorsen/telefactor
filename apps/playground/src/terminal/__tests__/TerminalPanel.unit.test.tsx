import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createFakeClient, HARNESS_LIST } from '#src/test-utils/create-fake-client.ts';

import { TerminalPanel } from '../TerminalPanel.tsx';

const [claudeCode, codex] = HARNESS_LIST.harnesses;

describe(TerminalPanel, () => {
  it('offers a session for a harness with an interactive command', () => {
    render(<TerminalPanel client={createFakeClient()} harness={claudeCode} />);

    expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled();
  });

  it.each([
    ['a harness without an interactive command', codex, 'This harness has no interactive recipe.'],
    ['no harness', undefined, 'Choose a harness to start a session.'],
  ])('offers no session for %s', (_case, harness, message) => {
    render(<TerminalPanel client={createFakeClient()} harness={harness} />);

    expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
