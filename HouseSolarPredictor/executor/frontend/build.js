import { build } from 'esbuild';
import path from 'path';
// delete dist
import fs from 'fs';
//emojis in console logs
if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
    console.log('🗑️  Old dist folder removed.');
}
console.log('🚀  Starting build process...');

// include css
build({
    entryPoints: ['src/app.ts', 'src/styles.css'],
    bundle: true,
    outdir: 'dist/',
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
}).catch((e) => {
    console.error('❌  Build failed:', e);
    process.exit(1)
}).then(() => {
    const sourcePath = path.resolve('src/index.html');
    const destPath = path.resolve('dist/index.html');
    fs.copyFile(sourcePath, destPath, (err) => {
        if (err) {
            console.error('❌  Error copying index.html:', err);
        } else {
            console.log('📄  index.html copied to dist folder.');
            console.log('✅  Build completed successfully!');
        }
    });
});

