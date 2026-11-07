import type { HarnessList, HarnessTestResult, TelefactorClient } from '@williamthorsen/telefactor/client';
import { type ReactElement, useEffect, useState } from 'react';

import { ProblemList } from '#src/requests/ProblemList.tsx';
import { RequestError } from '#src/requests/RequestError.tsx';

/** A harness as the list describes it. */
export type HarnessEntry = Extract<HarnessList, { harnesses: unknown }>['harnesses'][number];

/**
 * The harness picker and its test button. Reports the default harness's entry once the list loads, and `undefined`
 * while no harness can run, as when the config file has problems.
 */
export function HarnessPanel({ client, harness, onHarnessChange }: HarnessPanelProps): ReactElement {
  const [list, setList] = useState<HarnessList>();
  const [listError, setListError] = useState<unknown>();
  const [testResult, setTestResult] = useState<HarnessTestResult>();
  const [testError, setTestError] = useState<unknown>();
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    async function loadHarnesses(): Promise<void> {
      try {
        const loaded = await client.listHarnesses();
        if (!isCurrent) return;
        setList(loaded);
        onHarnessChange(
          'harnesses' in loaded ? loaded.harnesses.find(({ name }) => name === loaded.defaultHarness) : undefined,
        );
      } catch (error: unknown) {
        if (isCurrent) setListError(error);
      }
    }
    void loadHarnesses();
    return () => {
      isCurrent = false;
    };
  }, [client, onHarnessChange]);

  if (listError !== undefined) return <RequestError error={listError} />;
  if (list === undefined) return <p className="secondary">Loading harnesses…</p>;
  if (!('harnesses' in list)) {
    return (
      <div className="alert" role="alert">
        <p>The config file {list.configPath} cannot be used. Fix these problems, then reload the page:</p>
        <ProblemList problems={list.problems} />
      </div>
    );
  }

  const { harnesses } = list;
  const selected = harnesses.find((candidate) => candidate.name === harness);

  function selectHarness(name: string): void {
    setTestResult(undefined);
    setTestError(undefined);
    onHarnessChange(harnesses.find((candidate) => candidate.name === name));
  }

  async function testHarness(name: string): Promise<void> {
    if (isTesting) return;
    setIsTesting(true);
    setTestResult(undefined);
    setTestError(undefined);
    try {
      setTestResult(await client.testHarness(name));
    } catch (error: unknown) {
      setTestError(error);
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <label htmlFor="harness">Harness</label>
        <select
          id="harness"
          disabled={isTesting}
          value={harness ?? ''}
          onChange={(event) => selectHarness(event.target.value)}
        >
          {harnesses.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={selected?.testable !== true}
          aria-disabled={isTesting}
          onClick={() => selected && void testHarness(selected.name)}
        >
          Test
        </button>
      </div>
      {selected?.testable === false && <p className="secondary">This harness does not define a test command.</p>}
      {isTesting && <p className="secondary">Testing…</p>}
      {testResult !== undefined && (
        <div>
          <p>
            {testResult.ok ? 'Test passed' : 'Test failed'}: {testResult.exit}, in {testResult.durationMs} ms.
          </p>
          {testResult.output !== '' && <pre>{testResult.output}</pre>}
        </div>
      )}
      {testError !== undefined && <RequestError error={testError} />}
    </div>
  );
}

export interface HarnessPanelProps {
  client: TelefactorClient;
  /** The selected harness's name, or `undefined` before the list loads. */
  harness: string | undefined;
  /** Must keep a stable identity, because the list reloads whenever it changes. */
  onHarnessChange: (harness: HarnessEntry | undefined) => void;
}
