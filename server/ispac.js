// An .ispac is a zip of a whole SSIS project: .dtsx packages, .conmgr connection managers, params...
import { unzipSync } from 'fflate'
import { HttpError } from './errors.js'

const safeDecode = (s) => { try { return decodeURIComponent(s) } catch { return s } }

// Returns only the files we use: [{ name, data: Buffer }]. File names inside an .ispac are URL-encoded.
export function extractIspac(buffer) {
  let entries
  try {
    entries = unzipSync(new Uint8Array(buffer), { filter: (f) => /\.(dtsx|conmgr)$/i.test(f.name) })
  } catch {
    throw new HttpError(422, 'This is not a valid .ispac (zip) file')
  }
  return Object.entries(entries).map(([entry, data]) => ({
    name: safeDecode(entry.split('/').pop()),
    data: Buffer.from(data),
  }))
}
