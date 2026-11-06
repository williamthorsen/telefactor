import type { Problem } from '@williamthorsen/telefactor/client';
import type { ReactElement } from 'react';

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
