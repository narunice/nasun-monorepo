# Metadata Setup Guide

## File Structure on Pinata

Upload two separate items to Pinata:

### 1. Collection metadata (single file)
Upload `collection.json` as a single file. The resulting CID goes into the contract's `contractURI`.

### 2. Token metadata folder
Create a folder with 7 files named `1.json` through `7.json`, each following `token-template.json` format.

```
metadata-folder/
  1.json
  2.json
  3.json
  4.json
  5.json
  6.json
  7.json
```

Upload this folder to Pinata. The folder CID goes into the contract's `baseURI`.
The contract resolves `uri(tokenId)` as `{baseURI}/{tokenId}.json`.

## Token Metadata Fields

| Field | Purpose | Compatibility |
|-------|---------|---------------|
| `name` | Display name | All platforms |
| `description` | Token description | All platforms |
| `image` | Static thumbnail (PNG/JPG, 600x600+) | All wallets, marketplaces |
| `animation_url` | Video file (MP4, max 100MB) | OpenSea, Rarible, LooksRare |
| `external_url` | Link back to nasun.io | OpenSea |
| `attributes` | Trait metadata | OpenSea, Rarible |

## Image/Video Requirements

### Thumbnails (`image` field)
- Format: PNG or JPG
- Resolution: 600x600 minimum, 1000x1000 recommended
- Max size: 5MB
- This is the primary display image in wallets (MetaMask, Rainbow, etc.)

### Videos (`animation_url` field)
- Format: MP4 (H.264 codec for max compatibility)
- Resolution: 1080p or lower
- Max size: 100MB (OpenSea limit)
- Duration: any, but shorter loads faster
- Audio: optional (muted by default on most platforms)

### Collection Image (`image` in collection.json)
- Format: PNG or JPG
- Resolution: 600x600 recommended
- Used as the collection profile picture on OpenSea

### Banner Image (`banner_image` in collection.json)
- Format: PNG or JPG
- Resolution: 1400x400 recommended
- Used as the collection banner on OpenSea

## Wallet Compatibility Notes

- **MetaMask**: Shows `image` field only. Does not play videos.
- **Rainbow**: Shows `image`, supports `animation_url` video playback.
- **OpenSea**: Shows `image` as thumbnail, plays `animation_url` on token page.
- **Rarible**: Same as OpenSea.
- **LooksRare**: Same as OpenSea.

The `image` field is critical - it is the universal fallback. Always provide a high-quality static thumbnail even when the NFT is a video.

## IPFS Gateway Fallback

Pinata provides a dedicated gateway. For reliability, pin on multiple services:
- Pinata (primary, paid plan for permanence)
- web3.storage or Filebase (secondary, free tier)
