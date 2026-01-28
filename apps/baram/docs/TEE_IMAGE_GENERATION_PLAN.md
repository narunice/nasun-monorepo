# TEE Image Generation Plan

> Created: 2026-01-28
> Status: Planned, Implementation Deprioritized
> Priority: Low (prototype for pipeline verification)
> Related: Phase C-11 in main implementation plan

## Overview

This document outlines the plan to add CPU-based image generation capability to Baram's TEE (Trusted Execution Environment) enclave, ensuring complete privacy for image generation prompts.

---

## 1. Environment Constraints

| Item | Value | Notes |
|------|-------|-------|
| Instance | r6i.xlarge | CPU only (no GPU) |
| Enclave Memory | 14GB | LLM (4GB) + Image (4GB) can run together |
| vCPU | 2 | Limited parallelism |
| Current LLM | Llama 3.2 3B | ~2GB (Q4_K_M quantization) |

---

## 2. Model Selection

### Chosen: Stable Diffusion 2.1 (CPU ONNX)

| Property | Value |
|----------|-------|
| Model | `aislamov/stable-diffusion-2-1-base-onnx` |
| Library | `@aislamov/diffusers.js` (revision: 'cpu') |
| Size | ~4GB (ONNX format) |
| Inference Time | 40-80 seconds per image (512x512, 20 steps) |
| Memory | ~4GB RAM |

### Selection Rationale

1. **Node.js Compatible**: Matches existing stack (no Python dependency)
2. **CPU Optimized**: Official ONNX CPU variant available
3. **Sufficient Quality**: Good enough for pipeline verification
4. **Active Maintenance**: `diffusers.js` library maintained

### Alternative Models Considered

| Model | Size | Speed | Quality | Rejected Reason |
|-------|------|-------|---------|-----------------|
| TinySD | ~2.5GB | 20-40s | Lower | Quality too low |
| LCM + SD1.5 | ~4GB | 10-20s | Medium | Complex setup |
| SDXL Turbo | ~6GB | 60-120s | High | Too large for TEE |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Nitro Enclave (14GB Memory)                                            │
│                                                                          │
│  ┌─────────────────────┐  ┌─────────────────────────────────────────┐   │
│  │  Llama 3.2 3B       │  │  Stable Diffusion 2.1 (ONNX CPU)        │   │
│  │  (node-llama-cpp)   │  │  (diffusers.js)                          │   │
│  │  ~4GB               │  │  ~4GB                                     │   │
│  │                     │  │                                           │   │
│  │  Text Generation    │  │  Image Generation                         │   │
│  └─────────────────────┘  └─────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  inference.ts - Unified Inference Manager                         │   │
│  │  ├─ executeInference() → LLM                                      │   │
│  │  └─ executeImageGeneration() → Image                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Plan

### Step 1: Add Dependency

```bash
cd apps/baram/executor-nitro
npm install @aislamov/diffusers.js
```

### Step 2: Create local-image.ts

File: `apps/baram/executor-nitro/src/enclave/local-image.ts`

Following the `local-llm.ts` pattern:

```typescript
/**
 * Local Image Generation Module for Enclave
 *
 * Runs image generation entirely within the Enclave using diffusers.js.
 * This ensures prompts NEVER leave the TEE - complete privacy protection.
 */

import { DiffusionPipeline } from '@aislamov/diffusers.js';

const DEFAULT_MODEL_ID = 'aislamov/stable-diffusion-2-1-base-onnx';
const DEFAULT_REVISION = 'cpu';

let pipeline: Awaited<ReturnType<typeof DiffusionPipeline.fromPretrained>> | null = null;

export interface LocalImageConfig {
  modelId?: string;
  revision?: string;
  cacheDir?: string;
}

export interface LocalImageResult {
  imageBase64: string; // Base64-encoded PNG
  width: number;
  height: number;
  generationTimeMs: number;
}

/**
 * Initialize the image generation pipeline
 */
export async function initializeLocalImage(config: LocalImageConfig = {}): Promise<void> {
  const modelId = config.modelId || DEFAULT_MODEL_ID;
  const revision = config.revision || DEFAULT_REVISION;

  console.log(`[LocalImage] Loading pipeline from ${modelId}...`);
  const startTime = Date.now();

  pipeline = await DiffusionPipeline.fromPretrained(modelId, {
    revision,
    dtype: 'fp32', // CPU requires fp32
  });

  const loadTime = Date.now() - startTime;
  console.log(`[LocalImage] Pipeline loaded in ${loadTime}ms`);
}

/**
 * Generate an image from a text prompt
 */
export async function generateImage(
  prompt: string,
  options: {
    negativePrompt?: string;
    numInferenceSteps?: number;
    guidanceScale?: number;
    width?: number;
    height?: number;
  } = {}
): Promise<LocalImageResult> {
  if (!pipeline) {
    throw new Error('Image pipeline not initialized. Call initializeLocalImage() first.');
  }

  const {
    negativePrompt = '',
    numInferenceSteps = 20,
    guidanceScale = 7.5,
    width = 512,
    height = 512,
  } = options;

  console.log(`[LocalImage] Generating (steps=${numInferenceSteps}, size=${width}x${height})...`);
  const startTime = Date.now();

  const images = await pipeline.run({
    prompt,
    negativePrompt,
    numInferenceSteps,
    guidanceScale,
    width,
    height,
  });

  const generationTimeMs = Date.now() - startTime;
  console.log(`[LocalImage] Generated in ${generationTimeMs}ms`);

  // Convert to Base64 PNG
  const imageBase64 = images[0].toDataURL().replace('data:image/png;base64,', '');

  return {
    imageBase64,
    width,
    height,
    generationTimeMs,
  };
}

/**
 * Check if the pipeline is ready
 */
export function isLocalImageReady(): boolean {
  return pipeline !== null;
}

/**
 * Unload the pipeline and free memory
 */
export async function unloadImagePipeline(): Promise<void> {
  console.log('[LocalImage] Unloading pipeline...');
  pipeline = null;
  console.log('[LocalImage] Pipeline unloaded');
}
```

### Step 3: Extend protocol.ts

Add new message types:

```typescript
// Request Types
export type EnclaveRequestType =
  | 'GET_PUBLIC_KEY'
  | 'EXECUTE_INFERENCE'
  | 'EXECUTE_IMAGE_GENERATION'  // NEW
  | 'HEALTH_CHECK'
  | 'OPENAI_PROXY_RESPONSE';

// Response Types
export type EnclaveResponseType =
  | 'PUBLIC_KEY'
  | 'INFERENCE_RESULT'
  | 'IMAGE_GENERATION_RESULT'  // NEW
  | 'HEALTH_STATUS'
  | 'ERROR'
  | 'OPENAI_PROXY_REQUEST';

// New Interfaces
export interface ExecuteImageGenerationRequest extends EnclaveRequest {
  type: 'EXECUTE_IMAGE_GENERATION';
  payload: {
    encryptedPrompt: string;
    requestId: number;
    options?: {
      negativePrompt?: string;
      numInferenceSteps?: number;
      guidanceScale?: number;
      width?: number;
      height?: number;
    };
  };
}

export interface ExecuteImageGenerationResponse extends EnclaveResponse {
  type: 'IMAGE_GENERATION_RESULT';
  payload: {
    imageBase64: string;
    resultHash: string;
    width: number;
    height: number;
    executionTimeMs: number;
    attestation: AttestationDocument;
  };
}

// Environment check
export function useLocalImageGeneration(): boolean {
  return process.env.USE_LOCAL_IMAGE === 'true';
}
```

### Step 4: Extend inference.ts

Add image generation functions:

```typescript
import {
  initializeLocalImage,
  generateImage,
  isLocalImageReady,
} from './local-image.js';

export async function initializeInferenceLocalImage(
  config?: LocalImageConfig
): Promise<void> {
  await initializeLocalImage(config);
  console.log('[Enclave/Inference] Local image generation initialized');
}

export async function executeImageGeneration(
  prompt: string,
  options?: { ... }
): Promise<LocalImageResult & { resultHash: string }> {
  const result = await generateImage(prompt, options);
  const resultHash = sha256(result.imageBase64);
  return { ...result, resultHash };
}

export function isImageGenerationReady(): boolean {
  return isLocalImageReady();
}
```

### Step 5: Update main.ts

Add request handler for image generation:

```typescript
case 'EXECUTE_IMAGE_GENERATION': {
  const imageReq = request as ExecuteImageGenerationRequest;
  const { encryptedPrompt, requestId: onChainRequestId, options } = imageReq.payload;

  // Decrypt the prompt
  const prompt = decrypt(encryptedPrompt);

  // Execute image generation
  const result = await executeImageGeneration(prompt, options);

  const response: ExecuteImageGenerationResponse = {
    type: 'IMAGE_GENERATION_RESULT',
    requestId: request.requestId,
    success: true,
    payload: {
      imageBase64: result.imageBase64,
      resultHash: result.resultHash,
      width: result.width,
      height: result.height,
      executionTimeMs: result.generationTimeMs,
      attestation: await getAttestation(getPublicKey()),
    },
  };
  return response;
}
```

### Step 6: Update server.ts (Host)

Add HTTP endpoint:

```typescript
/**
 * POST /generate-image
 * Execute image generation with encrypted prompt
 */
app.post('/generate-image', async (req: Request, res: Response) => {
  const { requestId, encryptedPrompt, options } = req.body;

  if (typeof requestId !== 'number' || !encryptedPrompt) {
    res.status(400).json({ success: false, error: 'Invalid request' });
    return;
  }

  try {
    const response = await vsockClient.executeImageGeneration(
      encryptedPrompt,
      requestId,
      options
    );

    res.json({
      success: true,
      imageBase64: response.payload.imageBase64,
      resultHash: response.payload.resultHash,
      width: response.payload.width,
      height: response.payload.height,
      executionTimeMs: response.payload.executionTimeMs,
      attestation: response.payload.attestation,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### Step 7: Update vsock-client.ts

Add client method:

```typescript
async executeImageGeneration(
  encryptedPrompt: string,
  onChainRequestId: number,
  options?: { ... }
): Promise<ExecuteImageGenerationResponse> {
  const request: ExecuteImageGenerationRequest = {
    type: 'EXECUTE_IMAGE_GENERATION',
    requestId: generateRequestId(),
    payload: { encryptedPrompt, requestId: onChainRequestId, options },
  };
  return this.sendRequest<ExecuteImageGenerationResponse>(request);
}
```

### Step 8: Update Dockerfile.nitro

Add environment variable:

```dockerfile
ENV USE_LOCAL_IMAGE=false
ENV IMAGE_MODEL_ID=aislamov/stable-diffusion-2-1-base-onnx
```

---

## 5. Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/enclave/local-image.ts` | **Create** | diffusers.js wrapper |
| `src/shared/protocol.ts` | Modify | Add IMAGE_GENERATION types |
| `src/enclave/inference.ts` | Modify | Add image generation functions |
| `src/enclave/main.ts` | Modify | Add request routing |
| `src/host/server.ts` | Modify | Add /generate-image endpoint |
| `src/host/vsock-client.ts` | Modify | Add executeImageGeneration method |
| `docker/Dockerfile.nitro` | Modify | Add environment variables |
| `package.json` | Modify | Add diffusers.js dependency |

---

## 6. Expected Performance

| Configuration | Inference Time (512x512) |
|---------------|-------------------------|
| 30 steps | 60-120 seconds |
| 20 steps (default) | 40-80 seconds |
| 10 steps (testing) | 20-40 seconds |

Memory usage: ~4GB additional RAM when pipeline is loaded.

---

## 7. Testing Plan

### Local Simulation Test

```bash
# 1. Install dependencies
cd apps/baram/executor-nitro
npm install @aislamov/diffusers.js

# 2. Build
npm run build

# 3. Start Enclave (with image generation)
USE_LOCAL_IMAGE=true npm run start:enclave

# 4. Start Host (separate terminal)
npm run start:host

# 5. Test request
curl -X POST http://localhost:3000/generate-image \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": 1,
    "encryptedPrompt": "<base64-encrypted>",
    "options": { "numInferenceSteps": 10 }
  }'
```

---

## 8. Verification Checklist

- [ ] `@aislamov/diffusers.js` installed
- [ ] `local-image.ts` created
- [ ] `protocol.ts` image generation types added
- [ ] `inference.ts` image generation functions added
- [ ] `main.ts` EXECUTE_IMAGE_GENERATION handler added
- [ ] `server.ts` /generate-image endpoint added
- [ ] `vsock-client.ts` executeImageGeneration method added
- [ ] Local simulation test passed
- [ ] Docker build successful
- [ ] E2E: encrypted prompt → image generation → Base64 response

---

## 9. Future Improvements (Phase C-12+)

1. **TinySD ONNX Conversion**: Smaller, faster model
2. **Frontend UI**: Image generation button and result display
3. **Streaming Progress**: WebSocket for generation progress
4. **Image Encryption**: Encrypt result with client public key
5. **Prompt Enhancement**: Auto-enhance prompts with LLM before image generation

---

## Appendix: diffusers.js API Reference

```typescript
import { DiffusionPipeline } from '@aislamov/diffusers.js';

// Load pipeline
const pipeline = await DiffusionPipeline.fromPretrained(
  'aislamov/stable-diffusion-2-1-base-onnx',
  { revision: 'cpu', dtype: 'fp32' }
);

// Generate images
const images = await pipeline.run({
  prompt: 'a photo of a cat',
  negativePrompt: 'blurry, low quality',
  numInferenceSteps: 20,
  guidanceScale: 7.5,
  width: 512,
  height: 512,
});

// Get Base64
const base64 = images[0].toDataURL();
```
