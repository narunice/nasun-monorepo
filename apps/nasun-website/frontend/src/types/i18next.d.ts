// src/types/i18next.d.ts


import "i18next";
// Re-evaluating types
import commonEN from "../assets/locales/en/common.json";
import homeEN from "../assets/locales/en/home.json";
import strategyEN from "../assets/locales/en/strategy.json";
import productsEN from "../assets/locales/en/products.json";
import web3EN from "../assets/locales/en/web3.json";
import tokenomicsEN from "../assets/locales/en/tokenomics.json";
import manifestoEN from "../assets/locales/en/manifesto.json";
import storyEN from "../assets/locales/en/story.json";
import riderStudioEN from "../assets/locales/en/ipsRiderStudio.json";
import wePopEN from "../assets/locales/en/wePop.json";
import genSolEN from "../assets/locales/en/gensol.json";
import spectraEN from "../assets/locales/en/spectra.json";
import spectraHeistEN from "../assets/locales/en/spectraHeist.json";

import roadmapEN from "../assets/locales/en/roadmap.json";
import opportunitiesEN from "../assets/locales/en/opportunities.json";
import grantsEN from "../assets/locales/en/grants.json";
import teamEN from "../assets/locales/en/team.json";
import saleEN from "../assets/locales/en/sale.json";
import myAccountEN from "../assets/locales/en/myAccount.json";
import privacyPolicyEN from "../assets/locales/en/privacyPolicy.json";
import termsEN from "../assets/locales/en/terms.json";
import leaderboardEN from "../assets/locales/en/leaderboard.json";
import battalionNftEN from "../assets/locales/en/battalion-nft.json";
import earlyContributorsEN from "../assets/locales/en/early-contributors.json";
import padoEN from "../assets/locales/en/pado.json";
import newsEN from "../assets/locales/en/news.json";
import notFoundEN from "../assets/locales/en/notFound.json";
import proposalsEN from "../assets/locales/en/proposals.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "home";
    resources: {
      common: typeof commonEN;
      home: typeof homeEN;
      strategy: typeof strategyEN & {
        vision: {
          title: string;
          body1: string;
          body2: string;
        };
        the_way_new: {
          title: string;
          intro: string;
          list_items: string[];
          conclusion: string;
        };
        statement: {
          title: string;
          unfolding: {
            title: string;
            p1: string;
            p2: string;
            p3: string;
            p4: string;
            p5: string;
          };
          revolutions: {
            title: string;
            p1: string;
            p2: string;
            p3: string;
            p4: string;
          };
          timelines: {
            title: string;
            p1: string;
            p2: string;
            p3: string;
          };
        };
      };
      products: typeof productsEN;
      web3: typeof web3EN;
      tokenomics: typeof tokenomicsEN;
      manifesto: typeof manifestoEN;
      story: typeof storyEN;
      roadmap: typeof roadmapEN;
      grants: typeof grantsEN;
      riderStudio: typeof riderStudioEN;
      wePop: typeof wePopEN;
      genSol: typeof genSolEN;
      spectra: typeof spectraEN;
      spectraHeist: typeof spectraHeistEN;

      opportunities: typeof opportunitiesEN;
      team: typeof teamEN;

      sale: {
        foundersHero: {
          title: string;
          subtitleHighlight: string;
          subtitleDimmed: string;
          description1: string;
          description2: string;
          visionTitle: string;
          visionDescription1: string;
          visionDescription2: string;
          ctaButton: string;
        };
        keyBenefits: {
          title: string;
          tokensCard: {
            title: string;
            nsnToken: { label: string; description: string };
            genSolToken: { label: string; description: string };
            tiersOfRarity: { label: string; description: string };
          };
          earlyAccessCard: {
            title: string;
            first: { label: string; description: string };
            directCommunication: { label: string; description: string };
            vip: { label: string; description: string };
            whitelists: { label: string; description: string };
          };
          ctaButton: string;
        };
        title: string;
        tagline: string;
        tier: string;
        max_supply: string;
        benefits: string;
        token_allocation: {
          title: string;
          description: string;
        };
        select_chain: string;
        switch: string;
        status: string;
        mint: string;
        go_to_mint: string;
        toast: {
          connected_well: string;
          unsupported_chain: string;
          wallet_required: string;
        };
        message: {
          loading_nft: string;
          unsupported_chain: string;
          processing: string;
          failed: string;
          loading_supply: string;
          sold_out: string;
          minted_label: string;
        };
        minted_modal: {
          minting_successful: string;
          loading_nft_details: string;
          your_nft_details: string;
          network: string;
          tier: string;
          minter: string;
          count: string;
          price: string;
          object_id: string;
          view_on_explorer: string;
          close: string;
          sr_only_description: string;
        };
        payAndMintNFT: {
          errors: {
            InsufficientCoinBalance: string;
            EInsufficientFunds: string;
            EAlreadyClaimed: string;
            EInvalidPrice: string;
            failed: string;
            walletRequired: string;
            walletNotConnected: string;
            fetchPriceFailed: string;
            priceConversionFailed: string;
            supplyExceeded: string;
            insufficientFunds: string;
            userRejected: string;
          };
          messages: {
            fetchingImage: string;
            minting: string;
            success: string;
          };
        };
        comparison: string;
        tiers: {
          tier1: {
            name: string;
            description: string;
            benefits: string[];
          };
          tier2: {
            name: string;
            description: string;
            benefits: string[];
          };
          tier3: {
            name: string;
            description: string;
            benefits: string[];
          };
          tier4: {
            name: string;
            description: string;
            benefits: string[];
          };
          tier5: {
            name: string;
            description: string;
            benefits: string[];
          } & typeof saleEN; // 기존 sale.json 타입과 병합
        };
      };
      myAccount: typeof myAccountEN;
      privacyPolicy: typeof privacyPolicyEN;
      terms: typeof termsEN;
      leaderboard: typeof leaderboardEN;
      "battalion-nft": typeof battalionNftEN;
      "early-contributors": typeof earlyContributorsEN;
      pado: typeof padoEN;
      news: typeof newsEN;
      notFound: typeof notFoundEN;
      proposals: typeof proposalsEN;
    };
  }
}
