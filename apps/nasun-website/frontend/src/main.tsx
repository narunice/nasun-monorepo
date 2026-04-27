// main.tsx
import "./i18n"; // i18n 설정 파일 임포트 (가장 먼저 로드)
import { StrictMode, lazy, Suspense } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import { Amplify } from "aws-amplify";
import awsConfig from "./config/awsConfig"; // 기존 awsConfig 임포트 유지
import * as Tooltip from "@radix-ui/react-tooltip";
import { ThemeProvider } from "./providers/theme/ThemeContext";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import { validateEnv } from "./utils/envValidation";
import { queryClient } from "@/lib/queryClient";
import "./index.css";
import App from "./App";

// Lazy-load wallet layer: @nasun/wallet + @nasun/wallet-ui + @mysten/dapp-kit
// are deferred until after the app shell renders (~667KB gzip saved from initial load)
const WalletLayer = lazy(() => import("./providers/WalletLayer"));

// 1. Chrome Extension 에러 핸들링 (브라우저 확장 프로그램 통신 오류 방지)
function setupErrorHandlers() {
  // Chrome Extension runtime.lastError 에러 억제
  window.addEventListener('error', (event) => {
    if (event.message?.includes('runtime.lastError') || 
        event.message?.includes('message port closed') ||
        event.message?.includes('Extension context invalidated')) {
      // 브라우저 확장 프로그램 관련 에러는 콘솔에만 표시하고 앱 동작에 영향주지 않음
      console.warn('🔧 Browser extension communication warning:', event.message);
      event.preventDefault();
      return false;
    }
  });

  // Unhandled Promise 에러도 처리
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.message?.includes('runtime.lastError') ||
        event.reason?.message?.includes('message port closed')) {
      console.warn('🔧 Browser extension promise warning:', event.reason);
      event.preventDefault();
    }
  });
}

// 3. 환경 변수 검증 및 애플리케이션 초기화
function initializeApp() {
  try {
    setupErrorHandlers(); // 에러 핸들러 먼저 설정
    validateEnv(); // 환경 변수 검증
    Amplify.configure(awsConfig); // ← awsConfig 객체 그대로 사용

    // 개발 환경 로깅
    if (import.meta.env.DEV) {
      console.log("✅ 애플리케이션 초기화 완료");
      console.log("네트워크 모드:", import.meta.env.VITE_NETWORK);
    }
  } catch (error) {
    console.error("❌ 애플리케이션 초기화 실패:", error);

    // 개발 환경에서는 사용자에게 알림
    if (import.meta.env.DEV) {
      alert(`초기화 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }

    // 프로덕션에서는 오류 페이지로 리다이렉트 등의 처리 가능
    throw error;
  }
}

// uju.nasun.io 진입 시 루트(/) 를 실제 uju 앱으로 매핑.
// 같은 dist 를 nasun.io 와 공유하므로 hostname 으로 분기.
// 런칭 전 타깃 = /dev/uju (실제 앱). 런칭 후 /uju 로 이전 시 한 줄만 변경.
const UJU_ROOT_PATH = "/dev/uju";
function applyUjuHostRouting() {
  if (typeof window === "undefined") return;
  if (window.location.hostname !== "uju.nasun.io") return;
  const { pathname, search, hash } = window.location;
  if (pathname === "/" || pathname === "") {
    window.history.replaceState(null, "", UJU_ROOT_PATH + search + hash);
  }
}

// 4. 애플리케이션 초기화 실행
applyUjuHostRouting();
initializeApp();

// 5. 루트 요소 확인
const container = document.getElementById("root");
if (!container) throw new Error("Failed to find the root element");

// 6. 애플리케이션 렌더링
createRoot(container).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Tooltip.Provider delayDuration={100} skipDelayDuration={0} disableHoverableContent={false}>
        <ThemeProvider>
          <AuthProvider>
            <QueryClientProvider client={queryClient}>
              <Suspense fallback={null}>
                <WalletLayer>
                  <App />
                </WalletLayer>
              </Suspense>
            </QueryClientProvider>
            <ToastContainer
              position="top-right"
              autoClose={4000}
              theme="dark"
              pauseOnHover
              pauseOnFocusLoss
            />
          </AuthProvider>
        </ThemeProvider>
      </Tooltip.Provider>
    </I18nextProvider>
  </StrictMode>
);