// pnpm dev:mock — runs the mock daemon and Vite together, pointing the app at the mock.
import { spawn } from 'node:child_process';

const port = process.env.MOCK_PORT ?? '8787';
const run = (cmd, args, env = {}) =>
  spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });

const children = [
  run('node', ['mock/server.js'], { MOCK_PORT: port }),
  run('npx', ['vite'], { VITE_API_URL: `http://localhost:${port}` }),
];
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', stop));
