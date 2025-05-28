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
      // Strip any leading slash from subPath to avoid absolute path resolution
      const subPath = specifier.slice(aliasPrefix.length).replace(/^\/+/, '');
      // Map "./src" to "./dist"
      const distTarget = targetPrefix.replace(rootDir, outDir);
      let resolvedFile = path.resolve(distTarget, subPath);
      // Always append .js extension if not present
      if (!path.extname(resolvedFile)) {
        resolvedFile += '.js';
      }
      const resolvedPath = pathToFileURL(resolvedFile).href;
      return nextResolve(resolvedPath, context);
    }
  }
  return nextResolve(specifier, context);
}
