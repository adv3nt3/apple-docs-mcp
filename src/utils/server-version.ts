/**
 * Read the package version at runtime so MCP `serverInfo.version` reflects
 * the installed package and not a stale hardcoded literal.
 *
 * Lives in its own module specifically so tests can mock it — `import.meta.url`
 * is a CJS parse error under ts-jest, mirroring the wwdc-data-source-path.ts
 * split. The build script copies package.json into dist/ alongside the
 * compiled entry, so a sibling lookup works from both `node dist/index.js`
 * and `brew install` (which ships dist/* into libexec/).
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function getServerVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/utils/server-version.js → ../package.json (= dist/package.json)
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}