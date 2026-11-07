import { type ReactElement, useEffect, useId, useRef, useState } from 'react';

import type { TelefactorClient } from '#src/client/create-telefactor-client.ts';
import type { HarnessEntry, HarnessList, HarnessTestResult } from '#src/http/route-schemas.ts';

import { ProblemList } from './ProblemList.tsx';
import { RequestError } from './RequestError.tsx';

/**
 * The harness picker and its test button. Reports the default harness's entry once the list loads, and `undefined`
 * while no harness can run, as when the config file has problems.
 */
export function HarnessPicker({ client, harness, onHarnessChange, className }: HarnessPickerProps): ReactElement {
  const [list, setList] = useState<HarnessList>();
  const [listError, setListError] = useState<unknown>();
  const [testResult, setTestResult] = useState<HarnessTestResult>();
  const [testError, setTestError] = useState<unknown>();
  const [isTesting, setIsTesting] = useState(false);
  const onHarnessChangeRef = useRef(onHarnessChange);
  const selectId = useId();

  // Read the latest callback at each commit, so that a new identity does not reload the list.
  useEffect(() => {
    onHarnessChangeRef.current = onHarnessChange;
  });

  useEffect(() => {
    let isCurrent = true;
    async function loadHarnesses(): Promise<void> {
      try {
        const loaded = await client.listHarnesses();
        if (!isCurrent) return;
        setList(loaded);
        onHarnessChangeRef.current(
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
  }, [client]);

  if (listError !== undefined) return <RequestError className={className} error={listError} />;
  if (list === undefined) return <p className={className}>Loading harnesses…</p>;
  if (!('harnesses' in list)) {
    return (
      <div className={className} role="alert">
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
    <div className={className}>
      <div>
        <label htmlFor={selectId}>Harness</label>
        <select
          id={selectId}
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
      {selected?.testable === false && <p>This harness does not define a test command.</p>}
      {isTesting && <p>Testing…</p>}
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

export interface HarnessPickerProps {
  client: TelefactorClient;
  /** The selected harness's name, or `undefined` before the list loads. */
  harness: string | undefined;
  onHarnessChange: (harness: HarnessEntry | undefined) => void;
  className?: string | undefined;
}
