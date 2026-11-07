// Reads the file named by the first argument and writes it, uppercased, to the file named by the second, after waiting
// the milliseconds given as the third. Exits with the code given as the fourth.
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const [inputPath = '', outputPath = '', delay = '0', code = '0'] = process.argv.slice(2);
await setTimeout(Number(delay));
await writeFile(outputPath, (await readFile(inputPath, 'utf8')).toUpperCase());
process.stderr.write('wrote output\n');
process.exitCode = Number(code);
