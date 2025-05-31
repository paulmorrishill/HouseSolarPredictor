import { build } from 'esbuild';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

// Function to run TypeScript type checking
function runTypeCheck() {
    return new Promise((resolve, reject) => {
        console.log('🔍  Running type checks...');

        const tsc = spawn('npx', ['tsc', '--noEmit'], {
            stdio: 'pipe',
            shell: true
        });

        let output = '';
        let errorOutput = '';

        tsc.stdout.on('data', (data) => {
            output += data.toString();
        });

        tsc.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        tsc.on('close', (code) => {
            if (code === 0) {
                console.log('✅  Type checks passed!');
                resolve();
            } else {
                console.error('❌  Type check failed:');
                console.error(output || errorOutput);
                reject(new Error('TypeScript type checking failed'));
            }
        });

        tsc.on('error', (err) => {
            console.error('❌  Failed to run type checker:', err.message);
            reject(err);
        });
    });
}

// Clean dist folder
if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
    console.log('🗑️  Old dist folder removed.');
}

console.log('🚀  Starting build process...');

// Run type checking first, then build
runTypeCheck()
    .then(() => {
        console.log('📦  Building application...');

        return build({
            entryPoints: ['src/app.ts', 'src/styles.css'],
            bundle: true,
            outdir: 'dist/',
            platform: 'browser',
            target: 'es2020',
            sourcemap: 'linked',
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
        });
    })
    .then(() => {
        console.log('📄  Copying index.html...');

        const sourcePath = path.resolve('src/index.html');
        const destPath = path.resolve('dist/index.html');

        return new Promise((resolve, reject) => {
            fs.copyFile(sourcePath, destPath, (err) => {
                if (err) {
                    console.error('❌  Error copying index.html:', err);
                    reject(err);
                } else {
                    console.log('📄  index.html copied to dist folder.');
                    resolve();
                }
            });
        });
    })
    .then(() => {
        console.log('✅  Build completed successfully!');
    })
    .catch((e) => {
        console.error('❌  Build failed:', e.message || e);
        process.exit(1);
    });
