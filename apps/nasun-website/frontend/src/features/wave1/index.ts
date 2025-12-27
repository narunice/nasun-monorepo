/**
 * Wave1 Feature Module
 *
 * Battalion NFT, early contributors, and leaderboard info.
 */

// Battalion NFT Components
export { default as BattalionNftPage } from "./components/battalion-nft/BattalionNftPage";
export { default as BattalionNftCard } from "./components/battalion-nft/BattalionNftCard";
export { default as BattalionNftHeroSection } from "./components/battalion-nft/BattalionNftHeroSection";
export { default as StepperProgress } from "./components/battalion-nft/StepperProgress";
export { default as WalletDisconnectedCard } from "./components/battalion-nft/WalletDisconnectedCard";

// Card Steps
export { default as Step1WelcomeCard } from "./components/battalion-nft/cards/Step1WelcomeCard";
export { default as Step2XAuthCard } from "./components/battalion-nft/cards/Step2XAuthCard";
export { default as Step3TaskVerificationCard } from "./components/battalion-nft/cards/Step3TaskVerificationCard";
export { default as Step4WalletConnectCard } from "./components/battalion-nft/cards/Step4WalletConnectCard";
export { default as Step5ConfirmationCard } from "./components/battalion-nft/cards/Step5ConfirmationCard";
export { default as Step6RegistrationSuccessCard } from "./components/battalion-nft/cards/Step6RegistrationSuccessCard";

// Other Sections
export { default as EarlyContributorsSection } from "./components/early-contributors/EarlyContributorsSection";
export { default as LeaderboardInfoSection } from "./components/leaderboard-info/LeaderboardInfoSection";

// Hooks
export { useSuiNFTMintedEvents } from "./hooks/useSuiNFTMintedEvents";
export { useAllTiersSupplyCounts } from "./hooks/useAllTiersSupplyCounts";
export { usePayAndMintSuiNFT } from "./hooks/usePayAndMintSuiNFT";
export { useTierSupplyCount } from "./hooks/useTierSupplyCount";
export { useCoinPrice } from "./hooks/useCoinPrice";
export { usePayAndMintNFT } from "./hooks/usePayAndMintNFT";
export { useBattalionNftRegistration } from "./hooks/useBattalionNftRegistration";
export { useBattalionNftStatus } from "./hooks/useBattalionNftStatus";
export { useBattalionNftVerification } from "./hooks/useBattalionNftVerification";

// Types
export type * from "./types/battalion-nft";
