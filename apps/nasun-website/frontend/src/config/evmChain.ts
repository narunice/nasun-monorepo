import { mainnet, sepolia } from "wagmi/chains";

const envChainId = Number(import.meta.env.VITE_ETHEREUM_CHAIN_ID);

export const ACTIVE_EVM_CHAIN = envChainId === 1 ? mainnet : sepolia;
export const IS_EVM_TESTNET = ACTIVE_EVM_CHAIN.id !== mainnet.id;
