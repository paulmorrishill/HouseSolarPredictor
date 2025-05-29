import { build } from 'esbuild';
import path from 'path';

build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'dist/bundle.js',
    platform: 'browser',
    target: 'es2020',
    plugins: [{
        name: 'shared-types-resolver',
        setup(build) {
            build.onResolve({ filter: /^@shared/ }, args => {
                if (args.path === '@shared') {
                    return { path: path.resolve('../shared-types/index.ts') };
                }
                if (args.path.startsWith('@shared/')) {
                    const subPath = args.path.replace('@shared/', '');
                    return { path: path.resolve(`../shared-types/${subPath}.ts`) };
                }
            });
        }
    }]
}).catch(() => process.exit(1));
