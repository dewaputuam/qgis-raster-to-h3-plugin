import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
