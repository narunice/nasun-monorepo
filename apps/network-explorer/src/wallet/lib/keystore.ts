/**
 * Nasun Wallet 키 저장소
 * localStorage 기반 암호화된 키 저장
 */

import type { EncryptedKeystore } from '../types/wallet';
import {
  generateKeypair,
  generateMnemonicPhrase,
  isValidMnemonic,
  keypairFromMnemonic,
  getAddressFromKeypair,
  getSecretKeyFromKeypair,
  encryptPrivateKey,
  decryptPrivateKey,
  keypairFromSecretKey,
} from './crypto';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const KEYSTORE_KEY = 'nasun_wallet_keystore';

/**
 * 저장된 키스토어 존재 여부 확인
 */
export function hasKeystore(): boolean {
  return localStorage.getItem(KEYSTORE_KEY) !== null;
}

/**
 * 저장된 키스토어 로드
 */
export function loadKeystore(): EncryptedKeystore | null {
  const data = localStorage.getItem(KEYSTORE_KEY);
  if (!data) return null;

  try {
    return JSON.parse(data) as EncryptedKeystore;
  } catch {
    return null;
  }
}

/**
 * 키스토어 저장
 */
export function saveKeystore(keystore: EncryptedKeystore): void {
  localStorage.setItem(KEYSTORE_KEY, JSON.stringify(keystore));
}

/**
 * 키스토어 삭제
 */
export function deleteKeystore(): void {
  localStorage.removeItem(KEYSTORE_KEY);
}

/**
 * 새 지갑 생성 및 저장
 * @returns 생성된 주소
 */
export async function createAndSaveWallet(password: string): Promise<string> {
  const keypair = generateKeypair();
  const address = getAddressFromKeypair(keypair);
  const secretKey = getSecretKeyFromKeypair(keypair);

  const { encrypted, iv, salt } = await encryptPrivateKey(secretKey, password);

  const keystore: EncryptedKeystore = {
    encryptedPrivateKey: encrypted,
    iv,
    salt,
    address,
    createdAt: Date.now(),
  };

  saveKeystore(keystore);

  // Note: JavaScript 문자열은 불변이므로 메모리에서 직접 지울 수 없음
  // 변수 스코프가 끝나면 GC에 의해 정리됨

  return address;
}

/**
 * 키스토어에서 키페어 복호화
 * @returns 복호화된 키페어
 */
export async function unlockKeystore(password: string): Promise<Ed25519Keypair> {
  const keystore = loadKeystore();
  if (!keystore) {
    throw new Error('No wallet found');
  }

  try {
    const secretKey = await decryptPrivateKey(
      keystore.encryptedPrivateKey,
      keystore.iv,
      keystore.salt,
      password
    );

    const keypair = keypairFromSecretKey(secretKey);

    // Note: JavaScript 문자열은 불변이므로 메모리에서 직접 지울 수 없음

    // 주소 검증
    const address = getAddressFromKeypair(keypair);
    if (address !== keystore.address) {
      throw new Error('Address mismatch - keystore may be corrupted');
    }

    return keypair;
  } catch (error) {
    if (error instanceof Error && error.message.includes('decrypt')) {
      throw new Error('Invalid password');
    }
    throw error;
  }
}

/**
 * 저장된 주소 조회 (잠금 상태에서도 가능)
 */
export function getStoredAddress(): string | null {
  const keystore = loadKeystore();
  return keystore?.address ?? null;
}

/**
 * 니모닉 기반 새 지갑 생성
 * @param password 암호화 비밀번호
 * @returns { address, mnemonic } - 니모닉은 한 번만 반환됨 (저장하지 않음!)
 */
export async function createWalletWithMnemonic(
  password: string
): Promise<{ address: string; mnemonic: string }> {
  // 1. 니모닉 생성
  const mnemonic = generateMnemonicPhrase();

  // 2. 니모닉에서 키페어 생성
  const keypair = keypairFromMnemonic(mnemonic);
  const address = getAddressFromKeypair(keypair);
  const secretKey = getSecretKeyFromKeypair(keypair);

  // 3. 개인키 암호화 및 저장
  const { encrypted, iv, salt } = await encryptPrivateKey(secretKey, password);

  const keystore: EncryptedKeystore = {
    encryptedPrivateKey: encrypted,
    iv,
    salt,
    address,
    createdAt: Date.now(),
  };

  saveKeystore(keystore);

  // 4. 니모닉은 저장하지 않고 반환만 함 (사용자가 백업해야 함)
  return { address, mnemonic };
}

/**
 * 니모닉으로 기존 지갑 복구
 * @param mnemonic BIP39 니모닉 (12/24 단어)
 * @param password 새 암호화 비밀번호
 * @returns 복구된 주소
 */
export async function importWalletFromMnemonic(
  mnemonic: string,
  password: string
): Promise<string> {
  // 1. 니모닉 검증
  if (!isValidMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // 2. 니모닉에서 키페어 복구
  const keypair = keypairFromMnemonic(mnemonic);
  const address = getAddressFromKeypair(keypair);
  const secretKey = getSecretKeyFromKeypair(keypair);

  // 3. 개인키 암호화 및 저장
  const { encrypted, iv, salt } = await encryptPrivateKey(secretKey, password);

  const keystore: EncryptedKeystore = {
    encryptedPrivateKey: encrypted,
    iv,
    salt,
    address,
    createdAt: Date.now(),
  };

  saveKeystore(keystore);

  return address;
}

/**
 * 개인키로 지갑 복구
 * @param privateKey Bech32 형식 개인키 (suiprivkey1...)
 * @param password 새 암호화 비밀번호
 * @returns 복구된 주소
 */
export async function importWalletFromPrivateKey(
  privateKey: string,
  password: string
): Promise<string> {
  // 1. 개인키에서 키페어 복구
  let keypair: Ed25519Keypair;
  try {
    keypair = keypairFromSecretKey(privateKey.trim());
  } catch {
    throw new Error('Invalid private key format. Expected Bech32 format (suiprivkey1...)');
  }

  const address = getAddressFromKeypair(keypair);
  const secretKey = getSecretKeyFromKeypair(keypair);

  // 2. 개인키 암호화 및 저장
  const { encrypted, iv, salt } = await encryptPrivateKey(secretKey, password);

  const keystore: EncryptedKeystore = {
    encryptedPrivateKey: encrypted,
    iv,
    salt,
    address,
    createdAt: Date.now(),
  };

  saveKeystore(keystore);

  return address;
}
