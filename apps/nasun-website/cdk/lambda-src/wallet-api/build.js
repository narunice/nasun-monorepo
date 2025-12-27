const esbuild = require('esbuild');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';

async function build() {
  console.log('🚀 Building wallet-api Lambda...');

  // dist 디렉토리 정리
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
  }
  fs.mkdirSync('dist', { recursive: true });

  try {
    await esbuild.build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      minify: isProduction,
      sourcemap: !isProduction,
      platform: 'node',
      target: 'node18',
      outfile: 'dist/index.js',
      format: 'cjs',
      external: ['aws-sdk', '@aws-sdk/*']
    });

    console.log('✅ Build complete: dist/index.js');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
