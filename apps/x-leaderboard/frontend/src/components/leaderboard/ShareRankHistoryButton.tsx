/**
 * 🆕 Rank History: ShareRankHistoryButton Component
 *
 * @description
 * 랭킹 히스토리 그래프를 X(Twitter)에 공유하는 버튼 컴포넌트입니다.
 * - html2canvas로 차트 영역 스크린샷 캡처
 * - Clipboard API로 이미지 복사
 * - X intent URL로 트윗 작성 창 열기
 * - Toast 알림
 *
 * @author Claude Code
 * @date 2025-10-26
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
// html2canvas is dynamically imported in captureAndCopyToClipboard to reduce initial bundle size
import { Button } from '@/components/ui/button';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { InlineLoading } from '@/components/ui';

export interface ShareRankHistoryButtonProps {
  /** 캡처할 차트 영역의 ref */
  chartRef: React.RefObject<HTMLDivElement | null>;
  /** 사용자명 */
  username: string;
  /** 기간 */
  period: string;
  /** 날짜 범위 (일) */
  days: number;
}

/**
 * ShareRankHistoryButton 컴포넌트
 *
 * @example
 * const chartRef = useRef<HTMLDivElement>(null);
 *
 * <div ref={chartRef}>
 *   <RankHistoryChart history={data.history} />
 * </div>
 *
 * <ShareRankHistoryButton
 *   chartRef={chartRef}
 *   username="johndoe"
 *   period="cumulative"
 *   days={7}
 * />
 */
export const ShareRankHistoryButton: React.FC<ShareRankHistoryButtonProps> = ({
  chartRef,
  username,
  period,
  days,
}) => {
  const { t } = useTranslation(['myAccount', 'common']);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * 공유 메시지 생성 (X/Twitter용)
   */
  const getShareMessage = (): string => {
    const hashtag = t('rankHistory.share.hashtag', { defaultValue: 'Web3' });
    const periodLabel = period === 'cumulative' ? 'Cumulative' : `Event ${period}`;

    return t('rankHistory.share.message', {
      username,
      period: periodLabel,
      days,
      hashtag,
      defaultValue: `Check out @${username}'s rank history on NASUN! 📊\n${periodLabel} - Last ${days} days\n\n#${hashtag}`,
    });
  };

  /**
   * 차트를 이미지로 캡처하고 클립보드에 복사
   */
  const captureAndCopyToClipboard = async (): Promise<boolean> => {
    if (!chartRef.current) {
      console.error('❌ Chart ref is null');
      toast.error(t('rankHistory.share.error.noChart', { defaultValue: 'Chart not found' }));
      return false;
    }

    try {
      console.log('📸 [ShareRankHistory] Capturing chart...');

      // 다크모드 감지
      const isDarkMode = document.documentElement.classList.contains('dark');
      const backgroundColor = isDarkMode ? '#000000' : '#ffffff'; // dark:black : white

      // Dynamically import html2canvas (reduces initial bundle by ~204KB)
      const html2canvas = await import('html2canvas').then((m) => m.default);
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor,
        scale: 2, // 고해상도
        logging: false,
        useCORS: true,
        allowTaint: false, // 외부 리소스 렌더링에 필요
        imageTimeout: 15000, // 외부 이미지 로딩 타임아웃
        onclone: (clonedDoc) => {
          // 1. 버튼 정렬 강제 적용
          const buttons = clonedDoc.querySelectorAll('button');
          buttons.forEach(btn => {
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
          });

          // 2. SVG 아이콘 강제 표시 (FontAwesome 안정화)
          const svgs = clonedDoc.querySelectorAll('svg');
          svgs.forEach(svg => {
            svg.style.display = 'inline-block';
            svg.style.visibility = 'visible';
          });
        },
      });

      console.log('✅ [ShareRankHistory] Canvas created:', {
        width: canvas.width,
        height: canvas.height,
      });

      // Canvas를 Blob으로 변환
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (!blob) {
        throw new Error('Failed to convert canvas to blob');
      }

      console.log('✅ [ShareRankHistory] Blob created:', {
        size: blob.size,
        type: blob.type,
      });

      // Clipboard API로 복사
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);

      console.log('✅ [ShareRankHistory] Image copied to clipboard');
      return true;
    } catch (error) {
      console.error('❌ [ShareRankHistory] Capture/Copy failed:', error);

      // Clipboard API 지원 여부 확인
      if (!navigator.clipboard) {
        toast.error(
          t('rankHistory.share.error.clipboardNotSupported', {
            defaultValue: 'Clipboard API not supported in this browser',
          })
        );
      } else {
        toast.error(
          t('rankHistory.share.error.captureFailed', {
            defaultValue: 'Failed to capture chart image',
          })
        );
      }

      return false;
    }
  };

  /**
   * X(Twitter) 공유 처리
   */
  const handleShare = async () => {
    try {
      // 1. 폰트 로딩 대기 (html2canvas 렌더링 안정성 보장)
      await document.fonts.ready;

      // 2. 차트를 이미지로 캡처하고 클립보드에 복사 (상태 변경 전!)
      const copySuccess = await captureAndCopyToClipboard();

      if (!copySuccess) {
        return;
      }

      // 3. 캡처 완료 후 UI 업데이트 (버튼 내용 변경)
      setIsProcessing(true);

      // 4. 성공 Toast 표시
      toast.success(
        t('rankHistory.share.success', {
          defaultValue: '📋 Image copied to clipboard! Opening X...',
        }),
        {
          autoClose: 3000,
        }
      );

      // 5. X intent URL 생성 및 열기
      const message = getShareMessage();
      const encodedMessage = encodeURIComponent(message);
      const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodedMessage}`;

      console.log('🐦 [ShareRankHistory] Opening X intent URL');

      // 새 창으로 열기
      window.open(xIntentUrl, '_blank', 'width=550,height=420');

      // 6. 사용 안내 Toast (0.5초 후)
      setTimeout(() => {
        toast.info(
          t('rankHistory.share.instruction', {
            defaultValue: '💡 Paste the image with Ctrl+V (Cmd+V on Mac)',
          }),
          {
            autoClose: 5000,
          }
        );
        // 버튼 상태 원복
        setIsProcessing(false);
      }, 500);
    } catch (error) {
      console.error('❌ [ShareRankHistory] Share failed:', error);
      toast.error(
        t('rankHistory.share.error.generic', {
          defaultValue: 'Failed to share. Please try again.',
        })
      );
      setIsProcessing(false);
    }
  };

  return (
    <Button
      onClick={handleShare}
      disabled={isProcessing}
      variant="filledOutlineC3"
      title={t('rankHistory.share.button', { defaultValue: 'Share on X' })}
    >
      {isProcessing ? (
        <InlineLoading
          message={t('rankHistory.share.processing', { defaultValue: 'Processing...' })}
          size="sm"
        />
      ) : (
        <>
          <span>Share on</span>
          <FontAwesomeIcon icon={faXTwitter} className="w-4 h-4 ml-2" />
        </>
      )}
    </Button>
  );
};
