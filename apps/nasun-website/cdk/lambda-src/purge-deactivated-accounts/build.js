const esbuild = require('esbuild');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';

async function build() {
  console.log('🚀 Building Lambda function...');

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
      external: [
        'aws-sdk',        // Lambda Runtime 포함 (Legacy)
        '@aws-sdk/*',     // Lambda Runtime 포함 (v3)
        '@aws/*'          // AWS 내부 패키지 제외
      ]
    });

    console.log('✅ Build complete: dist/index.js');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
