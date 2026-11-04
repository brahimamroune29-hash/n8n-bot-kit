#!/usr/bin/env node
// node build.mjs <out-dir> [--creds creds.json] [--ids ids.json]
// Writes ready SDK files: every '@@code/<name>.js' string in templates/*.ts becomes that file's code,
// newCredential('<Name>') becomes the credential id from creds.json ({"<Name>": "<id>"}),
// and each key of ids.json (e.g. SEND_WORKFLOW_ID) is replaced by its value.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const out = args[0]
if (!out) { console.error('usage: node build.mjs <out-dir> [--creds creds.json] [--ids ids.json]'); process.exit(1) }
const opt = (flag) => { const i = args.indexOf(flag); return i > 0 ? JSON.parse(readFileSync(args[i + 1], 'utf8')) : {} }
const creds = opt('--creds'), ids = opt('--ids')

mkdirSync(out, { recursive: true })
for (const file of readdirSync(join(here, 'templates')).filter((f) => f.endsWith('.ts'))) {
  let code = readFileSync(join(here, 'templates', file), 'utf8')
    .replace(/'@@code\/([\w-]+\.js)'/g, (_, f) => JSON.stringify(readFileSync(join(here, 'code', f), 'utf8')))
  code = code.replace(/newCredential\('([^']+)'\)/g, (m, name) => creds[name] ? `{ id: '${creds[name]}', name: '${name}' }` : m)
  for (const [k, v] of Object.entries(ids)) code = code.replaceAll(k, v)
  const left = code.match(/@@code\/[\w-]+\.js/)
  if (left) { console.error(`${file}: ${left[0]} not found`); process.exit(1) }
  writeFileSync(join(out, file), code)
  console.log('built', join(out, file))
}
