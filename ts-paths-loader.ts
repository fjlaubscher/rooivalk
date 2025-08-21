import { readFileSync, existsSync, statSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsconfigPath = path.resolve(__dirname, 'tsconfig.json');
const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
const paths = tsconfig.compilerOptions?.paths || {};
const aliasMap: { aliasPrefix: string; targetPrefix: string }[] = [];

for (const [aliasPattern, targets] of Object.entries(paths)) {
  const targetArr = targets as string[];
  if (aliasPattern.endsWith('/*') && targetArr[0].endsWith('/*')) {
    const aliasPrefix = aliasPattern.slice(0, -2);
    const targetPrefix = targetArr[0].slice(0, -2);
    aliasMap.push({ aliasPrefix, targetPrefix });
  }
}

export async function resolve(specifier, context, nextResolve) {
  for (const { aliasPrefix, targetPrefix } of aliasMap) {
    if (specifier.startsWith(aliasPrefix + '/')) {
      const subPath = specifier.slice(aliasPrefix.length).replace(/^\/+/, '');
      let resolvedFile = path.resolve(__dirname, targetPrefix, subPath);
      if (existsSync(resolvedFile) && statSync(resolvedFile).isDirectory()) {
        resolvedFile = path.join(resolvedFile, 'index.ts');
      } else if (!path.extname(resolvedFile)) {
        const tsFile = resolvedFile + '.ts';
        if (existsSync(tsFile)) {
          resolvedFile = tsFile;
        } else {
          // File doesn't exist, let Node.js handle the error
          continue;
        }
      }
      
      // Verify the final resolved file exists before returning
      if (existsSync(resolvedFile)) {
        return nextResolve(pathToFileURL(resolvedFile).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
