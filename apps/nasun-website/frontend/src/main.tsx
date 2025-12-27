// main.tsx
import "./i18n"; // i18n 설정 파일 임포트 (가장 먼저 로드)
import { StrictMode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import { Amplify } from "aws-amplify";
import awsConfig from "./config/awsConfig"; // 기존 awsConfig 임포트 유지
import * as Tooltip from "@radix-ui/react-tooltip";
import { NasunProvider } from "./providers/NasunProvider";
import { ThemeProvider } from "./providers/theme/ThemeContext";
import AuthProvider from "./providers/auth/AuthContext";
import { validateEnv } from "./utils/envValidation";
import { configureWallet } from "@nasun/wallet";
import { WalletProvider } from "@nasun/wallet-ui";
import "./index.css";
import App from "./App";

// Configure Nasun Wallet
configureWallet({
  rpcUrl: import.meta.env.VITE_NASUN_RPC_URL || "https://rpc.devnet.nasun.io",
  faucetUrl: import.meta.env.VITE_NASUN_FAUCET_URL || "https://faucet.devnet.nasun.io",
  networkName: "Nasun Devnet",
  sessionPersist: true, // Keep wallet unlocked during browser session
});

// 1. QueryClient 인스턴스 생성 (가장 먼저 실행)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

// 2. Chrome Extension 에러 핸들링 (브라우저 확장 프로그램 통신 오류 방지)
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
      console.log("네트워크 모드:", process.env.VITE_NETWORK);
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

// 4. 애플리케이션 초기화 실행
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
              <WalletProvider>
                <NasunProvider>
                  <App />
                </NasunProvider>
              </WalletProvider>
            </QueryClientProvider>
            <ToastContainer
              position="top-right"
              autoClose={4000}
              theme="light"
              pauseOnHover
              pauseOnFocusLoss
            />
          </AuthProvider>
        </ThemeProvider>
      </Tooltip.Provider>
    </I18nextProvider>
  </StrictMode>
);