import { readFile, writeFile } from 'node:fs/promises';
const root = JSON.parse(await readFile('package.json', 'utf8'));
let content =
  '# Direct dependency licenses\n\nGenerated from installed package manifests. Versions are fixed by package-lock.json. This is an inventory, not legal clearance of all transitive assets.\n\n';
for (const [group, deps] of Object.entries({
  runtime: root.dependencies,
  development: root.devDependencies,
})) {
  content += `## ${group}\n\n`;
  for (const name of Object.keys(deps).sort()) {
    const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
    content += `- ${name} ${pkg.version}: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n`;
  }
}
content +=
  '\nChess.js is installed under BSD-2-Clause. Stockfish is not installed or distributed. Onitama publisher artwork/title is not included. Logo, boards and figures are original code assets; no generated raster image is shipped.\n\n## Font assets\n\nFixel (MacPaw, 2023): SIL Open Font License 1.1, downloaded from the official fonts.macpaw.com source. Notices: apps/web/public/fonts/OFL-Fixel.txt and docs/licenses/FIXEL.txt.\n';
await writeFile('docs/LICENSES.md', content);
