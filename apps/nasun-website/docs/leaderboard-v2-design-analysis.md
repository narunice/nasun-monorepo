# Leaderboard V2 Design Analysis & Convention

이 문서는 Nasun Website의 리더보드 V2(`features/leaderboard`) 디자인을 분석하여 정리한 컨벤션 문서입니다.
이 가이드를 따르면 기존 리더보드와 시각적으로 동일한 디자인을 구현할 수 있습니다.

## 1. 디자인 시스템 개요 (Design Tokens)

Nasun 브랜드 컬러와 Tailwind CSS 설정을 기반으로 합니다.

### 1.1 색상 팔레트 (Color Palette)

주요 사용되는 색상은 Nasun 브랜드 컬러 중 `nasun-c3` (Teal/Cyan) 및 `nasun-c4` (Blue) 계열입니다.

| 이름 | 색상 코드 | 용도 | Tailwind Class |
|:---:|:---:|:---|:---|
| **Primary** | `#94e1d3` | 테이블 테두리, 강조 텍스트 | `text-nasun-c3`, `border-nasun-c3` |
| **Secondary** | `#448BBB` | 카드 배경/테두리 | `bg-nasun-c4`, `border-nasun-c4` |
| **Background** | `#111827` | 메인 컨테이너 배경 (Gray-900) | `bg-gray-900` |
| **Card Bg** | `#448BBB` (Opacity 10%) | Top Climbers 카드 배경 | `bg-nasun-c4/10` |
| **Highlight** | `#713f12` (Yellow-900/30) | 특정 사용자 행 강조 | `bg-yellow-900/30` |

### 1.2 타이포그래피 (Typography)

*   **기본 폰트**: 시스템 폰트 또는 프로젝트 기본 폰트 (`sans`)
*   **숫자/강조**: `font-extrabold` (매우 굵게) - 점수, 순위 표시에 주로 사용
*   **본문/이름**: `font-medium` (중간 굵기)

### 1.3 레이아웃 (Layout)

*   **최대 너비**: `max-w-7xl` (1280px)
*   **정렬**: 중앙 정렬 (`mx-auto`)
*   **반응형**: 모바일(`md` 미만)과 데스크톱(`md` 이상, `lg` 이상, `xl` 이상)에서 표시되는 정보량이 다름

---

## 2. 주요 컴포넌트 상세 사양

### 2.1 Top Climbers Spotlight (상단 카드 섹션)

상위 5명의 순위 급상승 사용자를 보여주는 카드 그리드입니다.

#### 레이아웃 (Grid System)
*   **Container**: `grid gap-4`
*   **Columns**: 반응형 그리드 적용
    *   Mobile: `grid-cols-1` (1열)
    *   SM: `grid-cols-2` (2열)
    *   MD: `grid-cols-3` (3열)
    *   LG: `grid-cols-4` (4열)
    *   XL: `grid-cols-5` (5열)

#### 카드 스타일 (ClimberCard)
*   **Container**:
    *   배경: `bg-nasun-c4/10`
    *   테두리: `border border-nasun-c4/50`
    *   모서리: `rounded-xl`
    *   여백: `p-4`
    *   호버 효과: `hover:shadow-lg hover:scale-[1.01] transition-all duration-200`
*   **메달 (Rank 1~3)**:
    *   위치: `absolute -top-3 -left-3`
    *   크기: `text-2xl xl:text-3xl`
    *   아이콘: 이모지 사용 (🥇, 🥈, 🥉)
*   **프로필 이미지**:
    *   크기: `w-12 h-12` (48px)
    *   모서리: `rounded-2xl`
    *   Fallback: 이미지가 없을 경우 이니셜 표시 (`bg-gray-700` 배경)
*   **데이터 표시**:
    *   **Rank Change**: `text-sm text-gray-400` 라벨 + `text-nasun-white` 값
    *   **Improvement**: `bg-nasun-c5/80` 배경의 뱃지 스타일, `text-green-300` + 화살표 아이콘(`lucide-react/ArrowUp`)
    *   **Score**: 상단 구분선(`border-t border-nasun-c4/50`) 아래에 배치

### 2.2 Leaderboard Table (메인 테이블)

사용자 순위를 나열하는 메인 테이블입니다. `variant="c3"` 스타일을 사용합니다.

#### 테이블 컨테이너 (Table Component)
*   **스타일 (`variant="c3"`)**:
    *   테두리: `border border-nasun-c3/50`
    *   배경: `bg-gray-900/80`
    *   모서리: `rounded-xl overflow-hidden`
*   **스크롤**: `overflow-x-auto custom-scrollbar`

#### 헤더 (TableHeader)
*   **높이/정렬**: 텍스트 중앙 정렬(`align="center"`) 또는 좌측 정렬
*   **반응형 텍스트**: 화면 크기에 따라 헤더 텍스트 축약
    *   예: "Rank" (Desktop) vs "#" (Mobile)
    *   예: "Points" (Desktop) vs "Pts" (Mobile)

#### 행 (TableRow)
*   **기본 스타일**: `hover:bg-black hover:scale-[1.01] hover:shadow-sm`
*   **하이라이트 스타일** (특정 사용자 검색/선택 시):
    *   배경: `bg-yellow-900/30`
    *   테두리: `border-l-4 border-yellow-500`
    *   애니메이션: `animate-pulse-subtle`
    *   그림자: `shadow-lg`
    *   크기: `scale-[1.02]`

### 2.3 셀 데이터 컴포넌트

#### Rank Badge
*   **구성**: 숫자 + 왕관 아이콘(Top 3)
*   **숫자**: `w-6 text-center !font-extrabold text-white`
*   **왕관 (`FaCrown` from `react-icons/fa`)**:
    *   1위: `text-yellow-400`
    *   2위: `text-gray-300`
    *   3위: `text-orange-400`

#### User Profile
*   **레이아웃**: `flex items-center space-x-2 md:space-x-3`
*   **이미지**:
    *   크기: `w-8 h-8` (Mobile) -> `w-10 h-10` (Desktop)
    *   모서리: `rounded-2xl`
    *   Lazy Loading 적용
*   **텍스트**:
    *   Display Name: `font-medium text-white truncate`
    *   Username: `text-gray-400` (모바일에서는 숨김 `hidden md:block`)

#### Registered Member Badge
*   체크 아이콘(`CheckCircle` from `lucide-react`) 사용
*   색상: `text-green-500`

#### Rank Change Indicator
*   **상승**: `text-nasun-c3` (Teal) + `ArrowUp`
*   **하락**: `text-nasun-coral` (Red/Coral) + `ArrowDown`
*   **유지**: `text-gray-500` + `-` (Hyphen)

---

## 3. 아이콘 시스템 (Iconography)

프로젝트에서 주로 사용하는 아이콘 라이브러리는 다음과 같습니다.

*   **Lucide React**: 일반적인 UI 아이콘 (`ArrowUp`, `ArrowRight`, `ExternalLink`, `Trophy`, `TrendingUp`, `CheckCircle`)
*   **React Icons (Font Awesome)**: 랭킹 왕관 아이콘 (`FaCrown`)

## 4. 반응형 전략 (Responsive Strategy)

화면 크기에 따라 보여주는 정보의 양을 조절합니다.

| Breakpoint | Table Columns | Top Climbers Count | User Profile |
|:---:|:---|:---:|:---|
| **Mobile (<768px)** | Rank(#), User, Pts | 3 (Stacked) | 이미지 + 이름만 표시 |
| **Tablet (>=768px)** | Rank, User, Pts, Change | 3 (Grid) | 이미지 + 이름 + @ID |
| **Desktop (>=1024px)** | 전체 컬럼 표시 | 4 | 전체 정보 표시 |
| **Wide (>=1280px)** | 전체 컬럼 표시 | 5 | 전체 정보 표시 |

## 5. 구현 체크리스트

리더보드 디자인을 구현할 때 다음 사항을 확인하세요.

1.  [ ] **테이블 테두리 색상**: `border-nasun-c3/50`이 적용되었는가?
2.  [ ] **배경 투명도**: 테이블 배경이 `bg-gray-900/80`으로 뒤 배경이 살짝 비치는가?
3.  [ ] **폰트 굵기**: 점수와 순위가 `font-extrabold`로 강조되었는가?
4.  [ ] **프로필 이미지**: 이미지가 로딩되지 않았을 때 이니셜 폴백이 나타나는가?
5.  [ ] **모바일 대응**: 좁은 화면에서 불필요한 컬럼(Member, Language 등)이 숨겨지거나 축약되는가?
6.  [ ] **호버 효과**: 행에 마우스를 올렸을 때 배경이 `black`으로 변하고 살짝 확대되는가?
