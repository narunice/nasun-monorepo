import { ReactNode, useRef, useEffect } from "react";

interface ScrollSnapContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * ScrollSnapContainer 컴포넌트
 *
 * 풀페이지 스크롤 스냅 컨테이너 (조건부 스냅 전략 + 임계값 제어 + 강제 스냅)
 * - 데스크톱(768px+): 부드러운 스크롤 스냅 (1.2초 애니메이션)
 * - 모바일(<768px): 일반 스크롤 (스냅 비활성화)
 *
 * 기능:
 * - 섹션별 스냅 정렬
 * - 부드러운 스크롤 애니메이션 (1200ms)
 * - Wheel 이벤트 제어로 자연스러운 전환
 * - 스크롤 업/다운 양방향 지원
 * - Footer까지 스크롤 가능
 * - 강제 스냅: 스크롤 정지 후 애매한 위치 자동 보정
 *
 * 조건부 스냅 전략 (개선된 임계값 + 속도 감지):
 * - 짧은 섹션 (≤ 100vh): 50px 임계값 (기존 100px에서 50% 감소)
 *   - 아래로 스크롤: 섹션 시작점에서 50px 이상 스크롤해야 다음 섹션으로
 *   - 위로 스크롤: 섹션 끝점에서 50px 이상 올라와야 이전 섹션으로
 *   - 빠른 스크롤 (|deltaY| > 50): 임계값 무시하고 즉시 전환
 * - 긴 섹션 (> 100vh): 내부 스크롤 허용, 경계에서만 스냅
 *   - 섹션 내부에서는 일반 스크롤 동작
 *   - 섹션 상단/하단(10px 여유) 도달 시 다음/이전 섹션으로 전환
 * - 강제 스냅: 스크롤 정지 200ms 후, 섹션 경계 ±10% 내에 있으면 자동 스냅
 */
export function ScrollSnapContainer({
  children,
  className = "",
}: ScrollSnapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // 강제 스냅 로직: 스크롤 정지 후 애매한 위치에 멈춰있으면 가장 가까운 섹션으로 스냅
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;

    // 데스크톱에서만 작동 (768px 이상)
    const isDesktop = () => window.innerWidth >= 768;

    const handleScrollEnd = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        // 모바일이거나 이미 스크롤 중이면 무시
        if (!isDesktop() || isScrollingRef.current) return;

        const currentScroll = window.scrollY;
        const sections = document.querySelectorAll(".scroll-snap-section");

        // 가장 가까운 섹션 찾기
        let closestSection: Element | null = null;
        let minDistance = Infinity;

        sections.forEach((section) => {
          const rect = section.getBoundingClientRect();
          const sectionTop = currentScroll + rect.top;
          const distance = Math.abs(currentScroll - sectionTop);

          if (distance < minDistance) {
            minDistance = distance;
            closestSection = section;
          }
        });

        // 섹션 경계 ±10% 범위 내면 강제 스냅
        if (
          closestSection &&
          minDistance > 10 &&
          minDistance < window.innerHeight * 0.1
        ) {
          const rect = closestSection.getBoundingClientRect();
          const targetTop = currentScroll + rect.top;
          window.scrollTo({ top: targetTop, behavior: "smooth" });
        }
      }, 200); // 200ms 동안 스크롤 없으면 실행
    };

    window.addEventListener("scroll", handleScrollEnd, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScrollEnd);
      clearTimeout(scrollTimeout);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 데스크톱에서만 커스텀 스크롤 적용 (768px 이상)
    const isDesktop = () => window.innerWidth >= 768;

    const handleWheel = (e: WheelEvent) => {
      // 모바일에서는 기본 스크롤 유지
      if (!isDesktop()) return;

      // 이미 스크롤 중이면 무시
      if (isScrollingRef.current) {
        e.preventDefault();
        return;
      }

      // 스크롤 방향 감지
      const direction = e.deltaY > 0 ? 1 : -1;

      // 모든 섹션 찾기 (ScrollSnapSection으로 감싼 것들)
      const sections = document.querySelectorAll(".scroll-snap-section");
      const currentScrollY = window.scrollY;
      const viewportHeight = window.innerHeight;

      // 현재 보이는 섹션 찾기
      let currentIndex = 0;
      let minDistance = Infinity;

      // Footer 영역 확인: 모든 섹션보다 아래에 있는지 체크
      const lastSection = sections[sections.length - 1] as HTMLElement;
      const lastSectionRect = lastSection.getBoundingClientRect();
      const lastSectionBottom = lastSectionRect.top + currentScrollY + lastSectionRect.height;
      // Footer 영역: 마지막 섹션 끝을 지나서 스크롤한 경우 (여유 50px)
      const isInFooterArea = currentScrollY + viewportHeight > lastSectionBottom + 50;

      // Footer에서 위로 스크롤 시: 무조건 마지막 섹션으로 이동
      if (isInFooterArea && direction < 0) {
        e.preventDefault();
        isScrollingRef.current = true;

        const targetTop = lastSectionRect.top + currentScrollY;
        window.scrollTo({
          top: targetTop,
          behavior: "smooth",
        });

        setTimeout(() => {
          isScrollingRef.current = false;
        }, 1200);
        return;
      }

      // 일반적인 경우: 가장 가까운 섹션 찾기
      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        const sectionTop = rect.top + currentScrollY;
        const distance = Math.abs(currentScrollY - sectionTop);

        if (distance < minDistance) {
          minDistance = distance;
          currentIndex = index;
        }
      });

      // 현재 섹션 정보
      const currentSection = sections[currentIndex] as HTMLElement;
      if (!currentSection) {
        return;
      }

      // 내부 스크롤이 있는 섹션 체크 (예: TheWaySection의 카드 전환)
      const hasInternalScroll = currentSection.hasAttribute("data-has-internal-scroll");

      if (hasInternalScroll) {
        // 현재 카드 세트 확인 (TheWaySection: "0" 또는 "1")
        const cardSet = currentSection.getAttribute("data-card-set");

        // 카드 전환이 필요한지 확인
        const needsInternalTransition =
          (direction > 0 && cardSet === "0") || // 아래로 + 첫 번째 카드 세트 → 내부 전환
          (direction < 0 && cardSet === "1");   // 위로 + 두 번째 카드 세트 → 내부 전환

        if (needsInternalTransition) {
          // 내부 카드 전환만 허용, 섹션 이동 안 함
          return;
        }
        // 경계 조건(카드 세트 0에서 위로, 카드 세트 1에서 아래로)은 ScrollSnapContainer가 처리
      }

      const currentRect = currentSection.getBoundingClientRect();
      const sectionHeight = currentRect.height;
      const sectionTop = currentRect.top + currentScrollY;
      const sectionBottom = sectionTop + sectionHeight;

      // 긴 섹션 판단 (viewport 높이보다 큰 경우)
      const isTallSection = sectionHeight > viewportHeight;

      // 현재 섹션 내 스크롤 위치 (0부터 sectionHeight까지)
      const scrollPositionInSection = currentScrollY - sectionTop;

      if (isTallSection) {
        // 긴 섹션: 내부 스크롤 허용, 경계에서만 스냅
        const isAtTop = scrollPositionInSection <= 10; // 상단 여유 10px
        const isAtBottom =
          currentScrollY + viewportHeight >= sectionBottom - 10; // 하단 여유 10px

        // 아래로 스크롤 시: 섹션 하단에 도달했을 때만 다음 섹션으로
        if (direction > 0 && !isAtBottom) {
          // 섹션 내부 스크롤 허용
          return;
        }

        // 위로 스크롤 시: 섹션 상단에 도달했을 때만 이전 섹션으로
        if (direction < 0 && !isAtTop) {
          // 섹션 내부 스크롤 허용
          return;
        }
      } else {
        // 짧은 섹션: 동적 스크롤 임계값 체크
        const BASE_THRESHOLD = 50; // 100px → 50px로 감소 (민감도 2배 향상)
        const SCROLL_THRESHOLD = BASE_THRESHOLD;

        // 빠른 스크롤 감지 (강한 스크롤은 즉시 전환)
        const isQuickScroll = Math.abs(e.deltaY) > 50;

        // 빠른 스크롤이 아닌 경우에만 임계값 체크
        if (!isQuickScroll) {
          // 아래로 스크롤: 임계값 이상 스크롤했을 때만 다음 섹션으로 전환
          if (direction > 0 && scrollPositionInSection < SCROLL_THRESHOLD) {
            // 임계값 미달 - 스냅 안 함
            return;
          }

          // 위로 스크롤: 섹션 하단에서 임계값 이상 올라왔을 때만 이전 섹션으로 전환
          if (direction < 0 && scrollPositionInSection > sectionHeight - SCROLL_THRESHOLD) {
            // 임계값 미달 - 스냅 안 함
            return;
          }
        }
        // 빠른 스크롤은 임계값 무시하고 바로 아래 섹션 전환 로직으로 진행
      }

      // 여기까지 도달하면: 짧은 섹션의 임계값을 초과했거나, 긴 섹션의 경계에 도달한 경우

      // 다음/이전 섹션 인덱스 계산
      let nextIndex = currentIndex + direction;

      // Container 밖으로 나가는 경우: 일반 스크롤 허용 (NFT Sale, ButtonShowcase로 자연스럽게 이동)
      if (nextIndex >= sections.length && direction > 0) {
        // 아래로 스크롤 시 일반 스크롤 허용
        return;
      }

      // 여기서부터 snap 동작
      e.preventDefault();
      isScrollingRef.current = true;

      if (nextIndex < 0) {
        // 첫 섹션 위로는 못 감
        nextIndex = 0;
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      } else {
        // 타겟 섹션으로 부드럽게 스크롤
        const targetSection = sections[nextIndex] as HTMLElement;
        if (targetSection) {
          const targetTop = targetSection.getBoundingClientRect().top + currentScrollY;
          window.scrollTo({
            top: targetTop,
            behavior: "smooth",
          });
        }
      }

      // 1.2초 후 스크롤 잠금 해제 (1.8초에서 33% 단축)
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 1200);
    };

    // Container에만 Wheel 이벤트 리스너 추가 (passive: false로 preventDefault 가능)
    // Container 밖의 섹션들(NFT Sale, ButtonShowcase)은 자연스럽게 스크롤됨
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return <div ref={containerRef} className={className}>{children}</div>;
}
