#!/usr/bin/env node
/**
 * One-time setup: clone Vencord + Installer source into this folder.
 *
 *   node setup.mjs
 */

import { BRAND } from "./lib/paths.mjs";
import { setupWorkRepos } from "./lib/util.mjs";

setupWorkRepos();
console.log(`[${BRAND}] Ready. Run install.ps1 or: node buildInstaller.mjs`);
