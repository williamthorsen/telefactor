import { describe, expect, it } from 'vitest';

import { formatReport, parseRegistryEntries, parseRepoResponse } from '../repo-settings.ts';

describe(formatReport, () => {
  it('renders one aligned row per repo, with n/a for unreported secret-scanning settings and the error for an unreadable repo', () => {
    const report = formatReport([
      {
        repo: 'owner/public',
        settings: {
          visibility: 'public',
          dependencyGraph: true,
          dependabotAlerts: false,
          securityUpdates: false,
          secretScanning: true,
          pushProtection: false,
        },
      },
      {
        repo: 'owner/private',
        settings: {
          visibility: 'private',
          dependencyGraph: false,
          dependabotAlerts: true,
          securityUpdates: true,
          secretScanning: undefined,
          pushProtection: undefined,
        },
      },
      { repo: 'owner/broken', error: 'HTTP 403' },
    ]);

    expect(report.split('\n')).toEqual([
      'Repository     Visibility  Dependency graph  Dependabot alerts  Security updates  Secret scanning  Push protection',
      'owner/public   public      on                off                off               on               off',
      'owner/private  private     off               on                 on                n/a              n/a',
      'owner/broken   error: HTTP 403',
    ]);
  });

  it('widens the repository column for an error row with the longest slug, without widening the setting columns', () => {
    const report = formatReport([
      {
        repo: 'owner/short',
        settings: {
          visibility: 'public',
          dependencyGraph: true,
          dependabotAlerts: true,
          securityUpdates: true,
          secretScanning: true,
          pushProtection: true,
        },
      },
      { repo: 'owner/a-much-longer-unreadable-repo', error: 'HTTP 403' },
    ]);

    expect(report.split('\n')).toEqual([
      'Repository                           Visibility  Dependency graph  Dependabot alerts  Security updates  Secret scanning  Push protection',
      'owner/short                          public      on                on                 on                on               on',
      'owner/a-much-longer-unreadable-repo  error: HTTP 403',
    ]);
  });
});

describe(parseRegistryEntries, () => {
  it('returns each entry with its name and declared slug', () => {
    const content = JSON.stringify({
      repos: [
        { name: 'one', path: '~/repos/one', repo: 'owner/one', tags: ['live'], stack: ['nmr'] },
        { name: 'two', path: '~/repos/two' },
      ],
    });

    expect(parseRegistryEntries(content)).toEqual([{ name: 'one', repo: 'owner/one' }, { name: 'two' }]);
  });

  it('throws when the registry has no repos array', () => {
    expect(() => parseRegistryEntries('{}')).toThrow(/"repos" array/);
  });
});

describe(parseRepoResponse, () => {
  it('reads visibility and each secret-scanning status, enabled as on and disabled as off', () => {
    const payload = {
      visibility: 'public',
      security_and_analysis: {
        secret_scanning: { status: 'enabled' },
        secret_scanning_push_protection: { status: 'disabled' },
      },
    };

    expect(parseRepoResponse(payload)).toEqual({ visibility: 'public', secretScanning: true, pushProtection: false });
  });

  it('leaves the secret-scanning settings undefined when the response omits security_and_analysis', () => {
    expect(parseRepoResponse({ visibility: 'private', security_and_analysis: null })).toEqual({
      visibility: 'private',
      secretScanning: undefined,
      pushProtection: undefined,
    });
  });

  it('throws when the response has no visibility', () => {
    expect(() => parseRepoResponse({})).toThrow(/visibility/);
  });
});
