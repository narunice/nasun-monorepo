const esbuild = require('esbuild');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';

async function build() {
  console.log('🚀 Building PriceAPI Lambda function...');

  // dist 디렉토리 정리
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
  }
  fs.mkdirSync('dist', { recursive: true });

  try {
    await esbuild.build({
      entryPoints: ['src/lambda-handler.ts'],
      bundle: true,
      minify: isProduction,
      sourcemap: !isProduction,
      platform: 'node',
      target: 'node18',
      outfile: 'dist/lambda-handler.js',
      format: 'cjs',
      external: [
        'aws-sdk',
        '@aws-sdk/*',
      ]
    });

    console.log('✅ Build complete: dist/lambda-handler.js');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
