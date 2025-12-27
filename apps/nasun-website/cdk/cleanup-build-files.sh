#!/bin/bash

# CDK 프로젝트 빌드 파일 정리 스크립트
# 작성일: 2025-09-20
# 최종 업데이트: 2025-10-05
# 목적: 불필요한 빌드 파일 제거 및 CDK 배포 최적화
#
# ⚠️ 중요: TypeScript 소스(.ts) 파일은 절대 삭제하지 않습니다!
#           컴파일된 JavaScript(.js, .d.ts) 파일만 삭제합니다.

set -e  # 오류 발생 시 즉시 종료

echo "🧹 CDK 빌드 파일 정리 시작..."

# 현재 위치 확인
if [[ ! -f "cdk.json" ]]; then
    echo "❌ CDK 루트 디렉토리에서 실행해주세요 (cdk.json이 있는 위치)"
    exit 1
fi

# 1. CDK 출력 디렉토리 정리 (재생성 가능)
echo "📂 CDK 출력 디렉토리 정리 중..."
if [[ -d "cdk.out" ]]; then
    SIZE=$(du -sh cdk.out 2>/dev/null | cut -f1 || echo "unknown")
    echo "  🗑️  삭제: cdk.out/ ($SIZE)"
    rm -rf cdk.out/
fi

# 2. Lambda 빌드 디렉토리 정리
echo "🔨 Lambda 빌드 디렉토리 정리 중..."

# dist/ 디렉토리 삭제
find lambda-src -name "dist" -type d | while read dist_dir; do
    SIZE=$(du -sh "$dist_dir" 2>/dev/null | cut -f1 || echo "unknown")
    echo "  🗑️  삭제: $dist_dir ($SIZE)"
    rm -rf "$dist_dir"
done

# dist-bundled/ 디렉토리 삭제
find lambda-src -name "dist-bundled" -type d | while read dist_dir; do
    SIZE=$(du -sh "$dist_dir" 2>/dev/null | cut -f1 || echo "unknown")
    echo "  🗑️  삭제: $dist_dir ($SIZE)"
    rm -rf "$dist_dir"
done

# 3. 컴파일된 JavaScript/TypeScript 정의 파일 정리
echo "📝 src/ 디렉토리의 컴파일된 파일 정리 중..."
find lambda-src -path "*/src/*.js" -o -path "*/src/*.d.ts" | while read compiled_file; do
    # build.js, 설정 파일들은 유지
    if [[ "$compiled_file" =~ build\.js$ ]] || \
       [[ "$compiled_file" =~ jest\.config\.js$ ]] || \
       [[ "$compiled_file" =~ webpack\.config\.js$ ]] || \
       [[ "$compiled_file" =~ node_modules ]]; then
        continue
    fi

    # TypeScript 소스가 있는 경우만 컴파일된 파일 삭제
    if [[ "$compiled_file" =~ \.js$ ]]; then
        ts_file="${compiled_file%.js}.ts"
        if [[ -f "$ts_file" ]]; then
            echo "  🗑️  삭제: $compiled_file (대응하는 .ts 파일 존재)"
            rm -f "$compiled_file"
        fi
    elif [[ "$compiled_file" =~ \.d\.ts$ ]]; then
        ts_file="${compiled_file%.d.ts}.ts"
        if [[ -f "$ts_file" ]]; then
            echo "  🗑️  삭제: $compiled_file (대응하는 .ts 파일 존재)"
            rm -f "$compiled_file"
        fi
    fi
done

# 4. node_modules 캐시 정리 (선택적)
echo "📦 node_modules 캐시 정리 중..."
find . -path "*/node_modules/.cache" -type d | while read cache_dir; do
    SIZE=$(du -sh "$cache_dir" 2>/dev/null | cut -f1 || echo "unknown")
    echo "  🗑️  삭제: $cache_dir ($SIZE)"
    rm -rf "$cache_dir"
done

# 5. 임시 파일 및 ZIP 파일 정리
echo "🗂️  임시 파일 정리 중..."
find . -name "*.tmp" -o -name "*.temp" -o -name ".DS_Store" | while read temp_file; do
    echo "  🗑️  삭제: $temp_file"
    rm -f "$temp_file"
done

# Lambda 배포 ZIP 파일 정리 (최근 24시간 이내 것은 유지)
find . -name "lambda-*.zip" -type f -mtime +1 | while read zip_file; do
    echo "  🗑️  삭제: $zip_file (24시간 이상 경과)"
    rm -f "$zip_file"
done

# 6. 정리 결과 요약
echo ""
echo "✅ CDK 빌드 파일 정리 완료!"
echo ""
echo "📊 정리 후 디렉토리 크기:"
du -sh . 2>/dev/null || echo "크기 계산 실패"
echo ""
echo "🚀 다음 단계:"
echo "  ./deploy-optimized.sh - 클린 빌드 및 전체 CDK 배포"
echo "  ./update-lambda-only.sh - Lambda 함수만 빠르게 업데이트"
echo ""
echo "⚠️  주의: TypeScript 소스 파일(.ts)은 보존되었습니다."
echo "          컴파일된 JavaScript 파일(.js, .d.ts)만 삭제되었습니다."
echo ""
