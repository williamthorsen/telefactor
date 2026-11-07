import type { ContractClient, HarnessEntry, TelefactorClient } from '@williamthorsen/telefactor/client';
import { HarnessPicker } from '@williamthorsen/telefactor/react';
import { type ReactElement, useState } from 'react';

import { JobPanel } from './job/JobPanel.tsx';
import type { notesContract } from './notes/notes-contract.ts';
import { NotesPanel } from './notes/NotesPanel.tsx';
import { TerminalPanel } from './terminal/TerminalPanel.tsx';

/**
 * The playground page: the harness picker above the interactive terminal and the job form, all driving the same
 * client, then the shared notes.
 */
export function App({ client, notesClient }: AppProps): ReactElement {
  const [harness, setHarness] = useState<HarnessEntry>();

  return (
    <main className="stack">
      <h1>telefactor playground</h1>
      <HarnessPicker className="harness-picker" client={client} harness={harness?.name} onHarnessChange={setHarness} />
      <TerminalPanel client={client} harness={harness} />
      <JobPanel client={client} harness={harness?.name} />
      <NotesPanel client={notesClient} />
    </main>
  );
}

export interface AppProps {
  client: TelefactorClient;
  notesClient: ContractClient<typeof notesContract>;
}
