# p 태그 중복 text-nasun-white/80 클래스 제거

## 배경
- index.css에서 p 태그 기본 색상이 `text-nasun-white/80`으로 설정됨
- 기존에 수동으로 적용된 `text-nasun-white/80` 또는 `!text-nasun-white/80`은 중복이므로 제거

## 규칙
- ✅ 제거: `text-nasun-white/80`, `!text-nasun-white/80`
- ❌ 유지: `text-nasun-white`, `text-nasun-white/90` 등 다른 값

## 수정 대상 (28개 파일, 50개 항목)

| 파일 | 개수 |
|------|------|
| `pages/LogoutPage.tsx` | 1 |
| `components/app/team/OpportunitiesSection.tsx` | 1 |
| `components/app/myAccount/AccountDeletion.tsx` | 1 |
| `components/app/wave1/early-contributors/EarlyContributorsSection.tsx` | 1 |
| `components/app/sale/KeyBenefitsSection.tsx` | 3 |
| `components/app/wave1/battalion-nft/cards/Step3TaskVerificationCard.tsx` | 2 |
| `components/app/awards/AwardsListSection.tsx` | 1 |
| `components/app/wave1/battalion-nft/cards/Step2XAuthCard.tsx` | 1 |
| `components/app/awards/AwardsSection.tsx` | 5 |
| `components/app/wave1/battalion-nft/cards/Step4WalletConnectCard.tsx` | 3 |
| `components/app/ips/gensol/GenSolIntroSection.tsx` | 1 |
| `components/app/wave1/battalion-nft/cards/Step1WelcomeCard.tsx` | 1 |
| `components/app/wave1/battalion-nft/cards/Step5ConfirmationCard.tsx` | 1 |
| `components/app/home/ButtonShowcaseSection.tsx` | 1 |
| `components/app/ips/gensol/PowerOfStoriesSection.tsx` | 3 |
| `components/app/wave1/battalion-nft/cards/Step6RegistrationSuccessCard.tsx` | 2 |
| `components/app/home/NewsEventsSection.tsx` | 1 |
| `components/app/ips/gensol/GenSolHeroSection.tsx` | 2 |
| `components/app/home/AwardsGrantsSection.tsx` | 3 |
| `components/app/news/FeaturedPost.tsx` | 1 |
| `components/ui/CallToAction.tsx` | 1 |
| `components/app/vision/reliance/RelianceInitiativeSection.tsx` | 2 |
| `components/app/vision/network/NewNasunNetworkSection.tsx` | 2 |
| `components/app/vision/network/NewTokenDistributionSection.tsx` | 4 |
| `components/app/vision/network/NewMoveTogetherSection.tsx` | 2 |
| `components/app/vision/roadmap/RoadmapIntroSection.tsx` | 1 |
| `components/app/vision/strategy/StrategyTheWayContent.tsx` | 1 |
| `components/app/vision/strategy/StrategyVisionContent.tsx` | 2 |

## 작업 방법
각 파일에서 p 태그의 className에 있는 `text-nasun-white/80` 또는 `!text-nasun-white/80`만 제거
- 다른 클래스들은 그대로 유지
- className이 비게 되면 className 속성 자체 제거
