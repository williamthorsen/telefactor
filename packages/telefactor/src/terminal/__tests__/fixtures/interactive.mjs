// Reports its grandchild's pid, its grid width, and its arguments, echoes each input chunk, and reports each resize.
import { spawn } from 'node:child_process';

const grandchild = spawn('sleep', ['60'], { stdio: 'ignore' });
process.stdout.write(
  `ready pid=${grandchild.pid} cols=${process.stdout.columns} args=${process.argv.slice(2).join(' ')}\r\n`,
);
process.stdout.on('resize', () => {
  process.stdout.write(`cols=${process.stdout.columns}\r\n`);
});
process.stdin.setRawMode(true);
process.stdin.on('data', (chunk) => {
  process.stdout.write(`got:${chunk.toString('utf8')}\r\n`);
  if (chunk.toString('utf8') === 'exit') process.exit(7);
});
