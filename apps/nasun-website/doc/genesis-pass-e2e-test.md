# Genesis Pass Drop E2E 테스트 계획

## 테스트 환경

- URL: https://staging.nasun.io
- 네트워크: Sepolia Testnet
- 어드민: staging.nasun.io/admin/genesis-pass-drop
- 컨트랙트: 0xdE0769F2d43e9f85E688F0641Ec4bF699b6DdBc8

## 테스트 지갑

| 지갑 이름 | 주소 | mintType | 해당 스테이지 |
|-----------|------|----------|---------------|
| Nasun Genesis Pass | 0xE682...4c5E | FREE_MINT | Stage 1 |
| Marketplace Owner | 0xe949...0828 | FREE_MINT | Stage 1 |
| Account 4 | 0xEc2c...8a78 | FREE_MINT | Stage 1 |
| IOTA evm test | 0xfEC9...397a | GUARANTEED | Stage 2 |
| Nasun NFT test | 0x963b...Fd3E | (null) | Stage 3 |

## 사전 준비

- 모든 테스트 지갑이 MetaMask에 임포트되어 있어야 함
- 유료 스테이지에서 민트할 지갑에 Sepolia ETH가 충분히 있어야 함
- 각 테스트 지갑이 My Account 페이지에서 MetaMask 연결을 통해 Nasun 계정과 연동되어 있어야 함
- 어드민 지갑(컨트랙트 owner)이 스테이지 전환을 위해 준비되어 있어야 함

## 중요: MetaMask 계정 전환 시 주의사항

MetaMask 계정을 전환해도 dApp에 즉시 반영되지 않을 수 있습니다.
테스트 중 MetaMask 계정을 전환할 때:

1. MetaMask에서 계정 전환
2. **페이지 새로고침 (F5)**
3. 표시된 지갑 주소가 변경되었는지 확인
4. 주소가 변경되지 않았다면, 지갑 연결을 해제한 후 새 계정으로 재연결

---

## 테스트 1: 민트 전 상태 (Stage 0 - PAUSED)

**목표**: 일시정지 상태에서 민트가 차단되는지 확인

1. 어드민: 스테이지가 **PAUSED**인지 확인
2. 드롭 페이지에서 아무 지갑으로 연결
3. 에디션 선택 후 Mint 클릭
4. **기대 결과**: Mint 버튼 비활성화 또는 "Minting is currently paused" 에러
5. 카운트다운 타이머가 Free Mint 스테이지까지 정확한 시간을 표시하는지 확인

## 테스트 2: Stage 1 - Free Mint (등록된 지갑)

**목표**: FREE_MINT 얼라우리스트 지갑이 무료로 민트할 수 있는지 확인

1. 어드민: 스테이지를 **Free Mint**으로 설정
2. 지갑 `0xE682...4c5E` (FREE_MINT) 연결
3. 가격이 **Free**로 표시되는지 확인
4. 에디션 선택 후 Mint 클릭
5. MetaMask 트랜잭션 확인 (가스비만, ETH 전송 없음)
6. **기대 결과**: 민트 성공, 에디션 영상 + Etherscan 링크가 포함된 성공 화면 표시
7. "Go to My Account" 클릭 후 NFT가 표시되는지 확인

## 테스트 3: Stage 1 - Free Mint (중복 민트 방지)

**목표**: 같은 지갑으로 두 번 민트할 수 없는지 확인

1. 같은 지갑 `0xE682...4c5E`, 같은 스테이지
2. 페이지 새로고침
3. **기대 결과**: "You own a Genesis Pass" 메시지 표시, Mint 버튼 없음

## 테스트 4: Stage 1 - Free Mint (잘못된 스테이지 거부)

**목표**: GTD/FCFS 지갑이 Free Mint 스테이지에서 민트할 수 없는지 확인

1. 현재 지갑 연결 해제
2. 페이지 새로고침
3. 지갑 `0xfEC9...397a` (GUARANTEED - Stage 2 전용) 연결
4. 에디션 선택 후 Mint 클릭
5. **기대 결과**: "Not eligible for current stage" 에러 (mint-signature Lambda에서 403)

## 테스트 5: Stage 1 - Free Mint (미등록 지갑 거부)

**목표**: 얼라우리스트에 없는 지갑이 거부되는지 확인

1. 현재 지갑 연결 해제
2. 페이지 새로고침
3. **얼라우리스트에 없는** 지갑 연결
4. 에디션 선택 후 Mint 클릭
5. **기대 결과**: 자격 없음 에러

## 테스트 6: Stage 2 - GTD Allowlist Mint

**목표**: GUARANTEED 지갑이 GTD 가격으로 민트할 수 있는지 확인

1. 어드민: 스테이지를 **GTD Allowlist Mint**로 설정
2. 현재 지갑 연결 해제, 페이지 새로고침
3. 지갑 `0xfEC9...397a` (GUARANTEED) 연결
4. 가격이 **0.003 ETH**로 표시되는지 확인
5. 에디션 선택 후 Mint 클릭
6. MetaMask 트랜잭션 확인 (0.003 ETH + 가스비)
7. **기대 결과**: 민트 성공
8. 페이지 새로고침 - "You own a Genesis Pass" 표시 확인

## 테스트 7: Stage 2 - GTD 지갑 제한 (지갑당 1개)

**목표**: GTD 지갑이 2개 이상 민트할 수 없는지 확인

1. 같은 지갑 `0xfEC9...397a`, 같은 스테이지
2. 다시 민트 시도
3. **기대 결과**: 차단 (이미 보유 또는 지갑 제한 초과)

## 테스트 8: Stage 2 - Free Mint 지갑은 GTD 스테이지에서 민트 불가

**목표**: 아직 민트하지 않은 FREE_MINT 지갑이 Stage 2에서 거부되는지 확인

1. 연결 해제, 페이지 새로고침
2. 지갑 `0xe949...0828` (FREE_MINT - Stage 1을 놓친 지갑) 연결
3. 에디션 선택 후 Mint 클릭
4. **기대 결과**: "Not eligible for current stage" 에러 (FREE_MINT != Stage 2)

## 테스트 9: Stage 3 - FCFS Allowlist Mint

**목표**: FCFS 지갑 (mintType 없음)이 민트할 수 있는지 확인

1. 어드민: 스테이지를 **FCFS Allowlist Mint**로 설정
2. 연결 해제, 페이지 새로고침
3. 지갑 `0x963b...Fd3E` (FCFS - mintType 없음) 연결
4. 에디션 선택 후 Mint 클릭
5. 트랜잭션 확인
6. **기대 결과**: 민트 성공

## 테스트 10: Stage 4 - Public Mint

**목표**: 얼라우리스트/서명 없이 누구나 민트할 수 있는지 확인

1. 어드민: 스테이지를 **Public Mint**로 설정
2. 연결 해제, 페이지 새로고침
3. **얼라우리스트에 없는** 아무 지갑 연결
4. 에디션 선택 후 Mint 클릭
5. **기대 결과**: 민트 성공 (서명 불필요, 컨트랙트 직접 호출)

## 테스트 11: Public Mint - Stage 1을 놓친 FREE_MINT 지갑

**목표**: Stage 1을 놓친 FREE_MINT 지갑이 Public 스테이지에서 민트할 수 있는지 확인

1. 지갑 `0xe949...0828` (Stage 2에서 거부된 FREE_MINT 지갑) 연결
2. 에디션 선택 후 Mint 클릭
3. **기대 결과**: 민트 성공 (Public 스테이지는 얼라우리스트 검사 없음)

## 테스트 12: Mint Deadline

**목표**: 마감 이후 민트가 차단되는지 확인

1. 어드민: 현재 시각으로부터 약 2분 후로 mint deadline 설정
2. 마감 시각이 지날 때까지 대기
3. 자격 있는 아무 지갑으로 민트 시도
4. **기대 결과**: "Minting period has ended" 에러
5. 어드민: 정상 운영 복구를 위해 deadline 제거

## 테스트 13: 스테이지 전환 - PAUSED 복귀

**목표**: 어드민이 언제든 민트를 일시정지할 수 있는지 확인

1. 어드민: 스테이지를 **PAUSED**로 설정
2. 민트 시도
3. **기대 결과**: 민트 차단

---

## 테스트 후 검증

### 온체인 검증
- Etherscan (Sepolia)에서 모든 성공한 민트 트랜잭션 확인
- 민트된 각 NFT의 tokenId가 선택한 에디션과 일치하는지 확인
- `uri(tokenId)`가 유효한 메타데이터 URL을 반환하는지 확인

### 메타데이터 검증
- 민트된 각 토큰에 대해 `https://nasun.io/metadata/genesis-pass/{tokenId}.json` 열기
- `image` URL이 Arweave에서 썸네일을 로드하는지 확인
- `animation_url`이 Arweave에서 영상을 로드하는지 확인

### My Account 페이지 검증
- 민트한 각 지갑의 My Account에 Genesis Pass가 표시되어야 함
- NFT 카드에 올바른 에디션 영상이 표시되어야 함
- 에디션 이름과 번호가 일치해야 함

---

## 알려진 제한사항

- **MetaMask 계정 전환**: 활성 MetaMask 계정을 변경해도 dApp 상태가 즉시 업데이트되지 않을 수 있음. 계정 전환 후 반드시 페이지를 새로고침할 것.
- **스테이지 진행**: 스테이지 전환은 전진만 가능 (Free -> GTD -> FCFS -> Public). PAUSED(0)는 어떤 스테이지에서든 설정 가능. 이전 스테이지로 되돌아가는 것은 불가능.
- **서명 쿨다운**: mint-signature Lambda는 지갑당 60초 쿨다운을 적용. 서명 요청 후 재시도하려면 60초를 기다려야 함.
