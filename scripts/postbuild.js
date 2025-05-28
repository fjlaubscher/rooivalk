import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const src = path.join(__dirname, '..', 'config');
const dest = path.join(__dirname, '..', 'dist', 'config');

function copyConfigs() {
  if (!fs.existsSync(src)) {
    console.error(`[postbuild] Source config directory not found: ${src}`);
    process.exit(1);
  }

  // Remove destination if it exists
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(dest, { recursive: true });

  fs.readdirSync(src).forEach((file) => {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    if (fs.statSync(srcFile).isFile()) {
      fs.copyFileSync(srcFile, destFile);
      console.log(`[postbuild] Copied ${file} to dist/config`);
    }
  });
}

copyConfigs();
