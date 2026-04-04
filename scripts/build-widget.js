#!/usr/bin/env node

/**
 * Build script for versioned widget bundles
 *
 * Generates:
 * - widget.js          (latest - always points to current version)
 * - widget.v{major}.js (pinned to major version, e.g., widget.v1.js)
 * - widget.v{major}.{minor}.js (pinned to minor, e.g., widget.v1.1.js)
 * - widget.v{major}.{minor}.{patch}.js (exact version, e.g., widget.v1.1.0.js)
 */

import { execSync } from 'child_process';
import { readFileSync, copyFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const publicDir = join(rootDir, 'public');

// Read version from VERSION env var (release tag) or fall back to package.json
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
let version = process.env.VERSION || packageJson.version;

// Strip 'v' prefix if present (e.g., v1.1.0 -> 1.1.0)
if (version.startsWith('v')) {
  version = version.slice(1);
}

const [major, minor, patch] = version.split('.');

console.log(`Building widget version ${version}...`);

// Build the main widget bundle
execSync(
  `npx esbuild src/widget/index.ts --bundle --minify --format=iife --define:__BUGDROP_VERSION__='"${version}"' --outfile=public/widget.js`,
  { cwd: rootDir, stdio: 'inherit' }
);

// Create versioned copies
const widgetPath = join(publicDir, 'widget.js');

// widget.v{major}.js (e.g., widget.v1.js)
const majorVersionPath = join(publicDir, `widget.v${major}.js`);
copyFileSync(widgetPath, majorVersionPath);
console.log(`  Created widget.v${major}.js`);

// widget.v{major}.{minor}.js (e.g., widget.v1.1.js)
const minorVersionPath = join(publicDir, `widget.v${major}.${minor}.js`);
copyFileSync(widgetPath, minorVersionPath);
console.log(`  Created widget.v${major}.${minor}.js`);

// widget.v{major}.{minor}.{patch}.js (e.g., widget.v1.1.0.js)
const patchVersionPath = join(publicDir, `widget.v${major}.${minor}.${patch}.js`);
copyFileSync(widgetPath, patchVersionPath);
console.log(`  Created widget.v${major}.${minor}.${patch}.js`);

// Create a versions.json manifest for reference
const versionsManifest = {
  current: version,
  latest: 'widget.js',
  versions: {
    [`v${major}`]: `widget.v${major}.js`,
    [`v${major}.${minor}`]: `widget.v${major}.${minor}.js`,
    [`v${major}.${minor}.${patch}`]: `widget.v${major}.${minor}.${patch}.js`,
  },
  generatedAt: new Date().toISOString(),
};

writeFileSync(join(publicDir, 'versions.json'), JSON.stringify(versionsManifest, null, 2));
console.log(`  Created versions.json manifest`);

console.log(`\nWidget build complete!`);
console.log(`  Latest:  /widget.js`);
console.log(`  Major:   /widget.v${major}.js`);
console.log(`  Minor:   /widget.v${major}.${minor}.js`);
console.log(`  Exact:   /widget.v${major}.${minor}.${patch}.js`);
