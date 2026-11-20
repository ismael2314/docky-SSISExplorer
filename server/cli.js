// Quick check without the server:  node cli.js packages/LOAD_MAIN_MASTER.dtsx
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseDtsx } from './dtsx.js'

const file = process.argv[2]
if (!file) { console.error('usage: node cli.js <file.dtsx>'); process.exit(1) }
const model = parseDtsx(await readFile(file, 'utf8'), path.basename(file))
console.log(JSON.stringify(model, null, 2))
