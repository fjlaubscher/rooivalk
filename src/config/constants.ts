import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directory where config markdown files are located (relative to dist or src)
export const CONFIG_DIR = join(__dirname, '..', '..', 'config');
