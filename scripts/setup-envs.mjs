#!/usr/bin/env node
/**
 * Cross-platform replacement for the old `cp -n` based setup:envs script.
 *
 * Copies each .env.example to its runtime .env file ONLY if the target does
 * not already exist (mirrors `cp -n` / no-clobber behavior). Works on Windows
 * (cmd / PowerShell), macOS, and Linux without relying on a Unix `cp` command.
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// [source template, destination runtime env]
const envFiles = [
  ["frontend/.env.example", "frontend/.env"],
  ["server/.env.example", "server/.env.development"],
  ["collector/.env.example", "collector/.env"],
];

let copied = 0;
let skipped = 0;

for (const [src, dest] of envFiles) {
  const srcPath = resolve(root, src);
  const destPath = resolve(root, dest);

  if (!existsSync(srcPath)) {
    console.warn(`! Skipped: template not found -> ${src}`);
    continue;
  }

  if (existsSync(destPath)) {
    console.log(`= Skipped (already exists): ${dest}`);
    skipped++;
    continue;
  }

  copyFileSync(srcPath, destPath);
  console.log(`+ Created: ${dest}`);
  copied++;
}

console.log(`\nAll ENV files processed! (created: ${copied}, skipped: ${skipped})\n`);
