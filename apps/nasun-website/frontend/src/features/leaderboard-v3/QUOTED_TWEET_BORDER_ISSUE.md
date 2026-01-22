# Quoted Tweet Double Border Issue

## Problem Summary

FeedPostCard 컴포넌트에서 react-tweet 라이브러리를 사용하여 트윗을 임베드할 때, **인용 트윗(quoted tweet)에 hover하면 두 개의 border가 나타나는 문제**가 있습니다.

### 현상
- **평소**: 인용 트윗 주변에 직선 border만 보임
- **hover 시**: 직선 border 위에 곡선(rounded) border가 추가로 나타남
- hover 시 배경색도 더 어두워지는 현상 발생

### 시각적 설명
```
평소 상태:
┌─────────────────────────┐  ← 메인 트윗 border (rounded-sm)
│  DCinvestor @DCinvestor │
│  트윗 내용...           │
│                         │
│  ┌───────────────────┐  │  ← 인용 트윗 (직선 border만 보임)
│  │ Google @Google    │  │
│  │ 인용 내용...      │  │
│  └───────────────────┘  │
└─────────────────────────┘

hover 시:
┌─────────────────────────┐
│  DCinvestor @DCinvestor │
│  트윗 내용...           │
│                         │
│  ╭───────────────────╮  │  ← 곡선 border 나타남 (문제!)
│  │┌───────────────────┐│ │  ← 직선 border도 여전히 존재
│  ││ Google @Google    ││ │
│  ││ 인용 내용...      ││ │
│  │└───────────────────┘│ │
│  ╰───────────────────╯  │
└─────────────────────────┘
```

---

## Technical Details

### 사용 라이브러리
- **react-tweet**: v3.3.0
- 트윗 임베드를 위한 React 컴포넌트 라이브러리

### 관련 파일
- `apps/nasun-website/frontend/src/features/leaderboard-v3/components/FeedPostCard.tsx`

### 현재 코드 구조
```tsx
<div className="w-full nasun-tweet-container" data-theme="dark">
  <Tweet id={tweetId} />
</div>
```

### react-tweet의 추정 DOM 구조 (인용 트윗 포함 시)
```html
<div class="react-tweet-theme">
  <article>  <!-- 메인 트윗 -->
    <div>
      <!-- 트윗 내용 -->
      <a href="...">  <!-- 인용 트윗을 감싸는 링크 - 이 요소가 hover 시 스타일 변경됨 -->
        <article>  <!-- 인용 트윗 -->
          <!-- 인용 내용 -->
        </article>
      </a>
    </div>
  </article>
</div>
```

---

## 시도한 해결책들 (모두 실패)

### 1. CSS 변수 설정
```css
.nasun-tweet-container .react-tweet-theme {
  --tweet-quoted-container-border: none;
  --tweet-quoted-border: none;
  --tweet-quoted-bg-color: rgba(15, 15, 15, 0.6);
  --tweet-quoted-bg-color-hover: rgba(15, 15, 15, 0.6);
}
```
**결과**: 효과 없음

### 2. 와일드카드 선택자로 모든 요소 border 제거
```css
.nasun-tweet-container article *,
.nasun-tweet-container article *:hover,
.nasun-tweet-container article *:focus {
  border: none !important;
  border-radius: 0 !important;
  outline: none !important;
  box-shadow: none !important;
}
```
**결과**: 평소에는 효과 있으나, hover 시 여전히 곡선 border 나타남

### 3. 가상 요소(::before, ::after) 스타일 제거
```css
.nasun-tweet-container article *::before,
.nasun-tweet-container article *::after,
.nasun-tweet-container article *:hover::before,
.nasun-tweet-container article *:hover::after {
  border: none !important;
  border-radius: 0 !important;
}
```
**결과**: 효과 없음

### 4. 링크 요소 배경색 강제 투명
```css
.nasun-tweet-container article a,
.nasun-tweet-container article a:hover,
.nasun-tweet-container article a:focus {
  background: transparent !important;
  background-color: transparent !important;
  border-radius: 0 !important;
}
```
**결과**: 배경색은 변했으나 곡선 border는 여전히 나타남

### 5. :not(article) 선택자 사용
```css
.nasun-tweet-container article *:not(article),
.nasun-tweet-container article *:not(article):hover {
  border: none !important;
  border-radius: 0 !important;
}
```
**결과**: 효과 없음

---

## 현재 CSS (FeedPostCard.tsx 내 style 태그)

```css
.nasun-tweet-container .react-tweet-theme {
  --tweet-container-background: transparent;
  --tweet-color-blue-primary: rgb(29, 155, 240);
  --tweet-color-hover: rgba(255, 255, 255, 0.03);
  --tweet-body-font-size: 14px;
  --tweet-body-line-height: 1.4;
  --tweet-quoted-container-border: none;
  --tweet-quoted-border: none;
  --tweet-quoted-bg-color: rgba(15, 15, 15, 0.6);
  --tweet-quoted-bg-color-hover: rgba(15, 15, 15, 0.6);
  margin: 0 !important;
}

/* Dark subtle card styling - main tweet only (not nested) */
.nasun-tweet-container > div > article {
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  background: rgba(20, 20, 20, 0.85) !important;
  border-radius: 0.125rem !important;
  backdrop-filter: blur(8px);
  margin: 0 !important;
}

/* Reset ALL borders, outlines, shadows on ALL elements inside main article */
.nasun-tweet-container article *,
.nasun-tweet-container article *:hover,
.nasun-tweet-container article *:focus,
.nasun-tweet-container article *::before,
.nasun-tweet-container article *::after,
.nasun-tweet-container article *:hover::before,
.nasun-tweet-container article *:hover::after {
  border: none !important;
  border-top: none !important;
  border-bottom: none !important;
  border-left: none !important;
  border-right: none !important;
  border-radius: 0 !important;
  outline: none !important;
  box-shadow: none !important;
}

/* Prevent hover background changes on links wrapping quoted tweets */
.nasun-tweet-container article a,
.nasun-tweet-container article a:hover,
.nasun-tweet-container article a:focus {
  background: transparent !important;
  background-color: transparent !important;
  border-radius: 0 !important;
}

/* Quoted tweet - no border at all */
.nasun-tweet-container article article,
.nasun-tweet-container article article:hover,
.nasun-tweet-container article article:focus {
  border: none !important;
  background: rgba(15, 15, 15, 0.6) !important;
  border-radius: 0 !important;
  margin: 8px 0 !important;
  outline: none !important;
  box-shadow: none !important;
}
```

---

## 추정되는 원인

1. **react-tweet 내부 스타일이 더 높은 specificity를 가짐**
   - 라이브러리가 CSS modules 또는 styled-components를 사용하여 인라인 스타일이나 더 구체적인 선택자를 적용할 수 있음

2. **hover 시 JavaScript로 동적 스타일 적용**
   - react-tweet이 hover 이벤트에 반응하여 JavaScript로 스타일을 동적으로 변경할 수 있음

3. **Shadow DOM 사용 가능성**
   - 일부 임베드 라이브러리는 Shadow DOM을 사용하여 스타일이 외부 CSS의 영향을 받지 않게 함

---

## 요청 사항

1. **문제의 정확한 원인 파악**
   - react-tweet 라이브러리의 소스 코드를 분석하여 인용 트윗 hover 스타일이 어디서 적용되는지 확인

2. **해결책 제시**
   - CSS로 해결 가능한 경우: 올바른 선택자와 속성 제공
   - CSS로 불가능한 경우: JavaScript 기반 해결책 또는 라이브러리 커스터마이징 방법 제안

3. **목표 상태**
   - 인용 트윗에 hover해도 추가 border가 나타나지 않음
   - 직선 border 하나만 유지하거나, border 없이 배경색만으로 구분

---

## 참고 링크

- react-tweet GitHub: https://github.com/vercel/react-tweet
- react-tweet npm: https://www.npmjs.com/package/react-tweet
