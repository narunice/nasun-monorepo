import { Chart as ChartJS, Plugin } from "chart.js";

/**
 * Chart.js 커스텀 플러그인: Connector Line
 *
 * 도넛 차트의 각 세그먼트와 외부 레이블을 연결하는 선을 그립니다.
 * - Desktop에서만 실행 (Mobile은 현재 vertical 레이아웃 유지)
 * - 투명 세그먼트(간격)는 제외
 * - NASUN Scarlet 디자인 적용
 */

interface LabelPosition {
  x: number;
  y: number;
  align: "left" | "right" | "center";
}

export const connectorLinePlugin: Plugin = {
  id: "connectorLinePlugin",

  afterDraw: (chart: ChartJS) => {
    // Mobile에서는 실행하지 않음 (768px 미만)
    if (window.innerWidth < 768) {
      return;
    }

    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    const { chartArea, width, height } = chart;

    if (!meta || !meta.data) {
      return;
    }

    const { left, right, top, bottom } = chartArea;
    const chartCenterX = (left + right) / 2;
    const chartCenterY = (top + bottom) / 2;

    // 투명 세그먼트(간격) 제외 - 짝수 인덱스만 (0, 2, 4, 6, 8)
    const realElements = meta.data.filter((_, idx) => idx % 2 === 0);

    // 레이블 위치 계산 (현재 HTML absolute positioning 참고)
    // distributionData 순서: [0] Community Reserve, [1] Public Sales,
    //                        [2] Early Contributors, [3] Nasun Core, [4] Testers
    const labelPositions: LabelPosition[] = [
      // [0] Community Reserve - 오른쪽 상단
      {
        x: right + 80,
        y: top + 80,
        align: "left"
      },
      // [1] Public Community Sales - 오른쪽 하단
      {
        x: right + 80,
        y: bottom - 40,
        align: "left"
      },
      // [2] Early Contributors - 아래 중앙
      {
        x: chartCenterX,
        y: bottom + 100,
        align: "center"
      },
      // [3] Nasun Core - 왼쪽 하단
      {
        x: left - 80,
        y: bottom - 40,
        align: "right"
      },
      // [4] Testers & Community - 왼쪽 상단
      {
        x: left - 80,
        y: top + 40,
        align: "right"
      },
    ];

    // 각 실제 세그먼트에 대해 연결선 그리기
    realElements.forEach((element: any, idx: number) => {
      const { x, y, startAngle, endAngle, outerRadius } = element;

      // 1. 세그먼트 중심 각도 계산
      const angle = (startAngle + endAngle) / 2;

      // 2. 세그먼트 외곽 끝점 (연결선 시작점)
      const segmentEndX = x + Math.cos(angle) * outerRadius;
      const segmentEndY = y + Math.sin(angle) * outerRadius;

      // 3. 레이블 위치 (연결선 끝점)
      const labelPos = labelPositions[idx];

      if (!labelPos) {
        return; // 레이블 위치가 정의되지 않은 경우 스킵
      }

      // 4. Canvas API로 연결선 그리기
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(segmentEndX, segmentEndY);

      // 중간 지점 계산 (부드러운 곡선을 위한 control point)
      const controlX = (segmentEndX + labelPos.x) / 2;
      const controlY = (segmentEndY + labelPos.y) / 2;

      // 직선으로 연결 (참고 이미지처럼 직선)
      ctx.lineTo(labelPos.x, labelPos.y);

      // 연결선 스타일 (흰색, 2px, 부드럽게)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)"; // 60% 투명도
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    });
  },
};
