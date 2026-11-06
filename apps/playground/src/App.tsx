import type { ContractClient, TelefactorClient } from '@williamthorsen/telefactor/client';
import { type ReactElement, useState } from 'react';

import { HarnessPanel } from './harness/HarnessPanel.tsx';
import { JobPanel } from './job/JobPanel.tsx';
import type { notesContract } from './notes/notes-contract.ts';
import { NotesPanel } from './notes/NotesPanel.tsx';

/** The playground page: the harness picker above the job form, both driving the same client, then the shared notes. */
export function App({ client, notesClient }: AppProps): ReactElement {
  const [harness, setHarness] = useState<string>();

  return (
    <main className="stack">
      <h1>telefactor playground</h1>
      <HarnessPanel client={client} harness={harness} onHarnessChange={setHarness} />
      <JobPanel client={client} harness={harness} />
      <NotesPanel client={notesClient} />
    </main>
  );
}

export interface AppProps {
  client: TelefactorClient;
  notesClient: ContractClient<typeof notesContract>;
}
