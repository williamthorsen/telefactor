import type { TelefactorClient } from '@williamthorsen/telefactor/client';
import { type ReactElement, useState } from 'react';

import { HarnessPanel } from './harness/HarnessPanel.tsx';
import { JobPanel } from './job/JobPanel.tsx';

/** The playground page: the harness picker above the job form, both driving the same client. */
export function App({ client }: AppProps): ReactElement {
  const [harness, setHarness] = useState<string>();

  return (
    <main className="stack">
      <h1>telefactor playground</h1>
      <HarnessPanel client={client} harness={harness} onHarnessChange={setHarness} />
      <JobPanel client={client} harness={harness} />
    </main>
  );
}

export interface AppProps {
  client: TelefactorClient;
}
