import { checkTestFileConventions } from '@williamthorsen/nmr/tests';

// Fails the run on a test file outside `__tests__/` or one whose tier segment is missing or misspelt, anywhere in the
// repo.
checkTestFileConventions();
