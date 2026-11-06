import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXTENSION_CONSTANTS } from '#src/config.ts';

import { showMessage } from '../showMessage.ts';

const SCRIPT_NAME = 'test-script';

afterEach(() => {
  vi.restoreAllMocks();
});

describe(showMessage, () => {
  it('groups the prefixed message and logs the data at the chosen level when data is given', () => {
    const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    const groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const data = { key: 'value' };

    showMessage({ data, message: 'hello', scriptName: SCRIPT_NAME });

    expect(groupSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${EXTENSION_CONSTANTS.extensionName} (${SCRIPT_NAME})`),
    );
    expect(infoSpy).toHaveBeenCalledWith(data);
    expect(groupEndSpy).toHaveBeenCalledOnce();
  });

  it('logs one prefixed line at the chosen level without grouping when data is absent', () => {
    const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    showMessage({ message: 'hello', scriptName: SCRIPT_NAME });

    expect(infoSpy).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(`${EXTENSION_CONSTANTS.extensionName} (${SCRIPT_NAME}) | hello`),
    );
    expect(groupSpy).not.toHaveBeenCalled();
  });

  it('logs through console.warn when the log level is warn', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    showMessage({ logLevel: 'warn', message: 'careful', scriptName: SCRIPT_NAME });

    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('careful'));
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
