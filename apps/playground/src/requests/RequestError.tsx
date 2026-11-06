import { TelefactorRequestError } from '@williamthorsen/telefactor/client';
import type { ReactElement } from 'react';

import { ProblemList } from './ProblemList.tsx';

/** An alert that shows why a request failed, with the problems that the routes reported. */
export function RequestError({ error }: RequestErrorProps): ReactElement {
  const problems = error instanceof TelefactorRequestError ? error.problems : [];
  return (
    <div className="alert" role="alert">
      <p>{error instanceof Error ? error.message : String(error)}</p>
      {problems.length > 0 && <ProblemList problems={problems} />}
    </div>
  );
}

export interface RequestErrorProps {
  error: unknown;
}
