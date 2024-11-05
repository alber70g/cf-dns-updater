#!/usr/bin/env bun
import { $ } from "bun";

const bunVersion = await $`bun --version`.text();
console.log(bunVersion);

// https://bun.sh/docs/bundler/executables#supported-targets
const targets = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-windows-x64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
];

const $builds = targets.map(
  (target) =>
    $`bun build --compile --target=${target} ./index.ts --outfile ./bin/cf-dns-updater_${target}_bun-v${bunVersion.trim()}`
);

await Promise.all($builds)
  .then((o) => console.log(o.toString()))
  .catch((o) => console.error(`err: ${o.toString()}`));
