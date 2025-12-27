/**
 * Dark Mode Class Converter
 *
 * Tailwind CSS의 dark: 접두사를 제거하여 다크 모드를 기본 스타일로 통합
 *
 * Usage:
 *   pnpm run convert:dark
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ConversionRule {
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  description: string;
}

// 변환 규칙 정의
const conversionRules: ConversionRule[] = [
  // 규칙 1: 라이트 모드 삭제, 다크 모드 채택 (NASUN 색상)
  {
    pattern: /text-nasun-black\s+dark:text-nasun-white/g,
    replacement: 'text-nasun-white',
    description: 'Convert text-nasun-black to text-nasun-white (dark default)'
  },
  {
    pattern: /bg-nasun-white\s+dark:bg-nasun-black/g,
    replacement: 'bg-nasun-black',
    description: 'Convert bg-nasun-white to bg-nasun-black (dark default)'
  },
  {
    pattern: /border-nasun-white\/(\d+)\s+dark:border-nasun-black\/(\d+)/g,
    replacement: 'border-nasun-black/$2',
    description: 'Convert border-nasun-white to border-nasun-black (dark default)'
  },
  {
    pattern: /border-nasun-black\/(\d+)\s+dark:border-nasun-white\/(\d+)/g,
    replacement: 'border-nasun-white/$2',
    description: 'Convert border-nasun-black to border-nasun-white (dark default)'
  },

  // 규칙 2: Gray 색상 통합
  {
    pattern: /text-gray-(\d+)\s+dark:text-gray-(\d+)/g,
    replacement: (match, light, dark) => `text-gray-${dark}`,
    description: 'Use dark gray value as default for text'
  },
  {
    pattern: /bg-gray-(\d+)\s+dark:bg-gray-(\d+)/g,
    replacement: (match, light, dark) => `bg-gray-${dark}`,
    description: 'Use dark bg-gray value as default'
  },
  {
    pattern: /border-gray-(\d+)\s+dark:border-gray-(\d+)/g,
    replacement: (match, light, dark) => `border-gray-${dark}`,
    description: 'Use dark border-gray value as default'
  },

  // 규칙 3: 기타 색상 통합 (red, blue, green 등)
  {
    pattern: /text-(red|blue|green|yellow|purple|pink|orange)-(\d+)\s+dark:text-(red|blue|green|yellow|purple|pink|orange)-(\d+)/g,
    replacement: (match, color1, light, color2, dark) => `text-${color2}-${dark}`,
    description: 'Use dark color value as default for text'
  },
  {
    pattern: /bg-(red|blue|green|yellow|purple|pink|orange)-(\d+)\s+dark:bg-(red|blue|green|yellow|purple|pink|orange)-(\d+)/g,
    replacement: (match, color1, light, color2, dark) => `bg-${color2}-${dark}`,
    description: 'Use dark color value as default for bg'
  },

  // 규칙 4: NASUN 커스텀 색상 (text-nasun-X)
  {
    pattern: /text-nasun-(\w+)\s+dark:text-nasun-(\w+)/g,
    replacement: (match, light, dark) => `text-nasun-${dark}`,
    description: 'Use dark nasun color for text'
  },
  {
    pattern: /bg-nasun-(\w+)\s+dark:bg-nasun-(\w+)/g,
    replacement: (match, light, dark) => `bg-nasun-${dark}`,
    description: 'Use dark nasun color for bg'
  },

  // 규칙 5: 단순 dark: 접두사 제거 (라이트 모드 클래스가 없는 경우)
  {
    pattern: /(?<![\w-])dark:text-([\w-]+(?:\/\d+)?)/g,
    replacement: 'text-$1',
    description: 'Remove dark: prefix from standalone text classes'
  },
  {
    pattern: /(?<![\w-])dark:bg-([\w-]+(?:\/\d+)?)/g,
    replacement: 'bg-$1',
    description: 'Remove dark: prefix from standalone bg classes'
  },
  {
    pattern: /(?<![\w-])dark:border-([\w-]+(?:\/\d+)?)/g,
    replacement: 'border-$1',
    description: 'Remove dark: prefix from standalone border classes'
  },
  {
    pattern: /(?<![\w-])dark:hover:([\w-]+)/g,
    replacement: 'hover:$1',
    description: 'Remove dark: prefix from hover states'
  },

  // 규칙 6: 특수 케이스 - hidden/block (다크 모드 우선)
  {
    pattern: /(?<![\w-])hidden\s+dark:block/g,
    replacement: 'block',
    description: 'Convert hidden dark:block to block (dark default)'
  },
  {
    pattern: /(?<![\w-])block\s+dark:hidden/g,
    replacement: 'hidden',
    description: 'Convert block dark:hidden to hidden (dark default)'
  },

  // 규칙 7: data-[highlighted] (Radix UI) - 다크 모드 우선
  {
    pattern: /data-\[highlighted\]:bg-([\w-/]+)\s+dark:data-\[highlighted\]:bg-([\w-/]+)/g,
    replacement: 'data-[highlighted]:bg-$2',
    description: 'Use dark data-highlighted bg as default'
  },
  {
    pattern: /data-\[highlighted\]:text-([\w-/]+)\s+dark:data-\[highlighted\]:text-([\w-/]+)/g,
    replacement: 'data-[highlighted]:text-$2',
    description: 'Use dark data-highlighted text as default'
  },

  // 규칙 8: decoration (underline 등)
  {
    pattern: /decoration-(white|black|gray-\d+)\/(\d+)\s+dark:decoration-(white|black|gray-\d+)\/(\d+)/g,
    replacement: (match, light1, lightOpacity, dark1, darkOpacity) => `decoration-${dark1}/${darkOpacity}`,
    description: 'Use dark decoration value as default'
  },
];

// 변환 실행
function convertFile(filePath: string): { changed: boolean; changes: number } {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let totalChanges = 0;

  conversionRules.forEach(rule => {
    const matches = content.match(rule.pattern);
    if (matches) {
      totalChanges += matches.length;
      if (typeof rule.replacement === 'function') {
        content = content.replace(rule.pattern, rule.replacement as any);
      } else {
        content = content.replace(rule.pattern, rule.replacement);
      }
    }
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { changed: true, changes: totalChanges };
  }

  return { changed: false, changes: 0 };
}

// 메인 실행
function main() {
  const srcDir = path.join(__dirname, '../src');
  const files = globSync(`${srcDir}/**/*.{tsx,ts}`, {
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.test.tsx']
  });

  console.log(`🔍 Found ${files.length} files to process\n`);

  let processedFiles = 0;
  let changedFiles = 0;
  let totalChanges = 0;

  files.forEach(file => {
    const result = convertFile(file);
    processedFiles++;

    if (result.changed) {
      changedFiles++;
      totalChanges += result.changes;
      const relativePath = path.relative(srcDir, file);
      console.log(`✅ ${relativePath} (${result.changes} changes)`);
    }
  });

  console.log(`\n📊 Conversion Summary:`);
  console.log(`   Processed: ${processedFiles} files`);
  console.log(`   Changed: ${changedFiles} files`);
  console.log(`   Total conversions: ${totalChanges}`);
  console.log(`\n✨ Done!`);
}

main();
