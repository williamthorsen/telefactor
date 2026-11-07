import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import '@testing-library/jest-dom/vitest';

// Testing Library unmounts after each test on its own only when Vitest's globals are enabled.
afterEach(cleanup);

// xterm needs a canvas, which jsdom lacks, and every component from the package's `./react` entry reaches it.
vi.mock('@williamthorsen/terminal-react', () => ({ Terminal: () => null }));
vi.mock('@williamthorsen/terminal-react/styles.css', () => ({}));
