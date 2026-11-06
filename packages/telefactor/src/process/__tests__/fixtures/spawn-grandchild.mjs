// Starts a grandchild in the same process group, writes its pid to the file given as the first argument, and waits.
// With `ignore-term` as the second argument, both processes ignore SIGTERM.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [pidPath, mode] = process.argv.slice(2);
const ignoreTerm = mode === 'ignore-term';
const grandchildSource = ignoreTerm
  ? "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"
  : 'setInterval(() => {}, 1000);';
const grandchild = spawn(process.execPath, ['--eval', grandchildSource], { stdio: 'ignore' });
if (ignoreTerm) process.on('SIGTERM', () => {});
writeFileSync(pidPath, String(grandchild.pid));
setInterval(() => {}, 1000);
