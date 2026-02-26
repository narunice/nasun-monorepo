# Handoff: nasun-website 동영상 최적화

**생성**: 2026-02-26 13:10
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

nasun-website의 모바일 로딩 성능 개선을 위해 동영상 최적화 작업 진행 중. 코드 레벨 최적화 (캐러셀 lazy load, poster 이미지, preload 전략, nginx 캐싱)는 완료. 에셋 레벨 최적화 (ffmpeg 재압축, WebM 변환)는 미실행. 아직 커밋/배포하지 않은 상태.

## 완료된 작업

- [x] 전체 동영상 사용 현황 감사 (페이지별 매핑)
- [x] 미사용 동영상 삭제: `Pado-Ui-Demo-Final-rf26.mp4`, `Opensea-Battalion-Nft-Pipeline-rf26.mp4`, `Pado-Ui-Full-rf16.mp4`, `Network-Explorer-Ui-rf12.mp4`
- [x] 동영상 교체: Shooter 히어로 → `Progress-Video-rf28.mp4`, Network Explorer 캐러셀 → `Network-Explorer-Ui-rf20.mp4`, Pado UI → `Pado-Ui-Full-rf24.mp4`
- [x] WhatWeBuildingSection 캐러셀 lazy load: `preload="none"` + `preloadAdjacentSlides()` (활성 ± 1만 로드)
- [x] poster 이미지: 18개 영상 전부 WebP 첫 프레임 추출 → `public/images/posters/`, 13개 컴포넌트에 `poster` 속성 추가
- [x] preload 전략 통일: below-fold 4개 섹션 `preload="none"` (VisionSection, WhatWeBuildingSection, Wave1Section, NftSaleSection)
- [x] nginx Cache-Control: Production EC2에 `/videos/`, `/images/posters/` 블록 추가 (30d, immutable). Staging은 이미 적용되어 있음

## 미완료 작업

- [ ] ffmpeg 재압축: `-an` (오디오 제거) + `-crf 30` + `-movflags +faststart` — 모든 영상에 적용
- [ ] WebM(VP9) 변환 + `<source>` fallback 구조로 코드 전환
- [x] `Pado-Ui-Demo-Short-rf20.mp4`(6.5M) — 코드 참조 없음 확인, 삭제 완료
- [ ] 모바일 전용 저해상도 변형 생성 (HeroSection, VisionSection 등 모바일 변형 없는 섹션)
- [ ] 저속 네트워크 감지(`navigator.connection`) → 영상 대신 poster 이미지 대체 로직
- [ ] 커밋 및 staging 배포 후 모바일 실기기 테스트
- [ ] Lighthouse Performance 점수 비교 (before/after)

## 중요 컨텍스트

- **결정사항**: 포맷 변환(WebM)보다 로딩 전략 개선을 우선함. 12MB WebM 4개 동시 로드보다 8MB MP4 1개 로드가 낫다는 판단.
- **결정사항**: CDN(CloudFront)은 현 단계에서 비용 대비 효과 낮음. nginx 캐싱으로 충분. 트래픽 증가 후 재고.
- **결정사항**: Cloudinary/Mux 등 전문 호스팅은 배경 영상 위주 사이트에서 과도. 보류.
- **주의사항**: react-slick 캐러셀은 clone 슬라이드를 DOM으로 복제함. `preloadAdjacentSlides`는 `:not(.slick-cloned)` 셀렉터로 원본만 대상으로 함.
- **해결됨**: `Pado-Ui-Demo-Short-rf20.mp4` — 코드 참조 없음 확인 후 삭제 완료.
- **파일 위치**: poster 이미지 → `apps/nasun-website/frontend/public/images/posters/`
- **파일 위치**: 동영상 → `apps/nasun-website/frontend/public/videos/`
- **파일 위치**: 분석 계획 → `.claude/plans/expressive-popping-pearl.md`

## 최근 변경 파일

**삭제**:
- `public/videos/Network-Explorer-Ui-rf12.mp4` (8.2M)
- `public/videos/Opensea-Battalion-Nft-Pipeline-rf26.mp4` (9.4M)
- `public/videos/Pado-Ui-Demo-Final-rf26.mp4` (5.7M)
- `public/videos/Pado-Ui-Full-rf16.mp4` (19M)

**추가**:
- `public/images/posters/*.webp` (18개, 총 ~960KB)
- `public/videos/Network-Explorer-Ui-rf20.mp4` (신규)
- `public/videos/Pado-Ui-Full-rf24.mp4` (신규)

**코드 수정** (13개 컴포넌트):
- `sections/home/HeroSection.tsx` — poster 추가
- `sections/home/VisionSection.tsx` — poster 추가, preload → none
- `sections/home/Wave1Section.tsx` — poster 추가 (2곳), preload → none
- `sections/home/NftSaleSection.tsx` — poster 추가, preload → none
- `sections/home/WhatWeBuildingSection.tsx` — 캐러셀 lazy load 전면 개편, poster, preload → none
- `sections/network/network/NetworkHeroSection.tsx` — 반응형 poster 추가
- `sections/wave1/battalion-nft/BattalionNftHeroSection.tsx` — poster 추가 (mobile + desktop)
- `sections/ecosystem/finance/FinanceHeroSection.tsx` — 반응형 poster 추가
- `sections/ecosystem/finance/FinanceContent.tsx` — 영상 교체 + poster 추가
- `sections/ecosystem/pado/PadoHeroSection.tsx` — 반응형 poster 추가
- `sections/ecosystem/pado-revised/PadoRevisedHeroSection.tsx` — 반응형 poster 추가
- `sections/ecosystem/pado/UnifiedOnchain.tsx` — 영상 교체 + poster 갱신
- `sections/ecosystem/pado/PadoDraftContent.tsx` — 영상 교체
- `sections/ips/gensol/shooter/SpectraSection.tsx` — 영상 교체 + poster 추가
- `pages/GenesisNftPage.tsx` — 반응형 poster 추가

**인프라**:
- Production nginx (`43.200.67.52`): `/videos/`, `/images/posters/` Cache-Control 블록 추가

## 즉시 다음 단계

1. `Pado-Ui-Demo-Short-rf20.mp4` 삭제 여부 확인 후 처리
2. 변경사항 커밋 + staging 배포 (`rsync`)
3. 모바일 실기기에서 로딩 속도 체감 테스트
4. (선택) ffmpeg 일괄 재압축 스크립트 실행: `for f in public/videos/*.mp4; do ffmpeg -i "$f" -c:v libx264 -crf 30 -preset slow -an -movflags +faststart "${f%.mp4}-opt.mp4"; done`
