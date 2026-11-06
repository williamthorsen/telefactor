import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

// Testing Library unmounts after each test on its own only when Vitest's globals are enabled.
afterEach(cleanup);
