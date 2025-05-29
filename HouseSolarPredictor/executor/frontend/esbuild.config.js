import { build } from 'esbuild';

const config = {
  entryPoints: ['js-compiled/app.js'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: false, // Set to true for production
  treeShaking: true,
  splitting: false, // Can be enabled for code splitting
  metafile: true,
  logLevel: 'info'
};

try {
  const result = await build(config);
  
  if (result.metafile) {
    console.log('\n📊 Bundle analysis:');
    const outputs = Object.keys(result.metafile.outputs);
    outputs.forEach(output => {
      const size = result.metafile.outputs[output].bytes;
      console.log(`  ${output}: ${(size / 1024).toFixed(2)} KB`);
    });
  }
  
  console.log('\n✅ esbuild bundling completed successfully!');
} catch (error) {
  console.error('❌ esbuild failed:', error);
  process.exit(1);
}