import { useState, useEffect, useMemo } from "react";
import { ChartOptions } from "chart.js";
import { distributionData } from "../../../../constants/pageContent/vision";

// NASUN 색상 팔레트 (tailwind config 기준)
const COLORS = [
  { border: "#B3E0FF", bg: "#B3E0FFBB" }, // (Community & Ecosystem)
  { border: "#2A64C5", bg: "#2A64C5BB" }, // c5 (Team and Advisors)
  { border: "#ff9900", bg: "#ff9900BB" }, // c4 (Public & Private Investors)
  { border: "#10b981", bg: "#10b981BB" }, // emerald (Treasury Reserve)
  { border: "#9333ea", bg: "#9333eaBB" }, // purple (Foundation)
  { border: "#ff4d4f", bg: "#ff4d4fBB" }, // (Early Contributors)
  { border: "#fa3102", bg: "#fa3102BB" }, // scarlet (Ecosystem Liquidity & Market Making)
];

export const useTokenChart = () => {
  // 다크모드 감지
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // 초기 다크모드 상태 확인
    const checkDarkMode = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setIsDarkMode(isDark);
    };

    checkDarkMode();

    // MutationObserver로 다크모드 변경 감지
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    const GAP_PERCENTAGE = 1.2;

    // 실제 세그먼트와 간격 세그먼트를 교대로 배치
    const spacedLabels: string[] = [];
    const spacedData: number[] = [];
    const spacedBgColors: string[] = [];
    const spacedHoverBgColors: string[] = [];
    const spacedBorderColors: string[] = [];
    const spacedBorderWidths: number[] = [];

    distributionData.forEach((item, index) => {
      // 실제 세그먼트 (간격만큼 차감)
      spacedLabels.push(item.name);
      spacedData.push(item.value - GAP_PERCENTAGE);
      spacedBgColors.push("transparent"); // 투명 배경 (Chart.js hit detection은 border로 처리)
      spacedHoverBgColors.push(COLORS[index].border + "1A"); // hover 시 10% 투명도 배경
      spacedBorderColors.push(COLORS[index].border);
      spacedBorderWidths.push(2); // 테두리 두께

      // 투명 간격 세그먼트
      spacedLabels.push("");
      spacedData.push(GAP_PERCENTAGE);
      spacedBgColors.push("transparent");
      spacedHoverBgColors.push("transparent");
      spacedBorderColors.push("transparent");
      spacedBorderWidths.push(0);
    });

    return {
      labels: spacedLabels,
      datasets: [
        {
          data: spacedData,
          backgroundColor: spacedBgColors,
          hoverBackgroundColor: spacedHoverBgColors,
          borderColor: spacedBorderColors,
          borderWidth: spacedBorderWidths,
          hoverOffset: 0,
          spacing: 0,
          borderRadius: 8,
        },
      ],
    };
  }, []);

  // 차트 옵션 설정 (다크모드에 따라 라벨 색상 변경)
  const chartOptions: ChartOptions<"doughnut"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      interaction: {
        mode: "nearest",
        intersect: true,
      },
      layout: {
        padding: {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        },
      },
      transitions: {
        active: {
          animation: {
            duration: 400,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: false, // 툴팁 비활성화
        },
        datalabels: {
          color: isDarkMode ? "#faf7f4" : "#191615", // 다크모드: nasun-white, 라이트모드: nasun-black
          backgroundColor: "transparent", // 레이블 배경 제거
          borderRadius: 4,
          padding: {
            top: 4,
            bottom: 4,
            left: 8,
            right: 8,
          },
          font: {
            size: 16,
            weight: "normal",
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          display: (context: any) => {
            // 간격 세그먼트(홀수 인덱스)는 레이블 완전히 숨김
            return context.dataIndex % 2 === 0;
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (_value: number, context: any) => {
            const realIndex = Math.floor(context.dataIndex / 2);
            const realValue = distributionData[realIndex].value;
            return `${realValue}%`;
          },
        },
      },
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 1500,
        easing: "easeOutQuart",
      },
    }),
    [isDarkMode]
  );

  return {
    chartData,
    chartOptions,
    colors: COLORS,
  };
};
