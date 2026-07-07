/**
 * Guards the Detox e2e suites against fictional testIDs: every testID
 * referenced from e2e/ must exist in the app source tree (src/ or app/).
 *
 * The previous screenshot suite rotted exactly this way — it referenced ids
 * (charging-map, station-marker-1, ...) that никогда existed in the app.
 * This spec runs in the normal jest project so the check is enforced on
 * every CI run without needing an emulator.
 */

import * as fs from 'fs';
import * as path from 'path';

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
const E2E_DIRECTORIES = ['e2e/flows', 'e2e/screenshots'];
const SOURCE_DIRECTORIES = ['src', 'app'];

/** A testID referenced by an e2e file, with its source location for messages. */
interface ReferencedTestId {
  readonly file: string;
  readonly testId: string;
  /** True when the id is a template literal prefix (ends before a `${...}`). */
  readonly isPrefix: boolean;
}

describe('e2e testID inventory guard', () => {
  const referencedTestIds = collectReferencedTestIds();
  const sourceInventory = collectSourceTestIdInventory();

  it('finds a meaningful number of testID references in the e2e suites', () => {
    expect(referencedTestIds.length).toBeGreaterThan(20);
  });

  it('finds a meaningful number of testIDs in the app source tree', () => {
    expect(sourceInventory.literals.size).toBeGreaterThan(50);
    expect(sourceInventory.templatePrefixes.length).toBeGreaterThan(5);
  });

  it('references only testIDs that exist in src/ or app/', () => {
    const missingTestIds = referencedTestIds.filter((reference) => {
      return !isKnownTestId(reference, sourceInventory);
    });

    const formattedMissing = missingTestIds
      .map((reference) => `${reference.testId} (referenced in ${reference.file})`)
      .join('\n');

    expect(formattedMissing).toBe('');
  });
});

interface SourceTestIdInventory {
  readonly literals: ReadonlySet<string>;
  readonly templatePrefixes: readonly string[];
}

/**
 * Resolves whether a referenced testID exists in the source inventory,
 * either as an exact literal or by matching a template-literal prefix
 * (e.g. `favorite-card-${id}` matches referenced id `favorite-card-abc`).
 */
function isKnownTestId(
  reference: ReferencedTestId,
  inventory: SourceTestIdInventory,
): boolean {
  if (reference.isPrefix) {
    const hasLiteralWithPrefix = Array.from(inventory.literals).some((literal) => {
      return literal.startsWith(reference.testId);
    });

    return (
      hasLiteralWithPrefix ||
      inventory.templatePrefixes.some((prefix) => {
        return prefix.startsWith(reference.testId) || reference.testId.startsWith(prefix);
      })
    );
  }

  if (inventory.literals.has(reference.testId)) {
    return true;
  }

  return inventory.templatePrefixes.some((prefix) => {
    return prefix.length > 0 && reference.testId.startsWith(prefix);
  });
}

/**
 * Extracts every testID referenced by the e2e suites: `by.id(...)` matchers,
 * helper calls that take a testID, and screenshot `readyTestId` anchors.
 */
function collectReferencedTestIds(): readonly ReferencedTestId[] {
  const references: ReferencedTestId[] = [];
  const stringArgumentPattern =
    /(?:by\.id|waitForVisibleById|isVisibleById)\(\s*'([^']+)'/g;
  const templateArgumentPattern =
    /(?:by\.id|waitForVisibleById|isVisibleById)\(\s*`([^`]+)`/g;
  const readyTestIdPattern = /readyTestId:\s*'([^']+)'/g;

  for (const relativeDirectory of E2E_DIRECTORIES) {
    for (const filePath of listFilesRecursively(path.join(MOBILE_ROOT, relativeDirectory))) {
      if (!filePath.endsWith('.ts')) {
        continue;
      }

      const relativeFilePath = path.relative(MOBILE_ROOT, filePath);
      const content = fs.readFileSync(filePath, 'utf8');

      for (const match of content.matchAll(stringArgumentPattern)) {
        references.push({ file: relativeFilePath, isPrefix: false, testId: match[1] ?? '' });
      }

      for (const match of content.matchAll(readyTestIdPattern)) {
        references.push({ file: relativeFilePath, isPrefix: false, testId: match[1] ?? '' });
      }

      for (const match of content.matchAll(templateArgumentPattern)) {
        const template = match[1] ?? '';
        const placeholderIndex = template.indexOf('${');

        if (placeholderIndex === -1) {
          references.push({ file: relativeFilePath, isPrefix: false, testId: template });
          continue;
        }

        const staticPrefix = template.slice(0, placeholderIndex);

        if (staticPrefix.length > 0) {
          references.push({ file: relativeFilePath, isPrefix: true, testId: staticPrefix });
        }
      }
    }
  }

  return references;
}

/**
 * Builds the inventory of testIDs declared in the app source tree, split
 * into exact literals and template-literal prefixes.
 */
function collectSourceTestIdInventory(): SourceTestIdInventory {
  const literals = new Set<string>();
  const templatePrefixes: string[] = [];
  const literalPattern = /(?:testID|tabBarTestID)(?:=|:\s*)(?:\{?\s*)(?:"([^"]+)"|'([^']+)')/g;
  const templatePattern = /testID=\{`([^`]+)`\}/g;

  for (const relativeDirectory of SOURCE_DIRECTORIES) {
    for (const filePath of listFilesRecursively(path.join(MOBILE_ROOT, relativeDirectory))) {
      if (!/\.(?:ts|tsx)$/.test(filePath) || /\.(?:spec|test)\.tsx?$/.test(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      for (const match of content.matchAll(literalPattern)) {
        literals.add(match[1] ?? match[2] ?? '');
      }

      for (const match of content.matchAll(templatePattern)) {
        const template = match[1] ?? '';
        const placeholderIndex = template.indexOf('${');

        if (placeholderIndex === -1) {
          literals.add(template);
          continue;
        }

        const staticPrefix = template.slice(0, placeholderIndex);

        if (staticPrefix.length > 0) {
          templatePrefixes.push(staticPrefix);
        }
      }
    }
  }

  return { literals, templatePrefixes };
}

/**
 * Recursively lists all files under the provided directory.
 */
function listFilesRecursively(directoryPath: string): readonly string[] {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  const files: string[] = [];

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}
