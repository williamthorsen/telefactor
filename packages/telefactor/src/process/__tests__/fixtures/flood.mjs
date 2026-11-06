// Writes the number of bytes given as the first argument to stdout, then waits to be stopped.
process.stdout.write('x'.repeat(Number(process.argv[2])));
setInterval(() => {}, 1000);
