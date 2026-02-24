# Security Reference

## 지갑 암호화

- **암호화**: Web Crypto API (AES-256-GCM + PBKDF2 100,000 iterations)
- **키 저장**: localStorage에 암호화된 상태로 저장
- **메모리 관리**: 개인키 사용 후 메모리에서 제거

## Rate Limiting (비밀번호 brute force 방지)

- 8회 연속 실패 → 30초 lockout
- 12회 연속 실패 → 5분 lockout
- 16회 이상 실패 → 30분 lockout
- 성공 시 카운터 초기화
- localStorage에 저장되어 새로고침해도 유지

## zkLogin

Google OAuth 기반 ZK proof 인증:

- Salt 관리 Lambda (AWS)
- Ephemeral keypair 생성
- ZK proof 서명
