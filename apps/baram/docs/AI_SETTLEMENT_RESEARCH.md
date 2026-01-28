# AI Settlement Layer Research

> Research Date: 2026-01-28
> Status: Research Complete, Implementation Deprioritized
> Priority: Low (for future reference)

## Overview

This document summarizes research on existing AI settlement layer projects and their potential integration with Baram's TEE-based privacy AI infrastructure.

---

## 1. Ritual Network (Infernet SDK)

### Overview
Ritual is building an AI-native blockchain infrastructure with verifiable AI computation.

### Key Components

| Component | Description |
|-----------|-------------|
| Infernet SDK | Lightweight client for on/off-chain AI inference |
| Infernet Nodes | Compute nodes running AI models |
| TEE Attestations | Hardware-level proof of computation |
| Ritual Chain | Settlement layer (upcoming) |

### Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Smart Contract                                              │
│  └─ Request inference with callback                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Infernet Node                                               │
│  ├─ Subscribe to on-chain requests                           │
│  ├─ Execute AI model (Docker container)                      │
│  ├─ Generate proof (Optimistic / ZK / TEE)                  │
│  └─ Deliver result on-chain                                  │
└─────────────────────────────────────────────────────────────┘
```

### Proof Types

| Type | Speed | Security | Use Case |
|------|-------|----------|----------|
| Optimistic | Fast | Fraud proofs | Low-value, frequent |
| TEE | Fast | Hardware attestation | Privacy-critical |
| ZK | Slow | Math proof | High-value, verifiable |

### Integration Possibilities

1. **Baram as Infernet Node**: Run Baram's TEE executor as an Infernet node
2. **Cross-chain Settlement**: Use Ritual Chain for settlement, Nasun for privacy
3. **Proof Format**: Adopt Infernet's attestation format for interoperability

### Relevant Links
- GitHub: https://github.com/ritual-net/infernet-sdk
- Docs: https://docs.ritual.net/

---

## 2. Bittensor Network

### Overview
Decentralized AI network with incentivized subnets for different AI tasks.

### Key Components

| Component | Description |
|-----------|-------------|
| Subnets | Task-specific networks (text, image, audio) |
| Miners | AI model operators |
| Validators | Quality assessors |
| TAO Token | Native incentive token |

### Subnet Examples

| Subnet | Task | Miners |
|--------|------|--------|
| SN1 | Text Generation | LLM operators |
| SN8 | Image Generation | Diffusion model operators |
| SN19 | Vision | Image analysis |
| SN21 | Storage | Decentralized storage |

### Integration Possibilities

1. **Baram as Subnet Miner**: Register Baram TEE executor as a privacy-focused miner
2. **Privacy Subnet**: Create new subnet for TEE-protected inference
3. **TAO Incentives**: Earn TAO for providing private AI compute

### Challenges

- Bittensor validators can see prompts/responses (no TEE requirement)
- Integration requires Python (incompatible with current Node.js stack)
- High barrier to entry (TAO staking required)

### Relevant Links
- GitHub: https://github.com/opentensor/bittensor
- Docs: https://docs.bittensor.com/

---

## 3. Hyperbolic

### Overview
Decentralized GPU compute marketplace focusing on AI workloads.

### Key Features

| Feature | Description |
|---------|-------------|
| GPU Pools | Aggregated GPU resources |
| Inference API | Pay-per-use AI inference |
| Fine-tuning | Custom model training |
| Verifiable Compute | Proof of correct execution |

### Integration Possibilities

1. **Hybrid Mode**: Use Hyperbolic GPU for heavy models, TEE for privacy
2. **Fallback Provider**: When TEE is offline, route to Hyperbolic
3. **Fine-tuning**: Train custom models on Hyperbolic, deploy in TEE

### Challenges

- GPU compute is not TEE-protected (privacy concern)
- Centralized API (not fully decentralized)
- Cost per inference (vs. fixed TEE cost)

---

## 4. Comparison Matrix

| Project | Privacy | Verification | Token | Integration Effort |
|---------|---------|--------------|-------|-------------------|
| Ritual | TEE supported | TEE/ZK/Optimistic | RITUAL (upcoming) | Medium |
| Bittensor | None (public) | Validator consensus | TAO | High |
| Hyperbolic | None (public) | Proof of compute | None | Low |
| **Baram** | **TEE (full)** | **Attestation** | **NASUN** | **N/A** |

---

## 5. Recommended Strategy

### Short-term (Current)
- Focus on Baram's standalone TEE execution
- Establish privacy-first reputation
- No external integration needed

### Medium-term (6-12 months)
- Explore Ritual Infernet SDK integration
- Adopt compatible attestation format
- Cross-chain settlement possibility

### Long-term (12+ months)
- Create Bittensor privacy subnet (if community demand)
- Multi-chain settlement layer
- Interoperability with major AI networks

---

## 6. Technical Notes

### TEE Attestation Format Comparison

**Baram (Current)**:
```typescript
interface AttestationDocument {
  pcrs: { pcr0: string; pcr1: string; pcr2: string };
  moduleId: string;
  timestamp: number;
  signature: string;
  certificate: string;
}
```

**Ritual Infernet**:
```typescript
interface InfernetAttestation {
  node_id: string;
  model_id: string;
  input_hash: string;
  output_hash: string;
  timestamp: number;
  tee_signature?: string;
  zk_proof?: string;
}
```

### Interoperability Considerations

1. **Result Hash**: Both use SHA-256 for output verification
2. **Timestamp**: UTC Unix timestamp (compatible)
3. **Signature**: AWS Nitro COSE_Sign1 vs. custom format (needs adapter)

---

## Appendix: Research Sources

1. Ritual Network Documentation (2025)
2. Bittensor Whitepaper v2.0
3. Hyperbolic API Documentation
4. AWS Nitro Enclaves Developer Guide
5. COSE (RFC 8152) Specification
