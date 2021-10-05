import esbuild from 'esbuild';
import fs from 'node:fs';

esbuild
  .build({
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/id.js'],
    define: { global: 'self' },           // for Buffer polyfill
    inject: ['./config/buffer_shim.js'],  // for Buffer polyfill
    legalComments: 'none',
    logLevel: 'info',
    metafile: true,
    outfile: 'dist/iD.js'
  })
  .then(result => {
    fs.writeFileSync('./dist/esbuild.json', JSON.stringify(result.metafile, null, 2));
  })
  .catch(() => process.exit(1));

esbuild
  .build({
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/worker.js'],
    define: { global: 'self' },           // for Buffer polyfill
    inject: ['./config/buffer_shim.js'],  // for Buffer polyfill
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/worker.js'
  })
  .catch(() => process.exit(1));
