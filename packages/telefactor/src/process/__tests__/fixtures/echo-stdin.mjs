// Echoes stdin to stdout, writes a line to stderr, and exits with the code given as the first argument.
import { text } from 'node:stream/consumers';

const input = await text(process.stdin);
process.stdout.write(input);
process.stderr.write('stderr line\n');
process.exitCode = Number(process.argv[2] ?? 0);
