/**
 * Nasun Wallet 암호화 유틸리티
 * Web Crypto API 기반 AES-256-GCM 암호화
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// PBKDF2 설정
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * 새 Ed25519 키페어 생성
 */
export function generateKeypair(): Ed25519Keypair {
  return new Ed25519Keypair();
}

/**
 * BIP39 니모닉 생성 (12단어)
 * @returns 12단어 영어 니모닉 문구
 */
export function generateMnemonicPhrase(): string {
  return generateMnemonic(wordlist, 128); // 128 bits = 12 words
}

/**
 * 니모닉 유효성 검증
 * @param mnemonic BIP39 니모닉 문구
 * @returns 유효한 니모닉이면 true
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

/**
 * 니모닉에서 키페어 복구
 * @param mnemonic BIP39 니모닉 (12/24 단어)
 * @param path 옵션 - 기본값 "m/44'/784'/0'/0'/0'" (SUI 표준)
 */
export function keypairFromMnemonic(mnemonic: string, path?: string): Ed25519Keypair {
  return Ed25519Keypair.deriveKeypair(mnemonic.trim().toLowerCase(), path);
}

/**
 * 키페어에서 주소 추출
 */
export function getAddressFromKeypair(keypair: Ed25519Keypair): string {
  return keypair.getPublicKey().toSuiAddress();
}

/**
 * 키페어에서 공개키 추출 (hex)
 */
export function getPublicKeyFromKeypair(keypair: Ed25519Keypair): string {
  return keypair.getPublicKey().toBase64();
}

/**
 * 비밀번호에서 암호화 키 유도 (PBKDF2)
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 개인키 암호화
 * @param privateKey Bech32 인코딩된 개인키 문자열 (suiprivkey1...)
 */
export async function encryptPrivateKey(
  privateKey: string,
  password: string
): Promise<{ encrypted: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  // Bech32 문자열을 UTF-8 바이트로 변환
  const encoder = new TextEncoder();
  const privateKeyBytes = encoder.encode(privateKey);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
    key,
    privateKeyBytes.buffer.slice(privateKeyBytes.byteOffset, privateKeyBytes.byteOffset + privateKeyBytes.byteLength) as ArrayBuffer
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer),
  };
}

/**
 * 개인키 복호화
 * @returns Bech32 인코딩된 개인키 문자열 (suiprivkey1...)
 */
export async function decryptPrivateKey(
  encryptedBase64: string,
  ivBase64: string,
  saltBase64: string,
  password: string
): Promise<string> {
  const encrypted = base64ToArrayBuffer(encryptedBase64);
  const iv = base64ToArrayBuffer(ivBase64);
  const salt = base64ToArrayBuffer(saltBase64);

  const key = await deriveKey(password, new Uint8Array(salt));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    encrypted
  );

  // UTF-8 바이트를 Bech32 문자열로 변환
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Bech32 개인키에서 키페어 복원
 * @param secretKey Bech32 인코딩된 개인키 문자열 (suiprivkey1...)
 */
export function keypairFromSecretKey(secretKey: string): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(secretKey);
}

/**
 * 키페어에서 Bech32 개인키 추출
 * @returns Bech32 인코딩된 개인키 문자열 (suiprivkey1...)
 */
export function getSecretKeyFromKeypair(keypair: Ed25519Keypair): string {
  // getSecretKey()는 Bech32 인코딩된 문자열을 반환
  return keypair.getSecretKey();
}

// 유틸리티 함수
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
