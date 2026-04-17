import fs from 'node:fs'
import pngToIco from 'png-to-ico'

const source = 'build/danta.png'
const target = 'build/danta.ico'

if (!fs.existsSync(source)) {
  throw new Error(`Missing source png: ${source}`)
}

const buffer = await pngToIco(source)
fs.writeFileSync(target, buffer)
console.log('danta icon generated')
