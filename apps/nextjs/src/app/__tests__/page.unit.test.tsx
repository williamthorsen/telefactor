import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import HomePage from '../page.tsx';

describe('placeholder component test', () => {
  afterEach(() => cleanup()); // reset the DOM between tests

  it('renders the "Hello Next.js" heading', () => {
    render(<HomePage />);
    const headingElement = screen.getByText(/Hello Next.js/i);
    expect(headingElement).toBeInTheDocument();
  });
});
