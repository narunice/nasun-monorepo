# Nasun Website Admin Features Guide

**Last Updated**: 2026-01-20
**Status**: Partially Implemented (Core features active)

## 1. Overview
This document outlines the implemented features and future roadmap for the Nasun Website Admin Dashboard (`/admin`). This area is restricted to authorized administrators.

## 2. Implemented Features

### ✅ Admin Dashboard (`/admin`)
- **Card Layout**: Provides a central hub for accessing all admin tools.
- **Route Protection**: Secured via `AdminRoute` component, ensuring only whitelisted wallet addresses can access.

### ✅ Whitelist Management (`/admin/whitelist`)
- **Export Functionality**: Allows administrators to download Allowlist data (Genesis NFT, Battalion NFT) as CSV files.
- **Filtering**: Supports date-based filtering for exports.
- **Backend**: Powered by the `admin-api` Lambda.

### ✅ Governance Management (`/admin/governance`)
- **Proposal Creation**: Interface to create on-chain governance proposals (Title, Description, Options).
- **Monitoring**: View real-time voting status and results.

## 3. Planned Features (Roadmap)

### 🚨 Priority 1: Operational Safety
- **X (Twitter) Health Monitor**: Real-time status of OAuth tokens and API Rate Limits.
- **User Ban / Blocklist**:
  - **Status**: UI placeholder exists (`In Planning Phase`).
  - **Goal**: Manage excluded users via DynamoDB instead of environment variables.
  - **Plan**: See `BLACKLIST_MANAGEMENT_IMPLEMENTATION_PLAN.md`.

### ⚡ Priority 2: Data & CS Tools
- **User Inspector**: Deep dive into specific user profiles (activity logs, scores).
- **Pipeline Status Dashboard**: Monitor and retry Step Functions executions.

### 🛠️ Priority 3: Management
- **Announcement Banner**: Toggle and edit global site banners.
- **Score Recalculation**: Trigger manual score updates for specific users.

## 4. Access Control
- **Frontend**: Controlled by `AdminRoute`.
- **Backend**: API endpoints are protected by API Keys and/or IAM authorization.

## 5. Deployment
- Admin features are part of the main `nasun-website` frontend build.
- Backend logic resides in `admin-api` and `governance-api` Lambda functions.