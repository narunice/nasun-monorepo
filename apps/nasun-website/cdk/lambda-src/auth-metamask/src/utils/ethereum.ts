import { verifyMessage } from 'ethers';

/**
 * 이더리움 서명을 검증하고 서명자의 주소를 반환
 * @param message 원본 메시지
 * @param signature 서명 (0x...)
 * @returns 복구된 지갑 주소
 */
export async function verifySignature(
  message: string,
  signature: string
): Promise<string> {
  try {
    const recoveredAddress = verifyMessage(message, signature);
    return recoveredAddress;
  } catch (error) {
    console.error('Signature verification failed:', error);
    throw new Error('Invalid signature format');
  }
}
