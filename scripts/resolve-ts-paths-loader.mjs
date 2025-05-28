import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';

const tsconfigPath = path.resolve('./tsconfig.json');
const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
const paths =
  (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) || {};
const outDir =
  (tsconfig.compilerOptions && tsconfig.compilerOptions.outDir) || 'dist';
const rootDir =
  (tsconfig.compilerOptions && tsconfig.compilerOptions.rootDir) || 'src';

const aliasMap = [];
for (const [aliasPattern, targets] of Object.entries(paths)) {
  // Only support patterns like "@/*": ["./src/*"]
  if (aliasPattern.endsWith('/*') && targets[0].endsWith('/*')) {
    const aliasPrefix = aliasPattern.slice(0, -2); // "@/"
    const targetPrefix = targets[0].slice(0, -2); // "./src"
    aliasMap.push({ aliasPrefix, targetPrefix });
  }
}

export async function resolve(specifier, context, nextResolve) {
  for (const { aliasPrefix, targetPrefix } of aliasMap) {
    if (specifier.startsWith(aliasPrefix)) {
      // Replace alias with outDir equivalent
      const subPath = specifier.slice(aliasPrefix.length);
      // Map "./src" to "./dist"
      const distTarget = targetPrefix.replace(rootDir, outDir);
      const resolvedPath = pathToFileURL(
        path.resolve(distTarget, subPath)
      ).href;
      return nextResolve(resolvedPath, context);
    }
  }
  return nextResolve(specifier, context);
}
