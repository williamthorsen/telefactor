import type { HarnessEntry, TelefactorClient } from '@williamthorsen/telefactor/client';
import { HarnessTerminal } from '@williamthorsen/telefactor/react';
import type { ReactElement } from 'react';

import '@williamthorsen/terminal-react/styles.css';

/** The colours of the terminal, whose ratios the stylesheet's header records. */
const TERMINAL_THEME = { background: '#1b1f24', foreground: '#e6edf3', cursor: '#e6edf3' };

/** The selected harness's interactive session, offered only for a harness that defines an interactive command. */
export function TerminalPanel({ client, harness }: TerminalPanelProps): ReactElement {
  return (
    <section className="stack" aria-label="Terminal">
      <h2>Terminal</h2>
      <HarnessTerminal
        className="terminal-panel stack"
        client={client}
        harness={harness?.name}
        unavailableReason={describeUnavailability(harness)}
        theme={TERMINAL_THEME}
      />
    </section>
  );
}

export interface TerminalPanelProps {
  client: TelefactorClient;
  /** The selected harness, or `undefined` while none can run. */
  harness: HarnessEntry | undefined;
}

// region | Helpers
function describeUnavailability(harness: HarnessEntry | undefined): string | undefined {
  if (harness === undefined) return 'Choose a harness to start a session.';
  return harness.interactive ? undefined : 'This harness has no interactive recipe.';
}
// endregion | Helpers
