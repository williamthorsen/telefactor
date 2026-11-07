// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TelefactorRequestError } from '#src/client/telefactor-request-error.ts';

import { RequestError } from '../RequestError.tsx';

afterEach(cleanup);

describe(RequestError, () => {
  it("shows a refused request's message and its problems", () => {
    const error = new TelefactorRequestError(400, 'Enter a prompt.', [
      { path: 'prompt', message: 'Enter a prompt.' },
      { path: '', message: 'The body is empty.' },
    ]);

    render(<RequestError error={error} />);

    expect(screen.getByRole('alert').textContent).toContain('Enter a prompt.');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toStrictEqual([
      'prompt: Enter a prompt.',
      'The body is empty.',
    ]);
  });

  it('shows the message of a plain error without a list', () => {
    render(<RequestError error={new Error('Network down.')} />);

    expect(screen.getByRole('alert').textContent).toBe('Network down.');
    expect(screen.queryByRole('list')).toBeNull();
  });
});
