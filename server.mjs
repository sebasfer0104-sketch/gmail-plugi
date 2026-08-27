// ESM wrapper para el bundle CJS del plugin Gmail
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('./server.cjs');
