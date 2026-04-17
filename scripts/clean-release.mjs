import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const pkgPath = path.join(rootDir, 'package.json')

if (!fs.existsSync(pkgPath)) {
  console.error('package.json not found')
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const productName = pkg?.build?.productName || pkg?.name || 'app'
const version = pkg?.version || '0.0.0'
const outputDirName = pkg?.build?.directories?.output || 'release'
const releaseDir = path.join(rootDir, outputDirName)

if (!fs.existsSync(releaseDir)) {
  console.log(`release directory not found: ${releaseDir}`)
  process.exit(0)
}

const keepNames = new Set([
  `${productName} Setup ${version}.exe`,
  `${productName} Setup ${version}.zip`,
])

for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
  if (keepNames.has(entry.name)) {
    continue
  }

  const target = path.join(releaseDir, entry.name)
  fs.rmSync(target, { recursive: true, force: true })
}

console.log(`release cleaned, kept: ${Array.from(keepNames).join(', ')}`)
