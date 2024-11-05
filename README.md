# Cloudflare DNS Updater

This is a simple script that updates a Cloudflare DNS record with the current
public IP address of the machine it is running on.

## Getting started

### Using binary from releases

You can download this script in a binary format from the [releases page](https://github.com/alber70g/cf-dns-updater/releases). It's compiled using [Buns Single File Executable](#single-file-executable)

### Using a javascript runtime

[Install `bun`.](https://bun.sh/docs/installation)

> Note: you can also use nodejs or deno to run this script.

Run this script with `bun`.

```bash
bun index.ts --select
```

This will ask you to provide a Cloudflare API Token. It will be stored in
`config.json` file.

It will also ask you which domains and sub-domains you want to update.

## Usage

> NOTE: The script requires a Cloudflare API token to be stored in `config.json`
> file. The token should have the following permissions:
> **`Zone.Zone, Zone.DNS`**

The script can be run with the following flags:

- `--select` flag will prompt the user to select a DNS record to update.

```bash
bun index.ts --select
```

- `--test` flag will print the current public IP address, and show whether there
  will be updates to DNS records

```bash
bun index.ts --test
```

- Without flags, the script will update the DNS record with the current public
  IP address.

```bash
bun index.ts
```

## Single-file executable

This script can also be made to run without `bun` by running the following:

```bash
bun build --compile --target=bun-linux-x64-modern ./index.ts --outfile cf-dns-update
```

See also: https://bun.sh/docs/bundler/executables
