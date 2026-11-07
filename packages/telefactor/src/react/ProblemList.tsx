import type { ReactElement } from 'react';

import type { Problem } from '#src/schemas/problem.ts';

/** A list of the problems that the routes reported, each prefixed with the path that it concerns. */
export function ProblemList({ problems }: ProblemListProps): ReactElement {
  return (
    <ul>
      {problems.map((problem) => (
        <li key={`${problem.path}:${problem.message}`}>
          {problem.path === '' ? problem.message : `${problem.path}: ${problem.message}`}
        </li>
      ))}
    </ul>
  );
}

export interface ProblemListProps {
  problems: Problem[];
}
