// src/utils/envValidation.ts
import { EnvSchema } from "./envSchema";
import { z } from "zod";

export function validateEnv() {
  try {
    const env = Object.entries(import.meta.env).reduce(
      (acc, [key, value]) => ({ ...acc, [key]: value }),
      {} as Record<string, string>
    );

    const parsed = EnvSchema.parse(env);

    if (import.meta.env.DEV) {
      console.log("✅ 환경 변수 검증 성공:", parsed);
    }

    return parsed;
  } catch (error) {
    // ZodError 타입 확인
    if (error instanceof z.ZodError) {
      console.error("❌ 환경 변수 검증 실패:", error.errors);
      throw new Error(
        `환경 변수 오류: ${error.errors.map((e) => `${e.path}: ${e.message}`).join(", ")}`
      );
    }

    // 일반 에러 처리
    console.error("❌ 알 수 없는 오류:", error);
    throw new Error("알 수 없는 환경 변수 오류 발생");
  }
}
