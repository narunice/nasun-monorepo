import React, { memo } from "react";

// V2 전용 버전 표시 컴포넌트 - 더 이상 버전 스위칭 불가
const VersionSwitcher: React.FC = memo(() => {
  return (
    <div className="space-y-4">
      {/* V2 시스템 표시 */}
      <div className="text-center">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-lg-xl shadow-lg hover:scale-105 bg-gradient-to-r from-gray-800 to-gray-900 dark:from-gray-100 dark:to-gray-200 text-black">
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              <span>🚀</span>
              <span className="font-semibold">커뮤니티 리더보드</span>
              <span className="px-2 py-0.5 rounded-lg-full font-medium bg-black/20 text-black">
                최신
              </span>
            </div>
            <p className="opacity-90 mt-1 max-w-md text-left">
              전체 기간의 누적 점수와 활동을 추적하는 고도화된 리더보드 시스템
            </p>
          </div>
        </div>
      </div>

      {/* V2 시스템 특징 */}
      <div className="max-w-2xl mx-auto">
        <div className="p-6 rounded-lg border-2 border-gray-700 bg-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <span>🚀</span>
            <h3 className="font-semibold text-white">커뮤니티 리더보드 시스템</h3>
            <span className="px-2 py-0.5 bg-gray-700 text-white rounded-lg-full font-medium">
              활성
            </span>
          </div>

          <p className="text-gray-400 mb-4">
            지속적인 참여를 보상하는 누적 점수 시스템으로 더 공정하고 의미있는 순위를 제공합니다.
          </p>

          <ul className="space-y-2">
            <li className="flex items-start gap-2 text-gray-400">
              <span className="mt-0.5 text-gray-400">•</span>
              <span>전체 기간 누적 점수 추적</span>
            </li>
            <li className="flex items-start gap-2 text-gray-400">
              <span className="mt-0.5 text-gray-400">•</span>
              <span>북마크 기능 지원 (3.5점 가중치)</span>
            </li>
            <li className="flex items-start gap-2 text-gray-400">
              <span className="mt-0.5 text-gray-400">•</span>
              <span>리트윗 보너스 시스템 (6.0점)</span>
            </li>
            <li className="flex items-start gap-2 text-gray-400">
              <span className="mt-0.5 text-gray-400">•</span>
              <span>실시간 데이터 수집 및 업데이트</span>
            </li>
            <li className="flex items-start gap-2 text-gray-400">
              <span className="mt-0.5 text-gray-400">•</span>
              <span>봇 계정 자동 필터링</span>
            </li>
            <li className="flex items-start gap-2 text-gray-400">
              <span className="mt-0.5 text-gray-400">•</span>
              <span>향상된 성능 및 안정성</span>
            </li>
          </ul>
        </div>
      </div>

      {/* 시스템 안내 */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
          <span>✨</span>
          <span>커뮤니티 리더보드 시스템이 활성화되어 더욱 정확하고 공정한 순위를 제공합니다</span>
        </div>
      </div>
    </div>
  );
});

VersionSwitcher.displayName = "VersionSwitcher";

export default VersionSwitcher;
