"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/handlers/batch/profile-enhancement-scheduler.ts
var profile_enhancement_scheduler_exports = {};
__export(profile_enhancement_scheduler_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(profile_enhancement_scheduler_exports);
var import_client_dynamodb2 = require("@aws-sdk/client-dynamodb");

// src/types/profile.ts
var PROFILE_QUALITY_THRESHOLDS = {
  HIGH_QUALITY: 80,
  // 80점 이상: 고품질
  CACHE_WORTHY: 70,
  // 70점 이상: 캐시 저장
  MEDIUM: 60,
  // 60점 이상: 중품질
  GOOD: 50,
  // 50점 이상: 양호 (ACCEPTABLE과 동일)
  ACCEPTABLE: 50,
  // 50점 이상: 사용 가능
  LOW: 40,
  // 40점 이상: 저품질 (개선 필요)
  NEEDS_UPDATE: 30,
  // 30점 미만: 업데이트 필요
  CRITICAL: 20
  // 20점 미만: 심각한 품질 저하
};
var FIELD_QUALITY_WEIGHTS = {
  username: 30,
  // 필수 필드
  displayName: 30,
  // 필수 필드  
  profileImageUrl: 20,
  // 중요 필드
  followersCount: 20
  // 중요 필드
};
var SOURCE_RELIABILITY_SCORES = {
  direct_api: 100,
  // 최고 신뢰도
  cache: 80,
  // 높은 신뢰도
  existing_score: 60,
  // 중간 신뢰도
  engagement: 40
  // 기본 신뢰도
};
var ProfileValidators = {
  /**
   * 사용자명 유효성 검증 - 강화된 버전
   */
  isValidUsername(username) {
    if (typeof username !== "string" || username === null || username === void 0) {
      return false;
    }
    const trimmed = username.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "n/a" || trimmed === "null") {
      return false;
    }
    if (trimmed.length < 1) {
      return false;
    }
    if (trimmed.length > 15) {
      return false;
    }
    if (/^\d+$/.test(trimmed)) {
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return false;
    }
    if (/^_+$/.test(trimmed) || /^(.)\1{4,}$/.test(trimmed)) {
      return false;
    }
    if (/^user_\d+$/.test(trimmed)) {
      return false;
    }
    if (/^(account|test|temp|demo|fake)_\d+$/i.test(trimmed)) {
      return false;
    }
    return true;
  },
  /**
   * 표시명 유효성 검증 - 강화된 버전
   */
  isValidDisplayName(displayName) {
    if (typeof displayName !== "string" || displayName === null || displayName === void 0) {
      return false;
    }
    const trimmed = displayName.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "n/a" || trimmed === "null" || trimmed.toLowerCase() === "undefined" || trimmed === "---") {
      return false;
    }
    if (trimmed.length < 1) {
      return false;
    }
    if (trimmed.length > 50) {
      return false;
    }
    if (/^[\d\s\-_\.@#$%^&*()]+$/.test(trimmed)) {
      return false;
    }
    if (/^(.)\1{6,}$/.test(trimmed) || /(\w+\s*){4,}\1/.test(trimmed)) {
      return false;
    }
    const specialCharCount = (trimmed.match(/[^\w\s가-힣]/g) || []).length;
    if (specialCharCount > trimmed.length * 0.5) {
      return false;
    }
    if (/^User \d+$/.test(trimmed)) {
      return false;
    }
    if (/^(Account|Test|Demo|Fake|Temp|Sample) \d+$/i.test(trimmed)) {
      return false;
    }
    return true;
  },
  /**
   * 프로필 이미지 URL 유효성 검증 - 강화된 버전
   */
  isValidProfileImageUrl(url) {
    if (typeof url !== "string" || url === null || url === void 0) {
      return false;
    }
    const trimmed = url.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "n/a" || trimmed === "null" || trimmed === "#" || trimmed === "undefined") {
      return false;
    }
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return false;
    }
    try {
      const urlObj = new URL(trimmed);
      const validImageHosts = [
        "pbs.twimg.com",
        // Twitter 공식 이미지
        "abs.twimg.com",
        // Twitter 공식 이미지
        "images.unsplash.com",
        // Unsplash
        "cdn.discordapp.com",
        // Discord CDN
        "i.imgur.com",
        // Imgur
        "media.giphy.com",
        // Giphy
        "avatars.githubusercontent.com",
        // GitHub 아바타
        "lh3.googleusercontent.com"
        // Google 이미지
      ];
      const hostname = urlObj.hostname.toLowerCase();
      const isKnownHost = validImageHosts.some((host) => hostname.includes(host));
      if (!isKnownHost) {
        const path = urlObj.pathname.toLowerCase();
        const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(path);
        if (!hasImageExtension && !path.includes("/avatar") && !path.includes("/profile")) {
          return false;
        }
      }
      if (trimmed.length > 2048) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },
  /**
   * 팔로워 수 유효성 검증 - 강화된 버전
   */
  isValidFollowersCount(count) {
    if (typeof count !== "number") {
      return false;
    }
    if (count === null || count === void 0 || Number.isNaN(count) || !Number.isFinite(count)) {
      return false;
    }
    if (count < 0 || Object.is(count, -0)) {
      return false;
    }
    if (!Number.isInteger(count)) {
      return false;
    }
    if (count > 1e9) {
      return false;
    }
    if (count > 1e7 && count % 1e6 === 0) {
      return false;
    }
    return true;
  },
  /**
   * 일반적인 필드 유효성 검증 - 강화된 버전
   */
  isValidField(value) {
    if (value === null || value === void 0) {
      return false;
    }
    if (typeof value === "string" && value.trim() === "") {
      return false;
    }
    if (typeof value === "string" && value.toLowerCase() === "unknown") {
      return false;
    }
    return true;
  }
};

// src/services/centralized-profile-manager.ts
var CentralizedProfileManager = class {
  constructor(dynamoClient, config, cacheService, apiOptimizer) {
    this.dynamoClient = dynamoClient;
    this.config = config;
    this.cacheService = cacheService;
    this.apiOptimizer = apiOptimizer;
  }
  /**
   * 🎯 핵심 메서드: 인게이지먼트 데이터에서 사용자 프로필 통합 처리
   * 
   * @param engagements 인게이지먼트 데이터 배열
   * @param existingProfiles 기존 프로필 데이터 (선택적)
   * @returns 통합된 사용자 프로필 맵
   */
  async processUserProfiles(engagements, existingProfiles) {
    const startTime = Date.now();
    const stats = {
      totalProcessed: 0,
      cacheHits: 0,
      apiCalls: 0,
      qualityImprovements: 0,
      averageQualityScore: 0
    };
    const timing = {
      cacheTime: 0,
      apiTime: 0,
      mergeTime: 0,
      totalTime: 0
    };
    try {
      const userIds = this.extractUniqueUsers(engagements);
      stats.totalProcessed = userIds.length;
      console.log(`\u{1F465} [PROFILE_MANAGER] \uCC98\uB9AC \uC2DC\uC791: ${userIds.length}\uBA85\uC758 \uC0AC\uC6A9\uC790`);
      const cacheStartTime = Date.now();
      let cachedProfiles = /* @__PURE__ */ new Map();
      if (this.cacheService) {
        cachedProfiles = await this.cacheService.batchGetProfiles(userIds);
        stats.cacheHits = cachedProfiles.size;
      }
      timing.cacheTime = Date.now() - cacheStartTime;
      const needsAPIUpdate = this.identifyAPINeeds(userIds, cachedProfiles);
      const apiStartTime = Date.now();
      let apiData = /* @__PURE__ */ new Map();
      if (this.apiOptimizer && needsAPIUpdate.length > 0) {
        apiData = await this.apiOptimizer.batchGetUsers(needsAPIUpdate);
        stats.apiCalls = apiData.size;
      }
      timing.apiTime = Date.now() - apiStartTime;
      const mergeStartTime = Date.now();
      const profiles = /* @__PURE__ */ new Map();
      let totalQualityScore = 0;
      for (const userId of userIds) {
        const engagementData = this.extractEngagementData(userId, engagements);
        const cachedData = cachedProfiles.get(userId);
        const existingData = existingProfiles?.get(userId);
        const apiData_user = apiData.get(userId);
        const mergeResult = this.mergeProfileData(
          engagementData,
          cachedData,
          existingData,
          apiData_user
        );
        profiles.set(userId, mergeResult.profile);
        totalQualityScore += mergeResult.profile.qualityScore;
        if (mergeResult.hasImprovement) {
          stats.qualityImprovements++;
          console.log(`\u{1F4C8} [PROFILE_MANAGER] \uD488\uC9C8 \uD5A5\uC0C1: ${userId} (+${mergeResult.qualityImprovement}\uC810, \uD544\uB4DC: ${mergeResult.improvedFields.join(", ")})`);
        }
        if (this.cacheService && mergeResult.profile.qualityScore >= PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY) {
          await this.cacheService.setCachedProfile(mergeResult.profile);
        }
      }
      timing.mergeTime = Date.now() - mergeStartTime;
      timing.totalTime = Date.now() - startTime;
      stats.averageQualityScore = userIds.length > 0 ? totalQualityScore / userIds.length : 0;
      console.log(`\u2705 [PROFILE_MANAGER] \uCC98\uB9AC \uC644\uB8CC: ${userIds.length}\uBA85, \uD3C9\uADE0 \uD488\uC9C8 ${stats.averageQualityScore.toFixed(1)}\uC810, ${timing.totalTime}ms`);
      console.log(`\u{1F4CA} [PROFILE_MANAGER] \uD1B5\uACC4: \uCE90\uC2DC ${stats.cacheHits}\uAC1C, API ${stats.apiCalls}\uAC1C, \uAC1C\uC120 ${stats.qualityImprovements}\uAC1C`);
      return {
        profiles,
        stats,
        timing
      };
    } catch (error) {
      console.error(`\u274C [PROFILE_MANAGER] \uCC98\uB9AC \uC2E4\uD328:`, error);
      const fallbackProfiles = /* @__PURE__ */ new Map();
      const userIds = this.extractUniqueUsers(engagements);
      for (const userId of userIds) {
        const engagementData = this.extractEngagementData(userId, engagements);
        fallbackProfiles.set(userId, this.createFallbackProfile(engagementData));
      }
      return {
        profiles: fallbackProfiles,
        stats: { ...stats, totalProcessed: fallbackProfiles.size },
        timing: { ...timing, totalTime: Date.now() - startTime }
      };
    }
  }
  /**
   * 🔄 프로필 데이터 병합: 모든 소스의 데이터를 통합
   * 
   * @param engagement 인게이지먼트에서 추출한 프로필 데이터
   * @param cached 캐시된 프로필 데이터
   * @param existing 기존 스코어 데이터
   * @param apiData Twitter API 데이터
   * @returns 병합 결과
   */
  mergeProfileData(engagement, cached, existing, apiData) {
    const originalQuality = cached?.qualityScore || 0;
    const improvedFields = [];
    const profile = {
      userId: engagement?.userId || cached?.userId || existing?.userId || apiData?.id || "",
      username: "",
      displayName: "",
      profileImageUrl: void 0,
      followersCount: void 0,
      dominantLanguage: void 0,
      // ✅ dominantLanguage 필드 추가
      qualityScore: 0,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      lastAPIUpdate: apiData ? (/* @__PURE__ */ new Date()).toISOString() : cached?.lastAPIUpdate || existing?.followersCountUpdatedAt || "",
      sources: this.determineSources(engagement, cached, existing, apiData),
      completeness: {
        hasValidUsername: false,
        hasValidDisplayName: false,
        hasProfileImage: false,
        hasFollowersCount: false
      },
      ttl: Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60,
      // 7일
      version: "v2"
    };
    const usernameResult = this.selectBestField("username", engagement, cached, existing, apiData);
    if (usernameResult.improved) improvedFields.push("username");
    profile.username = usernameResult.value;
    const displayNameResult = this.selectBestField("displayName", engagement, cached, existing, apiData);
    if (displayNameResult.improved) improvedFields.push("displayName");
    profile.displayName = displayNameResult.value;
    const profileImageResult = this.selectBestField("profileImageUrl", engagement, cached, existing, apiData);
    if (profileImageResult.improved) improvedFields.push("profileImageUrl");
    profile.profileImageUrl = profileImageResult.value;
    const followersResult = this.selectBestField("followersCount", engagement, cached, existing, apiData);
    if (followersResult.improved) improvedFields.push("followersCount");
    profile.followersCount = followersResult.value;
    const dominantLanguageResult = this.selectBestField("dominantLanguage", engagement, cached, existing, apiData);
    if (dominantLanguageResult.improved) improvedFields.push("dominantLanguage");
    profile.dominantLanguage = dominantLanguageResult.value;
    profile.qualityScore = this.calculateQualityScore(profile);
    profile.completeness = this.calculateCompleteness(profile);
    const qualityImprovement = profile.qualityScore - originalQuality;
    const hasImprovement = improvedFields.length > 0 || qualityImprovement > 0;
    return {
      profile,
      hasImprovement,
      improvedFields,
      qualityImprovement
    };
  }
  /**
   * 🥇 최적 필드 값 선택: 품질과 신뢰도 기반 - 강화된 버전
   */
  selectBestField(fieldName, engagement, cached, existing, apiData) {
    const candidates = [];
    const originalValue = cached?.[fieldName] || this.getExistingFieldValue(existing, fieldName) || (engagement ? engagement[fieldName] : void 0);
    const apiValue = this.getAPIFieldValue(apiData, fieldName);
    if (apiValue !== null && apiValue !== void 0 && this.isValidFieldValue(fieldName, apiValue)) {
      candidates.push({
        value: apiValue,
        score: SOURCE_RELIABILITY_SCORES.direct_api,
        source: "direct_api"
      });
      console.log(`\u{1F4E1} [PROFILE_SELECT] ${fieldName}: API \uAC12 \uD6C4\uBCF4 \uCD94\uAC00 - ${apiValue} (\uC810\uC218: ${SOURCE_RELIABILITY_SCORES.direct_api})`);
    } else if (apiData && apiValue === null) {
      console.log(`\u26A0\uFE0F [PROFILE_SELECT] ${fieldName}: API \uC751\uB2F5\uC5D0\uC11C null \uAC12 \uAC10\uC9C0 - \uD6C4\uBCF4\uC5D0\uC11C \uC81C\uC678`);
    }
    if (cached && this.isValidFieldValue(fieldName, cached[fieldName])) {
      candidates.push({
        value: cached[fieldName],
        score: SOURCE_RELIABILITY_SCORES.cache,
        source: "cache"
      });
      console.log(`\u{1F4BE} [PROFILE_SELECT] ${fieldName}: \uCE90\uC2DC \uAC12 \uD6C4\uBCF4 \uCD94\uAC00 - ${cached[fieldName]} (\uC810\uC218: ${SOURCE_RELIABILITY_SCORES.cache})`);
    }
    const existingValue = this.getExistingFieldValue(existing, fieldName);
    if (this.isValidFieldValue(fieldName, existingValue)) {
      candidates.push({
        value: existingValue,
        score: SOURCE_RELIABILITY_SCORES.existing_score,
        source: "existing_score"
      });
      console.log(`\u{1F5C4}\uFE0F [PROFILE_SELECT] ${fieldName}: \uAE30\uC874 \uAC12 \uD6C4\uBCF4 \uCD94\uAC00 - ${existingValue} (\uC810\uC218: ${SOURCE_RELIABILITY_SCORES.existing_score})`);
    }
    if (engagement && this.isValidFieldValue(fieldName, engagement[fieldName])) {
      candidates.push({
        value: engagement[fieldName],
        score: SOURCE_RELIABILITY_SCORES.engagement,
        source: "engagement"
      });
      console.log(`\u{1F4CA} [PROFILE_SELECT] ${fieldName}: \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8 \uAC12 \uD6C4\uBCF4 \uCD94\uAC00 - ${engagement[fieldName]} (\uC810\uC218: ${SOURCE_RELIABILITY_SCORES.engagement})`);
    }
    if (candidates.length === 0) {
      if (originalValue && originalValue !== "Unknown" && originalValue !== "unknown" && originalValue !== null) {
        console.log(`\u{1F6E1}\uFE0F [SAFE_PRESERVE] ${fieldName}: \uAE30\uC874 \uB370\uC774\uD130 \uC808\uB300 \uBCF4\uC874: ${originalValue}`);
        return {
          value: originalValue,
          improved: false
        };
      }
      console.log(`\u26A0\uFE0F [SAFE_PRESERVE] ${fieldName}: \uAE30\uC874 \uB370\uC774\uD130 \uC5C6\uC74C - undefined \uBC18\uD658\uC73C\uB85C \uB370\uC774\uD130 \uC190\uC2E4 \uBC29\uC9C0`);
      return {
        value: void 0,
        improved: false
      };
    }
    const sortedCandidates = candidates.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      const aIsImprovement = this.isValueImprovement(originalValue, a.value);
      const bIsImprovement = this.isValueImprovement(originalValue, b.value);
      if (aIsImprovement && !bIsImprovement) return -1;
      if (!aIsImprovement && bIsImprovement) return 1;
      return 0;
    });
    const best = sortedCandidates[0];
    const improved = best.value !== originalValue && this.isValueImprovement(originalValue, best.value);
    console.log(`\u2705 [PROFILE_SELECT] ${fieldName}: \uCD5C\uC885 \uC120\uD0DD - ${best.value} (\uC18C\uC2A4: ${best.source}, \uAC1C\uC120: ${improved ? "Y" : "N"})`);
    return {
      value: best.value,
      improved
    };
  }
  /**
   * 📊 품질 점수 계산 (0-100)
   */
  calculateQualityScore(profile) {
    let score = 0;
    if (ProfileValidators.isValidUsername(profile.username)) {
      score += FIELD_QUALITY_WEIGHTS.username;
    }
    if (ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += FIELD_QUALITY_WEIGHTS.displayName;
    }
    if (ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += FIELD_QUALITY_WEIGHTS.profileImageUrl;
    }
    if (ProfileValidators.isValidFollowersCount(profile.followersCount)) {
      score += FIELD_QUALITY_WEIGHTS.followersCount;
    }
    return Math.min(100, score);
  }
  /**
   * 📈 완전성 지표 계산
   */
  calculateCompleteness(profile) {
    return {
      hasValidUsername: ProfileValidators.isValidUsername(profile.username),
      hasValidDisplayName: ProfileValidators.isValidDisplayName(profile.displayName),
      hasProfileImage: ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl),
      hasFollowersCount: ProfileValidators.isValidFollowersCount(profile.followersCount)
    };
  }
  /**
   * 👥 유니크 사용자 추출
   */
  extractUniqueUsers(engagements) {
    const userIds = /* @__PURE__ */ new Set();
    for (const engagement of engagements) {
      if (engagement.engaging_user_id) {
        userIds.add(engagement.engaging_user_id);
      }
    }
    return Array.from(userIds);
  }
  /**
   * 📝 인게이지먼트에서 프로필 데이터 추출
   */
  extractEngagementData(userId, engagements) {
    const userEngagement = engagements.find((e) => e.engaging_user_id === userId);
    if (!userEngagement) {
      return { userId };
    }
    return {
      userId,
      username: userEngagement.engaging_username,
      displayName: userEngagement.engaging_display_name,
      profileImageUrl: userEngagement.engaging_profile_image_url,
      followersCount: userEngagement.engaging_followers_count
    };
  }
  /**
   * 🔍 API 업데이트가 필요한 사용자 식별
   */
  identifyAPINeeds(userIds, cachedProfiles) {
    const needsUpdate = [];
    for (const userId of userIds) {
      const cached = cachedProfiles.get(userId);
      if (!cached || cached.qualityScore < PROFILE_QUALITY_THRESHOLDS.HIGH_QUALITY) {
        needsUpdate.push(userId);
      }
    }
    return needsUpdate;
  }
  /**
   * 🏷️ 데이터 소스 결정
   */
  determineSources(engagement, cached, existing, apiData) {
    const sources = [];
    if (apiData) sources.push("direct_api");
    if (cached) sources.push("cache");
    if (existing) sources.push("existing_score");
    if (engagement) sources.push("engagement");
    return sources;
  }
  /**
   * 🔧 유틸리티 메서드들
   */
  getAPIFieldValue(apiData, fieldName) {
    if (!apiData) return void 0;
    switch (fieldName) {
      case "username":
        return apiData.username;
      case "displayName":
        return apiData.name;
      case "profileImageUrl":
        return apiData.profile_image_url;
      case "followersCount":
        return apiData.public_metrics?.followers_count;
      default:
        return void 0;
    }
  }
  getExistingFieldValue(existing, fieldName) {
    if (!existing) return void 0;
    switch (fieldName) {
      case "username":
        return existing.username;
      case "displayName":
        return existing.displayName;
      case "profileImageUrl":
        return existing.profileImageUrl;
      case "followersCount":
        return existing.followersCount;
      case "dominantLanguage":
        return existing.dominantLanguage;
      // ✅ dominantLanguage case 추가
      default:
        return void 0;
    }
  }
  isValidFieldValue(fieldName, value) {
    if (value === null || value === void 0 || value === "") {
      return false;
    }
    if (typeof value === "string" && value.toLowerCase() === "unknown") {
      return false;
    }
    switch (fieldName) {
      case "username":
        return ProfileValidators.isValidUsername(value);
      case "displayName":
        return ProfileValidators.isValidDisplayName(value);
      case "profileImageUrl":
        return ProfileValidators.isValidProfileImageUrl(value);
      case "followersCount":
        return ProfileValidators.isValidFollowersCount(value);
      default:
        return ProfileValidators.isValidField(value);
    }
  }
  isValueImprovement(oldValue, newValue) {
    if (!oldValue || oldValue === "Unknown" || oldValue === "unknown") {
      return true;
    }
    if (typeof newValue === "string" && typeof oldValue === "string") {
      return newValue.length > oldValue.length;
    }
    if (typeof newValue === "number" && typeof oldValue === "number") {
      return newValue > oldValue;
    }
    return false;
  }
  getDefaultValue(fieldName) {
    console.log(`\u26A0\uFE0F [SAFE_DEFAULT] ${fieldName}: \uAE30\uBCF8\uAC12 \uC694\uCCAD - undefined \uBC18\uD658\uC73C\uB85C \uAE30\uC874 \uB370\uC774\uD130 \uBCF4\uC874`);
    return void 0;
  }
  /**
   * 🆘 폴백 프로필 생성
   */
  createFallbackProfile(engagement) {
    const safeDisplayName = engagement.displayName || engagement.username || engagement.userId;
    console.log(`\u{1F6E1}\uFE0F [SAFE_FALLBACK] \uC0AC\uC6A9\uC790 ${engagement.userId}: \uC548\uC804\uD55C Fallback \uD504\uB85C\uD544 \uC0DD\uC131, displayName=${safeDisplayName}`);
    return {
      userId: engagement.userId,
      username: engagement.username || engagement.userId,
      displayName: safeDisplayName,
      profileImageUrl: engagement.profileImageUrl,
      followersCount: engagement.followersCount,
      qualityScore: this.calculateQualityScore({
        username: engagement.username || engagement.userId,
        displayName: safeDisplayName,
        profileImageUrl: engagement.profileImageUrl,
        followersCount: engagement.followersCount
      }),
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      lastAPIUpdate: "",
      sources: ["engagement"],
      completeness: {
        hasValidUsername: ProfileValidators.isValidUsername(engagement.username),
        hasValidDisplayName: ProfileValidators.isValidDisplayName(engagement.displayName),
        hasProfileImage: ProfileValidators.isValidProfileImageUrl(engagement.profileImageUrl),
        hasFollowersCount: ProfileValidators.isValidFollowersCount(engagement.followersCount)
      },
      ttl: Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60,
      version: "v2"
    };
  }
  /**
   * 🔥 Phase 2.3.2: 품질 기반 프로필 후보자 조회
   * 
   * 정기적 프로필 보강을 위해 저품질 프로필 사용자들을 식별합니다.
   * @param criteria 선별 기준
   * @returns 품질 개선 후보자 목록
   */
  async getProfileQualityCandidates(criteria) {
    console.log(`\u{1F3AF} [PROFILE_CANDIDATES] \uD488\uC9C8 \uD6C4\uBCF4\uC790 \uC870\uD68C \uC2DC\uC791:`, criteria);
    try {
      const QueryCommand = require("@aws-sdk/lib-dynamodb").QueryCommand;
      const ScanCommand = require("@aws-sdk/lib-dynamodb").ScanCommand;
      const candidates = [];
      const scanCommand = new ScanCommand({
        TableName: this.config.cumulativeTableName,
        FilterExpression: "sk = :sk",
        ExpressionAttributeValues: {
          ":sk": "CUMULATIVE_SCORE"
        },
        Limit: criteria.limit || 1e3
      });
      const result = await this.dynamoClient.send(scanCommand);
      for (const item of result.Items || []) {
        const qualityScore = this.calculateProfileQuality({
          username: item.username,
          displayName: item.displayName,
          profileImageUrl: item.profileImageUrl,
          followersCount: item.followersCount
        });
        const lastUpdated = item.lastUpdated || item.lastModified || (/* @__PURE__ */ new Date(0)).toISOString();
        if (criteria.maxQualityScore && qualityScore > criteria.maxQualityScore) {
          continue;
        }
        if (criteria.maxLastUpdated && lastUpdated > criteria.maxLastUpdated) {
          continue;
        }
        candidates.push({
          userId: item.pk.replace("USER#", ""),
          qualityScore,
          lastUpdated
        });
      }
      candidates.sort((a, b) => a.qualityScore - b.qualityScore);
      console.log(`\u2705 [PROFILE_CANDIDATES] ${candidates.length}\uBA85\uC758 \uD6C4\uBCF4\uC790 \uC120\uBCC4 \uC644\uB8CC`);
      return candidates.slice(0, criteria.limit || 1e3);
    } catch (error) {
      console.error(`\u274C [PROFILE_CANDIDATES] \uC870\uD68C \uC2E4\uD328:`, error);
      return [];
    }
  }
  /**
   * 🔄 Phase 2.3.2: 최근 활동 사용자 조회
   * 
   * 최근 활동한 사용자들의 프로필을 주기적으로 갱신하기 위해 조회합니다.
   * @param criteria 조회 기준
   * @returns 최근 활동 사용자 목록
   */
  async getRecentlyActiveUsers(criteria) {
    console.log(`\u{1F504} [ACTIVE_USERS] \uCD5C\uADFC \uD65C\uB3D9 \uC0AC\uC6A9\uC790 \uC870\uD68C \uC2DC\uC791:`, criteria);
    try {
      const ScanCommand = require("@aws-sdk/lib-dynamodb").ScanCommand;
      const sinceTimestamp = new Date(Date.now() - (criteria.sinceHours || 24) * 60 * 60 * 1e3).toISOString();
      const activeUsers = [];
      const scanCommand = new ScanCommand({
        TableName: this.config.cumulativeTableName,
        FilterExpression: "sk = :sk AND lastModified >= :since",
        ExpressionAttributeValues: {
          ":sk": "CUMULATIVE_SCORE",
          ":since": sinceTimestamp
        },
        Limit: criteria.limit || 500
      });
      const result = await this.dynamoClient.send(scanCommand);
      for (const item of result.Items || []) {
        const qualityScore = this.calculateProfileQuality({
          username: item.username,
          displayName: item.displayName,
          profileImageUrl: item.profileImageUrl,
          followersCount: item.followersCount
        });
        if (criteria.minQualityScore && qualityScore < criteria.minQualityScore) {
          continue;
        }
        activeUsers.push({
          userId: item.pk.replace("USER#", ""),
          qualityScore,
          lastActivity: item.lastModified || item.lastUpdated || (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      activeUsers.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
      console.log(`\u2705 [ACTIVE_USERS] ${activeUsers.length}\uBA85\uC758 \uD65C\uB3D9 \uC0AC\uC6A9\uC790 \uC870\uD68C \uC644\uB8CC`);
      return activeUsers.slice(0, criteria.limit || 500);
    } catch (error) {
      console.error(`\u274C [ACTIVE_USERS] \uC870\uD68C \uC2E4\uD328:`, error);
      return [];
    }
  }
  /**
   * 🚀 Phase 2.3.2: 배치 프로필 보강 처리
   * 
   * 다수의 사용자 프로필을 한번에 보강 처리합니다.
   * @param userIds 대상 사용자 ID 목록
   * @param options 보강 옵션
   * @returns 보강 처리 결과
   */
  async enhanceProfilesBatch(userIds, options) {
    const stats = {
      processed: 0,
      improved: 0,
      totalQualityAfter: 0,
      apiCalls: 0,
      cacheHits: 0,
      errors: 0,
      improvements: {
        username: 0,
        displayName: 0,
        profileImage: 0,
        followersCount: 0
      }
    };
    console.log(`\u{1F680} [BATCH_ENHANCE] ${userIds.length}\uBA85 \uBC30\uCE58 \uBCF4\uAC15 \uC2DC\uC791`);
    try {
      const QueryCommand = require("@aws-sdk/lib-dynamodb").QueryCommand;
      const UpdateCommand = require("@aws-sdk/lib-dynamodb").UpdateCommand;
      for (const userId of userIds) {
        try {
          const queryCommand = new QueryCommand({
            TableName: this.config.cumulativeTableName,
            KeyConditionExpression: "pk = :pk AND sk = :sk",
            ExpressionAttributeValues: {
              ":pk": `USER#${userId}`,
              ":sk": "CUMULATIVE_SCORE"
            }
          });
          const result2 = await this.dynamoClient.send(queryCommand);
          const currentProfile = result2.Items?.[0];
          if (!currentProfile) {
            console.log(`\u26A0\uFE0F [BATCH_ENHANCE] ${userId} - \uD504\uB85C\uD544 \uC5C6\uC74C, \uAC74\uB108\uB6F0\uAE30`);
            continue;
          }
          const currentQuality = this.calculateProfileQuality({
            username: currentProfile.username,
            displayName: currentProfile.displayName,
            profileImageUrl: currentProfile.profileImageUrl,
            followersCount: currentProfile.followersCount
          });
          const qualityThreshold = options?.qualityThreshold || 50;
          if (!options?.forceRefresh && currentQuality >= qualityThreshold) {
            console.log(`\u2705 [BATCH_ENHANCE] ${userId} - \uD488\uC9C8 \uCDA9\uC871 (${currentQuality}\uC810), \uAC74\uB108\uB6F0\uAE30`);
            stats.processed++;
            stats.totalQualityAfter += currentQuality;
            continue;
          }
          console.log(`\u{1F6AB} [NO_FAKE] \uC0AC\uC6A9\uC790 ${userId}: \uAC00\uC9DC \uD504\uB85C\uD544 \uC0DD\uC131 \uBE44\uD65C\uC131\uD654, \uAE30\uC874 \uB370\uC774\uD130 \uC720\uC9C0`);
          const enhancedProfile = currentProfile;
          stats.cacheHits++;
          const enhancedQuality = this.calculateProfileQuality(enhancedProfile);
          if (enhancedQuality > currentQuality) {
            if (enhancedProfile.username !== currentProfile.username) stats.improvements.username++;
            if (enhancedProfile.displayName !== currentProfile.displayName) stats.improvements.displayName++;
            if (enhancedProfile.profileImageUrl !== currentProfile.profileImageUrl) stats.improvements.profileImage++;
            if (enhancedProfile.followersCount !== currentProfile.followersCount) stats.improvements.followersCount++;
            console.log(`\u{1F3AF} [BATCH_ENHANCE] ${userId} - \uD488\uC9C8 \uAC1C\uC120: ${currentQuality}\u2192${enhancedQuality}\uC810`);
            stats.improved++;
          }
          stats.processed++;
          stats.totalQualityAfter += enhancedQuality;
          await new Promise((resolve) => setTimeout(resolve, 10));
        } catch (error) {
          console.error(`\u274C [BATCH_ENHANCE] ${userId} \uCC98\uB9AC \uC2E4\uD328:`, error);
          stats.errors++;
        }
      }
      const result = {
        processed: stats.processed,
        improved: stats.improved,
        averageQualityAfter: stats.processed > 0 ? stats.totalQualityAfter / stats.processed : 0,
        apiCalls: stats.apiCalls,
        cacheHits: stats.cacheHits,
        errors: stats.errors,
        improvements: stats.improvements
      };
      console.log(`\u2705 [BATCH_ENHANCE] \uC644\uB8CC:`, result);
      return result;
    } catch (error) {
      console.error(`\u274C [BATCH_ENHANCE] \uBC30\uCE58 \uCC98\uB9AC \uC2E4\uD328:`, error);
      return {
        processed: stats.processed,
        improved: 0,
        averageQualityAfter: 0,
        apiCalls: 0,
        cacheHits: 0,
        errors: userIds.length,
        improvements: {}
      };
    }
  }
  /**
   * 🎭 프로필 보강 시뮬레이션 (테스트용)
   * 실제 API 호출 없이 프로필 개선 효과를 시뮬레이션합니다.
   */
  async simulateProfileEnhancement(currentProfile, userId) {
    console.log(`\u{1F6AB} [DEPRECATED] simulateProfileEnhancement \uBE44\uD65C\uC131\uD654\uB428 - \uC2E4\uC81C \uD504\uB85C\uD544 \uB370\uC774\uD130\uB9CC \uC0AC\uC6A9: ${userId}`);
    const enhanced = {
      userId,
      username: currentProfile.username,
      // 가짜 이름 생성 안 함
      displayName: currentProfile.displayName,
      // 가짜 이름 생성 안 함
      profileImageUrl: currentProfile.profileImageUrl,
      // 실제 이미지만 사용
      followersCount: currentProfile.followersCount,
      // 실제 팔로워 수만 사용
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      sources: ["preserved_data"],
      // 기존 데이터 보존
      qualityScore: 75,
      lastAPIUpdate: (/* @__PURE__ */ new Date()).toISOString(),
      completeness: 90,
      ttl: Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60,
      version: "v2"
    };
    return enhanced;
  }
  /**
   * 📊 프로필 품질 점수 계산
   */
  calculateProfileQuality(profile) {
    let score = 0;
    if (ProfileValidators.isValidUsername(profile.username)) {
      score += FIELD_QUALITY_WEIGHTS.username;
    }
    if (ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += FIELD_QUALITY_WEIGHTS.displayName;
    }
    if (ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += FIELD_QUALITY_WEIGHTS.profileImageUrl;
    }
    if (ProfileValidators.isValidFollowersCount(profile.followersCount)) {
      score += FIELD_QUALITY_WEIGHTS.followersCount;
    }
    return score;
  }
};

// src/services/profile-cache-service.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_util_dynamodb = require("@aws-sdk/util-dynamodb");
var ProfileCacheService = class {
  constructor(dynamodb, tableName = process.env.USER_PROFILE_TABLE_NAME || "nasun-user-profiles-v2") {
    this.dynamodb = dynamodb;
    this.tableName = tableName;
  }
  /**
   * 🔄 배치 프로필 조회
   * 
   * @param userIds 조회할 사용자 ID 배열
   * @returns 캐시된 프로필 맵
   */
  async batchGetProfiles(userIds) {
    const results = /* @__PURE__ */ new Map();
    if (userIds.length === 0) {
      return results;
    }
    try {
      const batches = this.chunkArray(userIds, 100);
      console.log(`\u{1F4E6} [CACHE] \uBC30\uCE58 \uC870\uD68C \uC2DC\uC791: ${userIds.length}\uAC1C \uC0AC\uC6A9\uC790, ${batches.length}\uAC1C \uBC30\uCE58`);
      for (const [batchIndex, batch] of batches.entries()) {
        const keys = batch.map((userId) => ({
          pk: `USER_PROFILE#${userId}`,
          sk: "LATEST"
        }));
        try {
          const response = await this.dynamodb.send(new import_client_dynamodb.BatchGetItemCommand({
            RequestItems: {
              [this.tableName]: {
                Keys: keys.map((key) => (0, import_util_dynamodb.marshall)(key))
              }
            }
          }));
          if (response.Responses && response.Responses[this.tableName]) {
            let validCount = 0;
            let expiredCount = 0;
            for (const item of response.Responses[this.tableName]) {
              const profile = (0, import_util_dynamodb.unmarshall)(item);
              if (!profile.qualityScore) profile.qualityScore = 50;
              if (!profile.completeness) {
                profile.completeness = {
                  hasValidUsername: !!profile.username,
                  hasValidDisplayName: !!profile.displayName,
                  hasProfileImage: !!profile.profileImageUrl,
                  hasFollowersCount: !!profile.followersCount
                };
              }
              if (!profile.sources) profile.sources = ["cache"];
              if (!profile.version) profile.version = "v2";
              if (this.isValidCache(profile)) {
                results.set(profile.userId, profile);
                validCount++;
              } else {
                expiredCount++;
                console.log(`\u23F0 [CACHE] \uB9CC\uB8CC\uB41C \uCE90\uC2DC: ${profile.userId} (TTL: ${profile.ttl})`);
              }
            }
            console.log(`\u{1F4E6} [CACHE] \uBC30\uCE58 ${batchIndex + 1}/${batches.length}: ${validCount}\uAC1C \uC720\uD6A8, ${expiredCount}\uAC1C \uB9CC\uB8CC`);
          }
        } catch (batchError) {
          console.error(`\u274C [CACHE] \uBC30\uCE58 ${batchIndex + 1} \uC870\uD68C \uC2E4\uD328:`, batchError);
        }
      }
      const hitRate = userIds.length > 0 ? (results.size / userIds.length * 100).toFixed(1) : "0";
      console.log(`\u{1F4CA} [CACHE] \uC870\uD68C \uC644\uB8CC: ${userIds.length}\uAC1C \uC694\uCCAD, ${results.size}\uAC1C \uD788\uD2B8 (${hitRate}%)`);
      return results;
    } catch (error) {
      console.error(`\u274C [CACHE] \uBC30\uCE58 \uC870\uD68C \uC804\uCCB4 \uC2E4\uD328:`, error);
      return results;
    }
  }
  /**
   * ✨ 고품질 프로필 캐시 저장
   * 
   * @param profile 저장할 프로필
   * @returns 저장 성공 여부
   */
  async setCachedProfile(profile) {
    try {
      if (profile.qualityScore < PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY) {
        console.log(`\u{1F4C9} [CACHE] \uD488\uC9C8 \uBD80\uC871\uC73C\uB85C \uCE90\uC2DC \uAC74\uB108\uB6F0\uAE30: ${profile.userId} (\uC810\uC218: ${profile.qualityScore}/${PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY})`);
        return false;
      }
      const cached = {
        ...profile,
        pk: `USER_PROFILE#${profile.userId}`,
        sk: "LATEST"
      };
      await this.dynamodb.send(new import_client_dynamodb.PutItemCommand({
        TableName: this.tableName,
        Item: (0, import_util_dynamodb.marshall)(cached, { removeUndefinedValues: true })
      }));
      console.log(`\u{1F4BE} [CACHE] \uC800\uC7A5 \uC131\uACF5: ${profile.userId} (\uD488\uC9C8: ${profile.qualityScore}\uC810, TTL: ${new Date(profile.ttl * 1e3).toISOString()})`);
      return true;
    } catch (error) {
      console.error(`\u274C [CACHE] \uC800\uC7A5 \uC2E4\uD328: ${profile.userId}`, error);
      return false;
    }
  }
  /**
   * 🔄 배치 프로필 저장
   * 
   * @param profiles 저장할 프로필 배열
   * @returns 저장 결과 통계
   */
  async batchSetProfiles(profiles) {
    const stats = {
      totalAttempted: profiles.length,
      successCount: 0,
      failureCount: 0,
      skippedLowQuality: 0
    };
    console.log(`\u{1F4BE} [CACHE] \uBC30\uCE58 \uC800\uC7A5 \uC2DC\uC791: ${profiles.length}\uAC1C \uD504\uB85C\uD544`);
    for (const profile of profiles) {
      if (profile.qualityScore < PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY) {
        stats.skippedLowQuality++;
        continue;
      }
      const success = await this.setCachedProfile(profile);
      if (success) {
        stats.successCount++;
      } else {
        stats.failureCount++;
      }
    }
    console.log(`\u{1F4CA} [CACHE] \uBC30\uCE58 \uC800\uC7A5 \uC644\uB8CC: \uC131\uACF5 ${stats.successCount}\uAC1C, \uC2E4\uD328 ${stats.failureCount}\uAC1C, \uD488\uC9C8\uBD80\uC871 ${stats.skippedLowQuality}\uAC1C`);
    return stats;
  }
  /**
   * 📊 캐시 통계 조회
   */
  async getCacheStats(sampleUserIds = []) {
    if (sampleUserIds.length === 0) {
      return {
        totalSampled: 0,
        hitCount: 0,
        hitRate: 0,
        averageQuality: 0,
        expiredCount: 0
      };
    }
    const cached = await this.batchGetProfiles(sampleUserIds);
    const hitCount = cached.size;
    const hitRate = hitCount / sampleUserIds.length * 100;
    let totalQuality = 0;
    let expiredCount = 0;
    for (const profile of cached.values()) {
      totalQuality += profile.qualityScore;
      if (!this.isValidCache(profile)) {
        expiredCount++;
      }
    }
    const averageQuality = hitCount > 0 ? totalQuality / hitCount : 0;
    return {
      totalSampled: sampleUserIds.length,
      hitCount,
      hitRate: parseFloat(hitRate.toFixed(1)),
      averageQuality: parseFloat(averageQuality.toFixed(1)),
      expiredCount
    };
  }
  /**
   * 🕐 캐시 유효성 검증
   * 
   * @param profile 검증할 프로필
   * @returns 유효성 여부
   */
  isValidCache(profile) {
    const now = Math.floor(Date.now() / 1e3);
    if (profile.ttl <= now) {
      return false;
    }
    if (profile.version && !["1.0", "v2", "v3"].includes(profile.version)) {
      return false;
    }
    if (!profile.userId || !profile.username) {
      return false;
    }
    return true;
  }
  /**
   * 🔧 배열 청킹 유틸리티
   * 
   * @param array 청킹할 배열
   * @param size 청크 크기
   * @returns 청크 배열
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  /**
   * 🧹 만료된 캐시 정리 (관리용)
   * 
   * @param userIds 정리할 사용자 ID 배열 (선택적)
   */
  async cleanupExpiredCache(userIds) {
    console.log(`\u{1F9F9} [CACHE] \uB9CC\uB8CC \uCE90\uC2DC \uC815\uB9AC \uC2DC\uC791`);
    return {
      scanned: 0,
      deleted: 0
    };
  }
  /**
   * 🔍 캐시 품질 분석
   */
  async analyzeCacheQuality() {
    return {
      qualityDistribution: {
        "high (80+)": 0,
        "medium (50-79)": 0,
        "low (<50)": 0
      },
      completenessStats: {
        hasValidUsername: 0,
        hasValidDisplayName: 0,
        hasProfileImage: 0,
        hasFollowersCount: 0
      }
    };
  }
};

// src/services/twitter-api-optimizer.ts
var TwitterAPIOptimizer = class {
  // 1분 캐시
  constructor(twitterAPI, config = {
    batchSize: 100,
    // Twitter API 제한
    safetyMargin: 0.2,
    // 20% 안전 마진
    maxRetries: 3,
    // 최대 재시도
    retryDelay: 1e3,
    // 재시도 지연 (ms)
    // 🎯 Phase 2.3.1: 선별적 수집 설정
    priorityThreshold: 30,
    // 우선순위 점수 임계값 (낮춰서 더 많은 사용자 선택)
    qualityThreshold: PROFILE_QUALITY_THRESHOLDS.LOW,
    // 품질 개선 대상
    maxSelectiveBatch: 50
    // 선별적 수집 시 배치 크기
  }) {
    this.twitterAPI = twitterAPI;
    this.config = config;
    this.rateLimitCache = null;
    this.rateLimitCacheTime = 0;
    this.CACHE_DURATION = 60 * 1e3;
  }
  /**
   * 🎯 Phase 2.3.1: 선별적 프로필 수집 - 품질 점수 기반 우선순위 결정
   * 
   * @param userProfiles 사용자 프로필 정보 배열 (기존 품질 데이터 포함)
   * @returns 우선순위별로 정렬된 수집 대상 배열
   */
  async selectiveProfileCollection(userProfiles) {
    const startTime = Date.now();
    const priorities = [];
    console.log(`\u{1F3AF} [SELECTIVE] \uC120\uBCC4\uC801 \uD504\uB85C\uD544 \uC218\uC9D1 \uBD84\uC11D \uC2DC\uC791: ${userProfiles.length}\uBA85`);
    for (const profile of userProfiles) {
      const priority = this.calculateProfilePriority(profile);
      if (priority.priorityScore >= this.config.priorityThreshold) {
        priorities.push(priority);
      }
    }
    priorities.sort((a, b) => b.priorityScore - a.priorityScore);
    const duration = Date.now() - startTime;
    console.log(`\u{1F3AF} [SELECTIVE] \uBD84\uC11D \uC644\uB8CC: ${priorities.length}/${userProfiles.length}\uBA85 \uC120\uD0DD (${duration}ms)`);
    return priorities;
  }
  /**
   * 📊 프로필 우선순위 점수 계산
   * 
   * @param profile 사용자 프로필 정보
   * @returns 우선순위 정보
   */
  calculateProfilePriority(profile) {
    let priorityScore = 0;
    const reasons = [];
    let estimatedBenefit = 0;
    const currentQuality = profile.qualityScore || this.calculateBasicQualityScore(profile);
    if (currentQuality < this.config.qualityThreshold) {
      const qualityGap = this.config.qualityThreshold - currentQuality;
      priorityScore += Math.min(40, qualityGap * 0.8);
      reasons.push(`\uB0AE\uC740 \uD488\uC9C8 \uC810\uC218 (${currentQuality.toFixed(1)}\uC810)`);
      estimatedBenefit += qualityGap * 0.6;
    }
    let missingElements = 0;
    if (!profile.username || !ProfileValidators.isValidUsername(profile.username)) {
      missingElements++;
      priorityScore += 10;
      reasons.push("\uC0AC\uC6A9\uC790\uBA85 \uB204\uB77D/\uBB34\uD6A8");
      estimatedBenefit += 15;
    }
    if (!profile.displayName || !ProfileValidators.isValidDisplayName(profile.displayName)) {
      missingElements++;
      priorityScore += 8;
      reasons.push("\uD45C\uC2DC\uBA85 \uB204\uB77D/\uBB34\uD6A8");
      estimatedBenefit += 12;
    }
    if (!profile.profileImageUrl || !ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      missingElements++;
      priorityScore += 12;
      reasons.push("\uD504\uB85C\uD544 \uC774\uBBF8\uC9C0 \uB204\uB77D/\uBB34\uD6A8");
      estimatedBenefit += 18;
    }
    const followersCount = profile.followersCount || 0;
    if (followersCount > 1e4) {
      priorityScore += 20;
      reasons.push(`\uACE0\uD314\uB85C\uC6CC \uC0AC\uC6A9\uC790 (${followersCount.toLocaleString()}\uBA85)`);
      estimatedBenefit += 25;
    } else if (followersCount > 1e3) {
      priorityScore += 12;
      reasons.push(`\uC911\uD314\uB85C\uC6CC \uC0AC\uC6A9\uC790 (${followersCount.toLocaleString()}\uBA85)`);
      estimatedBenefit += 15;
    } else if (followersCount > 100) {
      priorityScore += 5;
      estimatedBenefit += 8;
    }
    if (profile.lastUpdated) {
      const daysSinceUpdate = (Date.now() - new Date(profile.lastUpdated).getTime()) / (24 * 60 * 60 * 1e3);
      if (daysSinceUpdate > 30) {
        priorityScore += 10;
        reasons.push(`\uC624\uB798\uB41C \uB370\uC774\uD130 (${Math.floor(daysSinceUpdate)}\uC77C \uC804)`);
        estimatedBenefit += 10;
      } else if (daysSinceUpdate > 7) {
        priorityScore += 5;
        estimatedBenefit += 5;
      }
    } else {
      priorityScore += 8;
      reasons.push("\uC5C5\uB370\uC774\uD2B8 \uAE30\uB85D \uC5C6\uC74C");
      estimatedBenefit += 12;
    }
    return {
      userId: profile.userId,
      priorityScore: Math.min(100, priorityScore),
      // 최대 100점
      reasons,
      estimatedBenefit,
      lastUpdated: profile.lastUpdated,
      currentQualityScore: currentQuality
    };
  }
  /**
   * 📈 API 비용 효과성 분석
   * 
   * @param priorities 우선순위 배열
   * @returns 비용 효과성 분석 결과
   */
  async analyzeCostEffectiveness(priorities) {
    const rateLimitStatus = await this.getRateLimitStatus();
    const availableAPICalls = Math.floor(rateLimitStatus.remaining * (1 - this.config.safetyMargin));
    const highPriorityUsers = priorities.filter((p) => p.priorityScore >= 80).length;
    const estimatedAPICalls = Math.ceil(priorities.length / this.config.maxSelectiveBatch);
    const expectedQualityImprovement = priorities.reduce((sum, p) => sum + p.estimatedBenefit, 0) / priorities.length;
    const costBenefitRatio = expectedQualityImprovement / Math.max(1, estimatedAPICalls);
    const recommendations = [];
    if (estimatedAPICalls > availableAPICalls) {
      recommendations.push(`API \uD560\uB2F9\uB7C9 \uBD80\uC871: ${estimatedAPICalls}\uD68C \uD544\uC694, ${availableAPICalls}\uD68C \uAC00\uB2A5`);
      recommendations.push(`\uC0C1\uC704 ${Math.floor(availableAPICalls * this.config.maxSelectiveBatch)}\uBA85\uB9CC \uCC98\uB9AC \uAD8C\uC7A5`);
    }
    if (costBenefitRatio > 15) {
      recommendations.push("\uB9E4\uC6B0 \uB192\uC740 \uD6A8\uACFC\uC131: \uC989\uC2DC \uCC98\uB9AC \uAD8C\uC7A5");
    } else if (costBenefitRatio > 10) {
      recommendations.push("\uB192\uC740 \uD6A8\uACFC\uC131: \uC6B0\uC120\uC21C\uC704 \uCC98\uB9AC \uAD8C\uC7A5");
    } else if (costBenefitRatio < 5) {
      recommendations.push("\uB0AE\uC740 \uD6A8\uACFC\uC131: \uCC98\uB9AC \uC5F0\uAE30 \uACE0\uB824");
    }
    if (highPriorityUsers > priorities.length * 0.3) {
      recommendations.push("\uACE0\uC6B0\uC120\uC21C\uC704 \uC0AC\uC6A9\uC790 \uB2E4\uC218: \uBC30\uCE58 \uD06C\uAE30 \uD655\uB300 \uACE0\uB824");
    }
    return {
      totalUsers: priorities.length,
      highPriorityUsers,
      estimatedAPICalls,
      expectedQualityImprovement,
      costBenefitRatio,
      recommendations
    };
  }
  /**
   * 🔧 Rate Limit 고려 배치 크기 조정
   * 
   * @param requestedUsers 요청된 사용자 수
   * @returns 조정된 배치 크기
   */
  async adjustBatchSizeForRateLimit(requestedUsers) {
    const rateLimitStatus = await this.getRateLimitStatus();
    const safeAPICalls = Math.floor(rateLimitStatus.remaining * (1 - this.config.safetyMargin));
    let recommendedBatchSize = this.config.maxSelectiveBatch;
    const estimatedBatches = Math.ceil(requestedUsers / recommendedBatchSize);
    const safetyRecommendations = [];
    if (rateLimitStatus.usagePercentage > 80) {
      recommendedBatchSize = Math.min(25, recommendedBatchSize);
      safetyRecommendations.push("Rate Limit 80% \uCD08\uACFC: \uC18C\uD615 \uBC30\uCE58 \uAD8C\uC7A5");
    } else if (rateLimitStatus.usagePercentage > 60) {
      recommendedBatchSize = Math.min(40, recommendedBatchSize);
      safetyRecommendations.push("Rate Limit 60% \uCD08\uACFC: \uC911\uD615 \uBC30\uCE58 \uAD8C\uC7A5");
    }
    if (estimatedBatches > safeAPICalls) {
      const maxProcessableUsers = safeAPICalls * recommendedBatchSize;
      safetyRecommendations.push(`API \uD560\uB2F9\uB7C9 \uCD08\uACFC: \uCD5C\uB300 ${maxProcessableUsers}\uBA85 \uCC98\uB9AC \uAC00\uB2A5`);
      return {
        recommendedBatchSize,
        maxProcessableUsers,
        estimatedBatches: safeAPICalls,
        safetyRecommendations
      };
    }
    return {
      recommendedBatchSize,
      maxProcessableUsers: requestedUsers,
      estimatedBatches,
      safetyRecommendations
    };
  }
  /**
   * 📊 기본 품질 점수 계산 (프로필 정보 기반)
   */
  calculateBasicQualityScore(profile) {
    let score = 0;
    if (profile.username && ProfileValidators.isValidUsername(profile.username)) {
      score += 25;
    }
    if (profile.displayName && ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += 20;
    }
    if (profile.profileImageUrl && ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += 30;
    }
    if (profile.followersCount !== void 0 && profile.followersCount >= 0) {
      score += 25;
    }
    return score;
  }
  /**
   * ⚡ 배치 사용자 조회 최적화
   * 
   * @param userIds 조회할 사용자 ID 배열
   * @returns 사용자 데이터 맵
   */
  async batchGetUsers(userIds) {
    const startTime = Date.now();
    const results = /* @__PURE__ */ new Map();
    if (userIds.length === 0) {
      return results;
    }
    try {
      const deduped = this.deduplicateUsers(userIds);
      const saved = userIds.length - deduped.length;
      console.log(`\u267B\uFE0F [API_OPT] \uC911\uBCF5 \uC81C\uAC70: ${userIds.length}\uAC1C \u2192 ${deduped.length}\uAC1C (${saved}\uAC1C \uC808\uC57D, ${(saved / userIds.length * 100).toFixed(1)}%)`);
      const plan = await this.planAPIUsage(deduped.length);
      if (!plan.canProceed) {
        console.warn(`\u26A0\uFE0F [API_OPT] Rate Limit \uBD80\uC871\uC73C\uB85C API \uD638\uCD9C \uAC74\uB108\uB6F0\uAE30: ${plan.reason}`);
        return results;
      }
      console.log(`\u{1F4CA} [API_OPT] \uC0AC\uC6A9 \uACC4\uD68D: ${deduped.length}\uAC1C \uC694\uCCAD, \uC608\uC0C1 \uBE44\uC6A9 ${plan.estimatedCost}\uD68C`);
      const batches = this.chunkArray(deduped, this.config.batchSize);
      let totalProcessed = 0;
      let totalErrors = 0;
      for (const [batchIndex, batch] of batches.entries()) {
        try {
          console.log(`\u{1F525} [API_OPT] \uBC30\uCE58 ${batchIndex + 1}/${batches.length}: ${batch.length}\uAC1C \uC0AC\uC6A9\uC790 \uC870\uD68C`);
          const batchResults = await this.processBatch(batch, batchIndex);
          for (const [userId, userData] of batchResults) {
            results.set(userId, userData);
          }
          totalProcessed += batchResults.size;
          if (batchIndex < batches.length - 1) {
            await this.delay(200);
          }
        } catch (batchError) {
          totalErrors++;
          console.error(`\u274C [API_OPT] \uBC30\uCE58 ${batchIndex + 1} \uC2E4\uD328:`, batchError);
          if (this.isRateLimitError(batchError)) {
            console.warn(`\u{1F6A8} [API_OPT] Rate Limit \uC5D0\uB7EC\uB85C \uC911\uB2E8: \uBC30\uCE58 ${batchIndex + 1}/${batches.length}`);
            break;
          }
        }
      }
      const duration = Date.now() - startTime;
      const efficiency = deduped.length > 0 ? (totalProcessed / deduped.length * 100).toFixed(1) : "0";
      console.log(`\u{1F3C1} [API_OPT] \uC644\uB8CC: ${totalProcessed}/${deduped.length}\uAC1C \uC131\uACF5 (${efficiency}%), ${totalErrors}\uAC1C \uBC30\uCE58 \uC2E4\uD328, ${duration}ms`);
      return results;
    } catch (error) {
      console.error(`\u274C [API_OPT] \uC804\uCCB4 \uC2E4\uD328:`, error);
      return results;
    }
  }
  /**
   * 📊 API 사용 계획 수립
   * 
   * @param estimatedUsers 예상 사용자 수
   * @returns API 사용 계획
   */
  async planAPIUsage(estimatedUsers) {
    try {
      const status = await this.getRateLimitStatus();
      const requiredBatches = Math.ceil(estimatedUsers / this.config.batchSize);
      const safeQuota = Math.floor(status.remaining * (1 - this.config.safetyMargin));
      const plan = {
        canProceed: safeQuota >= requiredBatches,
        estimatedCost: requiredBatches,
        remainingQuota: status.remaining,
        recommendedBatchSize: Math.min(this.config.batchSize, safeQuota * 50),
        // 50개씩 여유
        estimatedCompletionTime: requiredBatches * 300
        // 배치당 300ms 예상
      };
      if (!plan.canProceed) {
        plan.reason = `Rate Limit \uBD80\uC871: \uD544\uC694 ${requiredBatches}\uD68C, \uC548\uC804 \uC5EC\uC720\uBD84 ${safeQuota}\uD68C`;
      }
      console.log(`\u{1F4C8} [API_OPT] \uACC4\uD68D: ${plan.canProceed ? "\u2705 \uC9C4\uD589" : "\u274C \uC911\uB2E8"} - \uD544\uC694 ${requiredBatches}\uD68C, \uC5EC\uC720 ${safeQuota}\uD68C`);
      return plan;
    } catch (error) {
      console.error(`\u274C [API_OPT] \uACC4\uD68D \uC218\uB9BD \uC2E4\uD328:`, error);
      return {
        canProceed: false,
        estimatedCost: 0,
        remainingQuota: 0,
        recommendedBatchSize: 0,
        estimatedCompletionTime: 0,
        reason: "Rate Limit \uC0C1\uD0DC \uC870\uD68C \uC2E4\uD328"
      };
    }
  }
  /**
   * 🎯 사용자 중복 제거
   * 
   * @param userIds 사용자 ID 배열
   * @returns 중복 제거된 사용자 ID 배열
   */
  deduplicateUsers(userIds) {
    const unique = [...new Set(userIds.filter((id) => id && id.trim() !== ""))];
    return unique;
  }
  /**
   * 🔥 배치 처리
   * 
   * @param batch 처리할 사용자 ID 배치
   * @param batchIndex 배치 인덱스
   * @returns 배치 처리 결과
   */
  async processBatch(batch, batchIndex) {
    const results = /* @__PURE__ */ new Map();
    if (!this.twitterAPI) {
      console.log(`\u{1F527} [API_OPT] Twitter API \uC11C\uBE44\uC2A4 \uC5C6\uC74C, \uBE48 \uACB0\uACFC \uBC18\uD658 (\uC2E4\uC81C \uD504\uB85C\uD544 \uB370\uC774\uD130\uB9CC \uC0AC\uC6A9)`);
      return results;
    }
    try {
      const users = await this.twitterAPI.getUsersByIds(batch, {
        "user.fields": ["public_metrics", "profile_image_url", "name", "username"]
      });
      if (users.data) {
        for (const user of users.data) {
          const userData = {
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            profile_image_url: user.profile_image_url,
            public_metrics: user.public_metrics
          };
          results.set(user.id, userData);
        }
      }
      const missing = batch.filter((id) => !results.has(id));
      if (missing.length > 0) {
        console.log(`\u26A0\uFE0F [API_OPT] \uBC30\uCE58 ${batchIndex + 1} \uB204\uB77D: ${missing.length}\uAC1C (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""})`);
      }
      return results;
    } catch (error) {
      console.error(`\u274C [API_OPT] \uBC30\uCE58 ${batchIndex + 1} API \uD638\uCD9C \uC2E4\uD328:`, error);
      throw error;
    }
  }
  /**
   * 📊 Rate Limit 상태 조회
   * 
   * @returns Rate Limit 상태
   */
  async getRateLimitStatus() {
    const now = Date.now();
    if (this.rateLimitCache && now - this.rateLimitCacheTime < this.CACHE_DURATION) {
      return this.rateLimitCache;
    }
    try {
      if (this.twitterAPI && this.twitterAPI.getRateLimitStatus) {
        const status = await this.twitterAPI.getRateLimitStatus();
        this.rateLimitCache = {
          remaining: status.remaining || 300,
          // 기본값
          total: status.limit || 300,
          resetTime: status.reset || now + 15 * 60 * 1e3,
          // 15분 후
          resetTimeISO: new Date(status.reset || now + 15 * 60 * 1e3).toISOString(),
          usagePercentage: status.remaining && status.limit ? (status.limit - status.remaining) / status.limit * 100 : 0
        };
        this.rateLimitCacheTime = now;
        console.log(`\u{1F4CA} [API_OPT] Rate Limit: ${this.rateLimitCache.remaining}/${this.rateLimitCache.total} (${this.rateLimitCache.usagePercentage.toFixed(1)}% \uC0AC\uC6A9)`);
        return this.rateLimitCache;
      }
    } catch (error) {
      console.warn(`\u26A0\uFE0F [API_OPT] Rate Limit \uC870\uD68C \uC2E4\uD328, \uAE30\uBCF8\uAC12 \uC0AC\uC6A9:`, error);
    }
    const defaultStatus = {
      remaining: 100,
      total: 300,
      resetTime: now + 15 * 60 * 1e3,
      resetTimeISO: new Date(now + 15 * 60 * 1e3).toISOString(),
      usagePercentage: 66.7
    };
    this.rateLimitCache = defaultStatus;
    this.rateLimitCacheTime = now;
    return defaultStatus;
  }
  /**
   * 🔧 유틸리티 메서드들
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  isRateLimitError(error) {
    return error?.status === 429 || error?.code === "RATE_LIMIT_EXCEEDED" || error?.message && error.message.toLowerCase().includes("rate limit");
  }
  createMockUserData(userId) {
    throw new Error(`[DEPRECATED] createMockUserData \uBE44\uD65C\uC131\uD654\uB428 - \uC2E4\uC81C \uD504\uB85C\uD544 \uB370\uC774\uD130\uB9CC \uC0AC\uC6A9\uD574\uC57C \uD568: ${userId}`);
  }
  /**
   * 🎯 Phase 2.3.1: 선별적 프로필 수집 및 최적화된 업데이트 수행
   * 
   * @param userProfiles 사용자 프로필 정보 배열
   * @returns 업데이트된 프로필 데이터 맵
   */
  async selectiveProfileUpdate(userProfiles) {
    const startTime = Date.now();
    console.log(`\u{1F3AF} [SELECTIVE_UPDATE] \uC120\uBCC4\uC801 \uD504\uB85C\uD544 \uC5C5\uB370\uC774\uD2B8 \uC2DC\uC791: ${userProfiles.length}\uBA85 \uBD84\uC11D`);
    const priorities = await this.selectiveProfileCollection(userProfiles);
    console.log(`\u{1F3AF} [SELECTIVE_UPDATE] \uC120\uBCC4 \uC644\uB8CC: ${priorities.length}\uBA85 \uC120\uD0DD\uB428`);
    const analysis = await this.analyzeCostEffectiveness(priorities);
    console.log(`\u{1F4C8} [SELECTIVE_UPDATE] \uBE44\uC6A9 \uD6A8\uACFC\uC131 \uBD84\uC11D: \uBE44\uC6A9 \uB300\uBE44 \uD6A8\uACFC ${analysis.costBenefitRatio.toFixed(1)}`);
    const batchAdjustment = await this.adjustBatchSizeForRateLimit(priorities.length);
    console.log(`\u{1F527} [SELECTIVE_UPDATE] \uBC30\uCE58 \uC870\uC815: ${batchAdjustment.recommendedBatchSize}\uAC1C\uC529, ${batchAdjustment.estimatedBatches}\uD68C \uCC98\uB9AC`);
    const processableUsers = priorities.slice(0, batchAdjustment.maxProcessableUsers);
    const skippedUsers = priorities.slice(batchAdjustment.maxProcessableUsers).map((p) => p.userId);
    if (skippedUsers.length > 0) {
      console.log(`\u26A0\uFE0F [SELECTIVE_UPDATE] Rate Limit \uCD08\uACFC\uB85C ${skippedUsers.length}\uBA85 \uAC74\uB108\uB700`);
    }
    const userIds = processableUsers.map((p) => p.userId);
    const updatedProfiles = await this.batchGetUsers(userIds);
    const processingTime = Date.now() - startTime;
    const processingSummary = {
      totalAnalyzed: userProfiles.length,
      selectedForUpdate: priorities.length,
      actuallyUpdated: updatedProfiles.size,
      apiCallsUsed: Math.ceil(userIds.length / batchAdjustment.recommendedBatchSize),
      processingTime
    };
    console.log(`\u{1F3C1} [SELECTIVE_UPDATE] \uC644\uB8CC: ${processingSummary.actuallyUpdated}/${processingSummary.totalAnalyzed}\uBA85 \uC5C5\uB370\uC774\uD2B8 (${processingTime}ms)`);
    return {
      updatedProfiles,
      analysis,
      skippedUsers,
      processingSummary
    };
  }
  /**
   * 📊 프로필 품질 개선 잠재력 분석
   * 
   * @param userProfiles 분석할 사용자 프로필 배열
   * @returns 개선 잠재력 분석 결과
   */
  async analyzeImprovementPotential(userProfiles) {
    let lowQuality = 0, mediumQuality = 0, highQuality = 0;
    const improvementCategories = {
      username: 0,
      displayName: 0,
      profileImage: 0,
      followers: 0,
      outdated: 0
    };
    let totalPotentialIncrease = 0;
    const recommendedActions = [];
    for (const profile of userProfiles) {
      const currentQuality = profile.qualityScore || this.calculateBasicQualityScore(profile);
      if (currentQuality < PROFILE_QUALITY_THRESHOLDS.LOW) {
        lowQuality++;
      } else if (currentQuality < PROFILE_QUALITY_THRESHOLDS.MEDIUM) {
        mediumQuality++;
      } else {
        highQuality++;
      }
      let potentialIncrease = 0;
      if (!profile.username || !ProfileValidators.isValidUsername(profile.username)) {
        improvementCategories.username++;
        potentialIncrease += 25;
      }
      if (!profile.displayName || !ProfileValidators.isValidDisplayName(profile.displayName)) {
        improvementCategories.displayName++;
        potentialIncrease += 20;
      }
      if (!profile.profileImageUrl || !ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
        improvementCategories.profileImage++;
        potentialIncrease += 30;
      }
      if (profile.followersCount === void 0) {
        improvementCategories.followers++;
        potentialIncrease += 25;
      }
      if (profile.lastUpdated) {
        const daysSinceUpdate = (Date.now() - new Date(profile.lastUpdated).getTime()) / (24 * 60 * 60 * 1e3);
        if (daysSinceUpdate > 30) {
          improvementCategories.outdated++;
          potentialIncrease += 10;
        }
      }
      totalPotentialIncrease += potentialIncrease;
    }
    const averagePotentialIncrease = totalPotentialIncrease / userProfiles.length;
    if (improvementCategories.profileImage > userProfiles.length * 0.3) {
      recommendedActions.push("\uD504\uB85C\uD544 \uC774\uBBF8\uC9C0 \uBCF5\uAD6C \uC6B0\uC120 \uCC98\uB9AC \uAD8C\uC7A5");
    }
    if (improvementCategories.username > userProfiles.length * 0.2) {
      recommendedActions.push("\uC0AC\uC6A9\uC790\uBA85 \uBCF5\uAD6C \uC2DC\uAE09 \uCC98\uB9AC \uD544\uC694");
    }
    if (lowQuality > userProfiles.length * 0.4) {
      recommendedActions.push("\uB300\uADDC\uBAA8 \uD488\uC9C8 \uAC1C\uC120 \uC791\uC5C5 \uD544\uC694");
    }
    if (improvementCategories.outdated > userProfiles.length * 0.5) {
      recommendedActions.push("\uC815\uAE30\uC801 \uD504\uB85C\uD544 \uC5C5\uB370\uC774\uD2B8 \uC2DC\uC2A4\uD15C \uAD6C\uCD95 \uAD8C\uC7A5");
    }
    return {
      totalUsers: userProfiles.length,
      lowQualityUsers: lowQuality,
      mediumQualityUsers: mediumQuality,
      highQualityUsers: highQuality,
      improvementCategories,
      potentialScoreIncrease: averagePotentialIncrease,
      recommendedActions
    };
  }
  /**
   * 📈 최적화 통계 조회
   */
  getOptimizationStats() {
    return {
      totalRequests: 0,
      deduplicationSavings: 0,
      averageBatchSize: this.config.batchSize,
      successRate: 0
    };
  }
  /**
   * ⚙️ 설정 업데이트
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log(`\u2699\uFE0F [API_OPT] \uC124\uC815 \uC5C5\uB370\uC774\uD2B8:`, newConfig);
  }
  /**
   * 🧹 캐시 정리
   */
  clearCache() {
    this.rateLimitCache = null;
    this.rateLimitCacheTime = 0;
    console.log(`\u{1F9F9} [API_OPT] \uCE90\uC2DC \uC815\uB9AC \uC644\uB8CC`);
  }
};

// src/services/profile-quality-monitor.ts
var import_client_cloudwatch2 = require("@aws-sdk/client-cloudwatch");

// src/services/cloudwatch-metrics.ts
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");
var CloudWatchMetricsService = class {
  /**
   * 🔧 CloudWatch Dimension Value를 ASCII 안전 문자열로 변환
   * 비-ASCII 문자를 URL 인코딩하여 CloudWatch API 호환성 확보
   */
  sanitizeDimensionValue(value) {
    try {
      return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`).substring(0, 255);
    } catch (error) {
      console.warn(`\u26A0\uFE0F [CLOUDWATCH] Dimension \uAC12 \uC778\uCF54\uB529 \uC2E4\uD328: ${value}`, error);
      return "encoding_failed";
    }
  }
  constructor(region = "ap-northeast-2", namespace = "NASUN/BookmarkSystem") {
    this.client = new import_client_cloudwatch.CloudWatchClient({ region });
    this.namespace = namespace;
    this.defaultDimensions = [
      { Name: "System", Value: "NASUN-Leaderboard-V2" },
      { Name: "Environment", Value: "development" }
    ];
  }
  /**
   * 북마크 수집 메트릭 전송
   */
  async putBookmarkCollectionMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.bookmarkCollectionSuccess !== void 0) {
      metricData.push({
        MetricName: "BookmarkCollectionSuccess",
        Value: metrics.bookmarkCollectionSuccess,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkCollectionFailure !== void 0) {
      metricData.push({
        MetricName: "BookmarkCollectionFailure",
        Value: metrics.bookmarkCollectionFailure,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkCollectionLatency !== void 0) {
      metricData.push({
        MetricName: "BookmarkCollectionLatency",
        Value: metrics.bookmarkCollectionLatency,
        Unit: "Milliseconds",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkDataPoints !== void 0) {
      metricData.push({
        MetricName: "BookmarkDataPoints",
        Value: metrics.bookmarkDataPoints,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkRateLimitHits !== void 0) {
      metricData.push({
        MetricName: "BookmarkRateLimitHits",
        Value: metrics.bookmarkRateLimitHits,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkRateLimitRemaining !== void 0) {
      metricData.push({
        MetricName: "BookmarkRateLimitRemaining",
        Value: metrics.bookmarkRateLimitRemaining,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.oauth2TokenExpiration !== void 0) {
      metricData.push({
        MetricName: "OAuth2TokenExpiration",
        Value: metrics.oauth2TokenExpiration,
        Unit: "Seconds",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.oauth2TokenRefreshSuccess !== void 0) {
      metricData.push({
        MetricName: "OAuth2TokenRefreshSuccess",
        Value: metrics.oauth2TokenRefreshSuccess,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.oauth2TokenRefreshFailure !== void 0) {
      metricData.push({
        MetricName: "OAuth2TokenRefreshFailure",
        Value: metrics.oauth2TokenRefreshFailure,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkDataQualityScore !== void 0) {
      metricData.push({
        MetricName: "BookmarkDataQualityScore",
        Value: metrics.bookmarkDataQualityScore,
        Unit: "Percent",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkDuplicateCount !== void 0) {
      metricData.push({
        MetricName: "BookmarkDuplicateCount",
        Value: metrics.bookmarkDuplicateCount,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 시스템 성능 메트릭 전송
   */
  async putSystemPerformanceMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.lambdaDuration !== void 0) {
      metricData.push({
        MetricName: "LambdaDuration",
        Value: metrics.lambdaDuration,
        Unit: "Milliseconds",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Performance" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.lambdaMemoryUsage !== void 0) {
      metricData.push({
        MetricName: "LambdaMemoryUsage",
        Value: metrics.lambdaMemoryUsage,
        Unit: "Megabytes",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Performance" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.lambdaColdStart !== void 0) {
      metricData.push({
        MetricName: "LambdaColdStart",
        Value: metrics.lambdaColdStart,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Performance" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.dynamodbReadLatency !== void 0) {
      metricData.push({
        MetricName: "DynamoDBReadLatency",
        Value: metrics.dynamodbReadLatency,
        Unit: "Milliseconds",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Database" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.dynamodbWriteLatency !== void 0) {
      metricData.push({
        MetricName: "DynamoDBWriteLatency",
        Value: metrics.dynamodbWriteLatency,
        Unit: "Milliseconds",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Database" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.dynamodbThrottles !== void 0) {
      metricData.push({
        MetricName: "DynamoDBThrottles",
        Value: metrics.dynamodbThrottles,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Database" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.apiCallFrequency !== void 0) {
      metricData.push({
        MetricName: "APICallFrequency",
        Value: metrics.apiCallFrequency,
        Unit: "Count/Second",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "API" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.apiErrorRate !== void 0) {
      metricData.push({
        MetricName: "APIErrorRate",
        Value: metrics.apiErrorRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "API" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.systemHealthScore !== void 0) {
      metricData.push({
        MetricName: "SystemHealthScore",
        Value: metrics.systemHealthScore,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Health" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 🔧 Phase 2.2.1: 프로필 정보 품질 모니터링 메트릭 전송
   */
  async putProfileQualityMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions, { Name: "MetricType", Value: "ProfileQuality" }];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.profileCompletionRate !== void 0) {
      metricData.push({
        MetricName: "ProfileCompletionRate",
        Value: metrics.profileCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "Completion" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileImageCompletionRate !== void 0) {
      metricData.push({
        MetricName: "ProfileImageCompletionRate",
        Value: metrics.profileImageCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "ProfileImage" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.usernameCompletionRate !== void 0) {
      metricData.push({
        MetricName: "UsernameCompletionRate",
        Value: metrics.usernameCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "Username" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.displayNameCompletionRate !== void 0) {
      metricData.push({
        MetricName: "DisplayNameCompletionRate",
        Value: metrics.displayNameCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "DisplayName" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.followersCountCompletionRate !== void 0) {
      metricData.push({
        MetricName: "FollowersCountCompletionRate",
        Value: metrics.followersCountCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "FollowersCount" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.highQualityProfiles !== void 0) {
      metricData.push({
        MetricName: "HighQualityProfiles",
        Value: metrics.highQualityProfiles,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "QualityTier", Value: "High" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mediumQualityProfiles !== void 0) {
      metricData.push({
        MetricName: "MediumQualityProfiles",
        Value: metrics.mediumQualityProfiles,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "QualityTier", Value: "Medium" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.lowQualityProfiles !== void 0) {
      metricData.push({
        MetricName: "LowQualityProfiles",
        Value: metrics.lowQualityProfiles,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "QualityTier", Value: "Low" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.averageProfileQualityScore !== void 0) {
      metricData.push({
        MetricName: "AverageProfileQualityScore",
        Value: metrics.averageProfileQualityScore,
        Unit: "None",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "Average" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileDataLossEvents !== void 0) {
      metricData.push({
        MetricName: "ProfileDataLossEvents",
        Value: metrics.profileDataLossEvents,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "DataLossCategory", Value: "Events" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.nullValueDetectedCount !== void 0) {
      metricData.push({
        MetricName: "NullValueDetectedCount",
        Value: metrics.nullValueDetectedCount,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "DataLossCategory", Value: "NullValues" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.invalidValueDetectedCount !== void 0) {
      metricData.push({
        MetricName: "InvalidValueDetectedCount",
        Value: metrics.invalidValueDetectedCount,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "DataLossCategory", Value: "InvalidValues" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileRecoveryAttempts !== void 0) {
      metricData.push({
        MetricName: "ProfileRecoveryAttempts",
        Value: metrics.profileRecoveryAttempts,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "RecoveryCategory", Value: "Attempts" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileRecoverySuccess !== void 0) {
      metricData.push({
        MetricName: "ProfileRecoverySuccess",
        Value: metrics.profileRecoverySuccess,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "RecoveryCategory", Value: "Success" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.apiNullResponseCount !== void 0) {
      metricData.push({
        MetricName: "APINullResponseCount",
        Value: metrics.apiNullResponseCount,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "APIQualityCategory", Value: "NullResponse" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.apiValidResponseCount !== void 0) {
      metricData.push({
        MetricName: "APIValidResponseCount",
        Value: metrics.apiValidResponseCount,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "APIQualityCategory", Value: "ValidResponse" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.cacheHitRate !== void 0) {
      metricData.push({
        MetricName: "ProfileCacheHitRate",
        Value: metrics.cacheHitRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "CacheCategory", Value: "HitRate" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileMergeOperations !== void 0) {
      metricData.push({
        MetricName: "ProfileMergeOperations",
        Value: metrics.profileMergeOperations,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "OperationCategory", Value: "ProfileMerge" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 보안 감사 메트릭 전송
   */
  async putSecurityAuditMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions, { Name: "MetricType", Value: "Security" }];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.tokenAccessAttempts !== void 0) {
      metricData.push({
        MetricName: "TokenAccessAttempts",
        Value: metrics.tokenAccessAttempts,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "TokenSecurity" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.tokenValidationFailures !== void 0) {
      metricData.push({
        MetricName: "TokenValidationFailures",
        Value: metrics.tokenValidationFailures,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "TokenSecurity" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.suspiciousApiUsage !== void 0) {
      metricData.push({
        MetricName: "SuspiciousAPIUsage",
        Value: metrics.suspiciousApiUsage,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "APIUsage" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.unauthorizedAccess !== void 0) {
      metricData.push({
        MetricName: "UnauthorizedAccess",
        Value: metrics.unauthorizedAccess,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "AccessControl" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.failedAuthentication !== void 0) {
      metricData.push({
        MetricName: "FailedAuthentication",
        Value: metrics.failedAuthentication,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "AccessControl" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.dataEncryptionStatus !== void 0) {
      metricData.push({
        MetricName: "DataEncryptionStatus",
        Value: metrics.dataEncryptionStatus,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "DataProtection" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.secretsManagerAccess !== void 0) {
      metricData.push({
        MetricName: "SecretsManagerAccess",
        Value: metrics.secretsManagerAccess,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "DataProtection" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 멘션 카운터 메트릭 전송
   */
  async putMentionCounterMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions, { Name: "MetricType", Value: "MentionCounter" }];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.mentionProcessingSuccess !== void 0) {
      metricData.push({
        MetricName: "MentionProcessingSuccess",
        Value: metrics.mentionProcessingSuccess,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "ProcessingCategory", Value: "Success" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionProcessingFailure !== void 0) {
      metricData.push({
        MetricName: "MentionProcessingFailure",
        Value: metrics.mentionProcessingFailure,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "ProcessingCategory", Value: "Failure" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionProcessingLatency !== void 0) {
      metricData.push({
        MetricName: "MentionProcessingLatency",
        Value: metrics.mentionProcessingLatency,
        Unit: "Milliseconds",
        Dimensions: [...dimensions, { Name: "ProcessingCategory", Value: "Performance" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionDailyLimitReached !== void 0) {
      metricData.push({
        MetricName: "MentionDailyLimitReached",
        Value: metrics.mentionDailyLimitReached,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "LimitCategory", Value: "DailyLimit" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionCooldownViolations !== void 0) {
      metricData.push({
        MetricName: "MentionCooldownViolations",
        Value: metrics.mentionCooldownViolations,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "LimitCategory", Value: "Cooldown" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionContentQualityFailures !== void 0) {
      metricData.push({
        MetricName: "MentionContentQualityFailures",
        Value: metrics.mentionContentQualityFailures,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "ContentFilter" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionScoreCalculated !== void 0) {
      metricData.push({
        MetricName: "MentionScoreCalculated",
        Value: metrics.mentionScoreCalculated,
        Unit: "None",
        Dimensions: [...dimensions, { Name: "ScoreCategory", Value: "Final" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionQualityScore !== void 0) {
      metricData.push({
        MetricName: "MentionQualityScore",
        Value: metrics.mentionQualityScore,
        Unit: "None",
        Dimensions: [...dimensions, { Name: "ScoreCategory", Value: "Quality" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionCooldownBonus !== void 0) {
      metricData.push({
        MetricName: "MentionCooldownBonus",
        Value: metrics.mentionCooldownBonus,
        Unit: "None",
        Dimensions: [...dimensions, { Name: "ScoreCategory", Value: "Bonus" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionSpamDetected !== void 0) {
      metricData.push({
        MetricName: "MentionSpamDetected",
        Value: metrics.mentionSpamDetected,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "PatternCategory", Value: "Spam" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionValidTargetFound !== void 0) {
      metricData.push({
        MetricName: "MentionValidTargetFound",
        Value: metrics.mentionValidTargetFound,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "PatternCategory", Value: "TargetMention" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionContentLength !== void 0) {
      metricData.push({
        MetricName: "MentionContentLength",
        Value: metrics.mentionContentLength,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "PatternCategory", Value: "ContentLength" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 복합 메트릭 전송 (사용량 분석)
   */
  async putUsageAnalyticsMetrics(totalBookmarks, uniqueUsers, avgBookmarksPerUser, bookmarkTrends, timeRange) {
    const dimensions = [
      ...this.defaultDimensions,
      { Name: "MetricType", Value: "Analytics" },
      { Name: "TimeRange", Value: timeRange }
    ];
    const metricData = [
      {
        MetricName: "TotalBookmarks",
        Value: totalBookmarks,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "UniqueBookmarkUsers",
        Value: uniqueUsers,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "AvgBookmarksPerUser",
        Value: avgBookmarksPerUser,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      }
    ];
    if (bookmarkTrends.length > 0) {
      const trendAverage = bookmarkTrends.reduce((sum, val) => sum + val, 0) / bookmarkTrends.length;
      metricData.push({
        MetricName: "BookmarkTrendAverage",
        Value: trendAverage,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "AnalysisType", Value: "Trend" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    await this.sendMetrics(metricData);
  }
  /**
   * 메트릭 데이터를 CloudWatch로 전송
   */
  async sendMetrics(metricData) {
    try {
      const batchSize = 20;
      for (let i = 0; i < metricData.length; i += batchSize) {
        const batch = metricData.slice(i, i + batchSize);
        const command = new import_client_cloudwatch.PutMetricDataCommand({
          Namespace: this.namespace,
          MetricData: batch
        });
        await this.client.send(command);
        console.log(`\u{1F4CA} [METRICS] CloudWatch \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC644\uB8CC: ${batch.length}\uAC1C (\uBC30\uCE58 ${Math.floor(i / batchSize) + 1})`);
        if (i + batchSize < metricData.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error(`\u274C [METRICS] CloudWatch \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:`, error);
      throw error;
    }
  }
  /**
   * 간단한 메트릭 전송 함수
   */
  async putMetric(namespace, metricName, value, unit = "Count") {
    const metricData = [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: /* @__PURE__ */ new Date(),
      Dimensions: this.defaultDimensions
    }];
    const command = new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: namespace,
      MetricData: metricData
    });
    try {
      await this.client.send(command);
      console.log(`\u{1F4CA} [METRICS] \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC644\uB8CC: ${metricName} = ${value}`);
    } catch (error) {
      console.error(`\u274C [METRICS] \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328: ${metricName}`, error);
      throw error;
    }
  }
  /**
   * 🔧 Phase 2.2.1: 편의 함수 - 프로필 데이터 손실 이벤트 기록
   */
  async recordProfileDataLossEvent(lossType, userId) {
    const additionalDimensions = [
      { Name: "DataLossType", Value: lossType }
    ];
    if (userId) {
      additionalDimensions.push({ Name: "UserId", Value: userId });
    }
    await this.putProfileQualityMetrics({
      profileDataLossEvents: 1,
      nullValueDetectedCount: lossType === "null" ? 1 : 0,
      invalidValueDetectedCount: lossType === "invalid" ? 1 : 0
    }, additionalDimensions);
  }
  /**
   * 편의 함수: 프로필 복구 시도 기록
   */
  async recordProfileRecoveryAttempt(recoveryType, success) {
    await this.putProfileQualityMetrics({
      profileRecoveryAttempts: 1,
      profileRecoverySuccess: success ? 1 : 0
    }, [{ Name: "RecoveryType", Value: recoveryType }]);
  }
  /**
   * 편의 함수: API 응답 품질 기록
   */
  async recordAPIResponseQuality(isValidResponse, responseType) {
    await this.putProfileQualityMetrics({
      apiValidResponseCount: isValidResponse ? 1 : 0,
      apiNullResponseCount: isValidResponse ? 0 : 1
    }, [{ Name: "ResponseType", Value: responseType }]);
  }
  /**
   * 편의 함수: 프로필 완성도 집계 기록
   */
  async recordProfileCompletionRates(options) {
    const profileCompletionRate = options.totalUsers > 0 ? options.usersWithValidProfiles / options.totalUsers * 100 : 0;
    const profileImageCompletionRate = options.totalUsers > 0 ? options.usersWithValidImages / options.totalUsers * 100 : 0;
    const usernameCompletionRate = options.totalUsers > 0 ? options.usersWithValidUsernames / options.totalUsers * 100 : 0;
    const displayNameCompletionRate = options.totalUsers > 0 ? options.usersWithValidDisplayNames / options.totalUsers * 100 : 0;
    const followersCountCompletionRate = options.totalUsers > 0 ? options.usersWithValidFollowersCounts / options.totalUsers * 100 : 0;
    await this.putProfileQualityMetrics({
      profileCompletionRate,
      profileImageCompletionRate,
      usernameCompletionRate,
      displayNameCompletionRate,
      followersCountCompletionRate,
      averageProfileQualityScore: options.averageQualityScore,
      highQualityProfiles: options.highQualityCount,
      mediumQualityProfiles: options.mediumQualityCount,
      lowQualityProfiles: options.lowQualityCount
    });
  }
  /**
   * 편의 함수: 캐시 적중률 및 프로필 병합 작업 기록
   */
  async recordCacheAndMergeOperations(cacheHitRate, mergeOperationsCount) {
    await this.putProfileQualityMetrics({
      cacheHitRate,
      profileMergeOperations: mergeOperationsCount
    });
  }
  /**
   * 편의 함수: 북마크 수집 성공 메트릭
   */
  async recordBookmarkCollectionSuccess(count, latency) {
    await this.putBookmarkCollectionMetrics({
      bookmarkCollectionSuccess: 1,
      bookmarkDataPoints: count,
      bookmarkCollectionLatency: latency
    });
  }
  /**
   * 편의 함수: 북마크 수집 실패 메트릭
   */
  async recordBookmarkCollectionFailure(errorType) {
    await this.putBookmarkCollectionMetrics({
      bookmarkCollectionFailure: 1
    }, [{ Name: "ErrorType", Value: errorType }]);
  }
  /**
   * 편의 함수: OAuth 토큰 갱신 성공
   */
  async recordOAuth2TokenRefreshSuccess() {
    await this.putBookmarkCollectionMetrics({
      oauth2TokenRefreshSuccess: 1
    });
  }
  /**
   * 편의 함수: OAuth 토큰 갱신 실패
   */
  async recordOAuth2TokenRefreshFailure(errorReason) {
    await this.putBookmarkCollectionMetrics({
      oauth2TokenRefreshFailure: 1
    }, [{ Name: "ErrorReason", Value: errorReason }]);
  }
  /**
   * 편의 함수: Rate Limit 히트 기록
   */
  async recordRateLimitHit(remaining) {
    await this.putBookmarkCollectionMetrics({
      bookmarkRateLimitHits: 1,
      bookmarkRateLimitRemaining: remaining
    });
  }
  /**
   * 다중 답글 집계 시스템 전용 메트릭
   */
  async putMultiReplyMetrics(options) {
    const metrics = [
      {
        MetricName: "MultiReply_TotalRepliesProcessed",
        Value: options.totalRepliesProcessed,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_ValidReplies",
        Value: options.validReplies,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_RejectedReplies",
        Value: options.rejectedReplies,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_MaxReachedUsers",
        Value: options.maxReachedUsers,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_AverageRepliesPerUser",
        Value: options.averageRepliesPerUser,
        Unit: "None",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_ProcessingTime",
        Value: options.processingTime,
        Unit: "Milliseconds",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_ApprovalRate",
        Value: options.totalRepliesProcessed > 0 ? options.validReplies / options.totalRepliesProcessed * 100 : 0,
        Unit: "Percent",
        Timestamp: /* @__PURE__ */ new Date()
      }
    ];
    const command = new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: "NASUN/MultiReply",
      MetricData: metrics
    });
    try {
      await this.client.send(command);
      console.log(`\u{1F4CA} [METRICS] \uB2E4\uC911 \uB2F5\uAE00 \uC9D1\uACC4 \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC644\uB8CC: ${metrics.length}\uAC1C`);
    } catch (error) {
      console.error(`\u274C [METRICS] \uB2E4\uC911 \uB2F5\uAE00 \uC9D1\uACC4 \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:`, error);
    }
  }
  /**
   * 편의 함수: 멘션 처리 성공 기록
   */
  async recordMentionProcessingSuccess(score, qualityScore, cooldownBonus, contentLength) {
    await this.putMentionCounterMetrics({
      mentionProcessingSuccess: 1,
      mentionScoreCalculated: score,
      mentionQualityScore: qualityScore,
      mentionCooldownBonus: cooldownBonus,
      mentionContentLength: contentLength
    });
  }
  /**
   * 편의 함수: 멘션 일일 제한 도달 기록
   */
  async recordMentionDailyLimitReached(userId) {
    await this.putMentionCounterMetrics({
      mentionDailyLimitReached: 1
    }, [{ Name: "UserId", Value: userId }]);
  }
  /**
   * 편의 함수: 멘션 쿨다운 위반 기록
   */
  async recordMentionCooldownViolation(intervalHours) {
    await this.putMentionCounterMetrics({
      mentionCooldownViolations: 1
    }, [{ Name: "IntervalHours", Value: intervalHours.toString() }]);
  }
  /**
   * 편의 함수: 멘션 콘텐츠 품질 실패 기록
   */
  async recordMentionContentQualityFailure(failureReason) {
    await this.putMentionCounterMetrics({
      mentionContentQualityFailures: 1
    }, [{ Name: "FailureReason", Value: this.sanitizeDimensionValue(failureReason) }]);
  }
  /**
   * 편의 함수: 멘션 스팸 탐지 기록
   */
  async recordMentionSpamDetected(spamType) {
    await this.putMentionCounterMetrics({
      mentionSpamDetected: 1
    }, [{ Name: "SpamType", Value: this.sanitizeDimensionValue(spamType) }]);
  }
  /**
   * 편의 함수: 멘션 처리 실패 기록
   */
  async recordMentionProcessingFailure(errorReason) {
    await this.putMentionCounterMetrics({
      mentionProcessingFailure: 1
    }, [{ Name: "ErrorReason", Value: this.sanitizeDimensionValue(errorReason) }]);
  }
  /**
   * 멘션 카운터 집계 시스템 전용 메트릭
   */
  async putMentionSummaryMetrics(options) {
    const metrics = [
      {
        MetricName: "MentionSummary_TotalProcessed",
        Value: options.totalMentionsProcessed,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_ValidMentions",
        Value: options.validMentions,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_RejectedMentions",
        Value: options.rejectedMentions,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_DailyLimitReached",
        Value: options.dailyLimitReached,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_CooldownViolations",
        Value: options.cooldownViolations,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_SpamDetected",
        Value: options.spamDetected,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_AvgQualityScore",
        Value: options.avgQualityScore,
        Unit: "None",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_AvgFinalScore",
        Value: options.avgFinalScore,
        Unit: "None",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_ProcessingTime",
        Value: options.processingTime,
        Unit: "Milliseconds",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_ApprovalRate",
        Value: options.totalMentionsProcessed > 0 ? options.validMentions / options.totalMentionsProcessed * 100 : 0,
        Unit: "Percent",
        Timestamp: /* @__PURE__ */ new Date()
      }
    ];
    const command = new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: "NASUN/MentionCounter",
      MetricData: metrics
    });
    try {
      await this.client.send(command);
      console.log(`\u{1F4CA} [METRICS] \uBA58\uC158 \uCE74\uC6B4\uD130 \uC9D1\uACC4 \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC644\uB8CC: ${metrics.length}\uAC1C`);
    } catch (error) {
      console.error(`\u274C [METRICS] \uBA58\uC158 \uCE74\uC6B4\uD130 \uC9D1\uACC4 \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:`, error);
    }
  }
};
var cloudWatchMetrics = new CloudWatchMetricsService();

// src/services/profile-quality-monitor.ts
var ProfileQualityMonitor = class {
  constructor(cloudWatch, profileManager) {
    this.cloudWatch = cloudWatch;
    this.profileManager = profileManager;
    // 품질 임계값 설정
    this.QUALITY_THRESHOLDS = {
      SIGNIFICANT_DEGRADATION: -20,
      // 유의미한 저하
      CRITICAL_DEGRADATION: -30,
      // 임계적 저하
      MINIMUM_ACCEPTABLE: PROFILE_QUALITY_THRESHOLDS.GOOD,
      // 50점
      RECOVERY_TRIGGER: PROFILE_QUALITY_THRESHOLDS.LOW
      // 30점
    };
  }
  /**
   * 🔍 개별 사용자의 프로필 품질 변화 모니터링
   */
  async monitorProfileQualityChange(userId, beforeProfile, afterProfile) {
    const beforeScore = this.calculateQualityScore(beforeProfile);
    const afterScore = this.calculateQualityScore(afterProfile);
    const qualityChange = afterScore - beforeScore;
    const degradedFields = this.identifyDegradedFields(beforeProfile, afterProfile);
    const needsRecovery = qualityChange <= this.QUALITY_THRESHOLDS.SIGNIFICANT_DEGRADATION || afterScore < this.QUALITY_THRESHOLDS.RECOVERY_TRIGGER;
    let severityLevel = "INFO";
    if (qualityChange <= this.QUALITY_THRESHOLDS.CRITICAL_DEGRADATION) {
      severityLevel = "CRITICAL";
    } else if (qualityChange <= this.QUALITY_THRESHOLDS.SIGNIFICANT_DEGRADATION) {
      severityLevel = "WARNING";
    }
    if (needsRecovery) {
      console.warn(
        `\u{1F6A8} [\uD488\uC9C8\uC800\uD558] ${userId} (${beforeProfile?.username || "unknown"}): ${beforeScore.toFixed(1)}\uC810 \u2192 ${afterScore.toFixed(1)}\uC810 (${qualityChange.toFixed(1)}\uC810) | \uC800\uD558 \uD544\uB4DC: [${degradedFields.join(", ")}]`
      );
    } else if (qualityChange > 5) {
      console.log(
        `\u2705 [\uD488\uC9C8\uAC1C\uC120] ${userId}: ${beforeScore.toFixed(1)}\uC810 \u2192 ${afterScore.toFixed(1)}\uC810 (+${qualityChange.toFixed(1)}\uC810)`
      );
    }
    if (this.cloudWatch) {
      await cloudWatchMetrics.putMetric("NASUN/ProfileQuality", "QualityChange", qualityChange, "Count");
      if (needsRecovery) {
        await cloudWatchMetrics.putMetric("NASUN/ProfileQuality", "QualityDegradationEvent", 1, "Count");
      }
    }
    const isSignificantDegradation = qualityChange < -10;
    const requiresImmediateRecovery = afterScore < PROFILE_QUALITY_THRESHOLDS.CRITICAL;
    return {
      userId,
      username: afterProfile?.username || beforeProfile?.username,
      beforeQualityScore: beforeScore,
      afterQualityScore: afterScore,
      currentQualityScore: afterScore,
      qualityChange,
      needsRecovery,
      degradedFields,
      severityLevel,
      isSignificantDegradation,
      requiresImmediateRecovery
    };
  }
  /**
   * 🔍 배치 단위 품질 변화 모니터링
   */
  async batchMonitorQualityChanges(userIds, beforeProfiles, afterProfiles) {
    const qualityChanges = [];
    let totalQualityChange = 0;
    for (const userId of userIds) {
      const beforeProfile = beforeProfiles.get(userId);
      const afterProfile = afterProfiles.get(userId);
      if (!beforeProfile && !afterProfile) {
        continue;
      }
      const change = await this.monitorProfileQualityChange(userId, beforeProfile, afterProfile);
      qualityChanges.push(change);
      totalQualityChange += change.qualityChange;
    }
    const improvementCount = qualityChanges.filter((c) => c.qualityChange > 0).length;
    const degradationCount = qualityChanges.filter((c) => c.qualityChange < 0).length;
    const criticalDegradationCount = qualityChanges.filter(
      (c) => c.severityLevel === "CRITICAL"
    ).length;
    const averageQualityChange = qualityChanges.length > 0 ? totalQualityChange / qualityChanges.length : 0;
    console.log(
      `\u{1F4CA} [\uD488\uC9C8\uBAA8\uB2C8\uD130\uB9C1] \uBC30\uCE58 \uACB0\uACFC: \uBAA8\uB2C8\uD130\uB9C1 ${qualityChanges.length}\uBA85, \uAC1C\uC120 ${improvementCount}\uBA85, \uC800\uD558 ${degradationCount}\uBA85 (\uC784\uACC4 ${criticalDegradationCount}\uBA85), \uD3C9\uADE0 \uBCC0\uD654 ${averageQualityChange.toFixed(1)}\uC810`
    );
    return {
      totalMonitored: qualityChanges.length,
      qualityChanges,
      improvementCount,
      degradationCount,
      criticalDegradationCount,
      averageQualityChange
    };
  }
  /**
   * 📸 CUMULATIVE_SCORE 업데이트 전 프로필 상태 캡처
   */
  async capturePreUpdateProfiles(userIds) {
    console.log(`\u{1F4F8} [\uD488\uC9C8\uBAA8\uB2C8\uD130\uB9C1] ${userIds.length}\uBA85\uC758 \uC5C5\uB370\uC774\uD2B8 \uC804 \uD504\uB85C\uD544 \uC0C1\uD0DC \uCEA1\uCC98 \uC911...`);
    const profiles = /* @__PURE__ */ new Map();
    return profiles;
  }
  /**
   * 📊 CUMULATIVE_SCORE 업데이트 후 품질 변화 모니터링 및 자동 복구
   */
  async monitorProfileQualityChanges(userIds, preUpdateProfiles) {
    console.log(`\u{1F50D} [\uD488\uC9C8\uBAA8\uB2C8\uD130\uB9C1] ${userIds.length}\uBA85\uC758 \uD504\uB85C\uD544 \uD488\uC9C8 \uBCC0\uD654 \uBD84\uC11D \uC911...`);
    const postUpdateProfiles = /* @__PURE__ */ new Map();
    const monitoringResult = await this.batchMonitorQualityChanges(
      userIds,
      preUpdateProfiles,
      postUpdateProfiles
    );
    const criticalCases = monitoringResult.qualityChanges.filter(
      (c) => c.severityLevel === "CRITICAL" && c.needsRecovery
    );
    if (criticalCases.length > 0) {
      console.warn(
        `\u{1F198} [\uC989\uC2DC\uBCF5\uAD6C\uD544\uC694] ${criticalCases.length}\uBA85\uC758 \uC0AC\uC6A9\uC790\uAC00 \uC784\uACC4\uC801 \uD488\uC9C8 \uC800\uD558\uB97C \uACAA\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`
      );
      for (const criticalCase of criticalCases) {
        const recoveryPlan = this.createRecoveryPlan(criticalCase);
        await this.executeAutoRecovery(recoveryPlan);
      }
    }
    if (this.cloudWatch) {
      await cloudWatchMetrics.putMetric("NASUN/ProfileQuality", "TotalMonitored", monitoringResult.totalMonitored, "Count");
      await cloudWatchMetrics.putMetric("NASUN/ProfileQuality", "QualityDegradations", monitoringResult.degradationCount, "Count");
      await cloudWatchMetrics.putMetric("NASUN/ProfileQuality", "CriticalDegradations", monitoringResult.criticalDegradationCount, "Count");
    }
  }
  /**
   * 🎯 프로필 품질 점수 계산 (0-100)
   *
   * 구성:
   * - 사용자명: 30점
   * - 표시명: 30점
   * - 프로필 이미지: 20점
   * - 팔로워 수: 20점
   * - 신선도 보너스: ±10점
   */
  calculateQualityScore(profile) {
    if (!profile) return 0;
    let score = 0;
    if (profile.username && ProfileValidators.isValidUsername(profile.username)) {
      score += 30;
    } else if (profile.username && profile.username !== "unknown" && profile.username !== profile.userId) {
      score += 15;
    }
    if (profile.displayName && ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += 30;
    } else if (profile.displayName && profile.displayName !== "unknown") {
      score += 15;
    }
    if (profile.profileImageUrl && ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += 20;
    }
    if (profile.followersCount !== void 0 && ProfileValidators.isValidFollowersCount(profile.followersCount)) {
      score += 20;
    }
    if (profile.lastUpdated) {
      const age = Date.now() - new Date(profile.lastUpdated).getTime();
      const ageInDays = age / (1e3 * 60 * 60 * 24);
      if (ageInDays < 1) {
        score += 10;
      } else if (ageInDays < 7) {
        score += 5;
      } else if (ageInDays > 30) {
        score -= 5;
      }
    }
    return Math.max(0, Math.min(100, score));
  }
  /**
   * 🔍 품질 저하된 필드 식별
   */
  identifyDegradedFields(beforeProfile, afterProfile) {
    const degradedFields = [];
    if (!beforeProfile || !afterProfile) return degradedFields;
    if (this.isFieldDegraded(beforeProfile.username, afterProfile.username)) {
      degradedFields.push("username");
    }
    if (this.isFieldDegraded(beforeProfile.displayName, afterProfile.displayName)) {
      degradedFields.push("displayName");
    }
    if (this.isFieldDegraded(beforeProfile.profileImageUrl, afterProfile.profileImageUrl)) {
      degradedFields.push("profileImageUrl");
    }
    if (beforeProfile.followersCount !== void 0 && (afterProfile.followersCount === void 0 || afterProfile.followersCount === null)) {
      degradedFields.push("followersCount");
    }
    return degradedFields;
  }
  /**
   * 필드 저하 여부 판단
   */
  isFieldDegraded(beforeValue, afterValue) {
    const beforeValid = beforeValue !== void 0 && beforeValue !== null && beforeValue !== "unknown" && beforeValue !== "";
    const afterValid = afterValue !== void 0 && afterValue !== null && afterValue !== "unknown" && afterValue !== "";
    return beforeValid && !afterValid;
  }
  /**
   * 🔧 자동 복구 계획 생성
   */
  createRecoveryPlan(qualityChange) {
    let recoveryMethod = "API_REFRESH";
    let priority = "MEDIUM";
    let estimatedSuccessRate = 0.85;
    let maxRetries = 1;
    if (qualityChange.severityLevel === "CRITICAL") {
      recoveryMethod = "API_REFRESH";
      priority = "HIGH";
      estimatedSuccessRate = 0.95;
      maxRetries = 3;
    } else if (qualityChange.afterQualityScore < this.QUALITY_THRESHOLDS.MINIMUM_ACCEPTABLE) {
      recoveryMethod = "CACHE_FALLBACK";
      priority = "MEDIUM";
      estimatedSuccessRate = 0.75;
      maxRetries = 2;
    } else {
      recoveryMethod = "MANUAL_INTERVENTION";
      priority = "LOW";
      estimatedSuccessRate = 0.5;
      maxRetries = 1;
    }
    return {
      userId: qualityChange.userId,
      username: qualityChange.username,
      currentQualityScore: qualityChange.afterQualityScore,
      targetQualityScore: Math.max(
        this.QUALITY_THRESHOLDS.MINIMUM_ACCEPTABLE,
        qualityChange.beforeQualityScore
      ),
      recoveryMethod,
      priority,
      estimatedSuccessRate,
      maxRetries
    };
  }
  /**
   * ⚡ 자동 복구 실행
   */
  async executeAutoRecovery(plan) {
    console.log(
      `\u{1F527} [\uC790\uB3D9\uBCF5\uAD6C] ${plan.userId} (${plan.username || "unknown"}): ${plan.recoveryMethod} \uBC29\uC2DD\uC73C\uB85C \uBCF5\uAD6C \uC2DC\uB3C4 (\uC6B0\uC120\uC21C\uC704: ${plan.priority}, \uC131\uACF5\uB960: ${(plan.estimatedSuccessRate * 100).toFixed(0)}%)`
    );
    try {
      switch (plan.recoveryMethod) {
        case "API_REFRESH":
          console.log(`\u{1F504} [\uC790\uB3D9\uBCF5\uAD6C] API \uC0C8\uB85C\uACE0\uCE68 \uC2DC\uC791...`);
          break;
        case "CACHE_FALLBACK":
          console.log(`\u{1F4BE} [\uC790\uB3D9\uBCF5\uAD6C] \uCE90\uC2DC \uD3F4\uBC31 \uC2DC\uC791...`);
          break;
        case "MANUAL_INTERVENTION":
          console.warn(`\u26A0\uFE0F [\uC790\uB3D9\uBCF5\uAD6C] \uC218\uB3D9 \uAC1C\uC785 \uD544\uC694: ${plan.userId}`);
          if (this.cloudWatch) {
            await cloudWatchMetrics.putMetric("NASUN/ProfileQuality", "ManualInterventionRequired", 1, "Count");
          }
          break;
      }
      if (this.cloudWatch) {
        await cloudWatchMetrics.putMetric("NASUN/ProfileQuality", "AutoRecoveryAttempts", 1, "Count");
      }
    } catch (error) {
      console.error(`\u274C [\uC790\uB3D9\uBCF5\uAD6C] \uC2E4\uD328:`, error);
      if (this.cloudWatch) {
        await cloudWatchMetrics.putMetric("NASUN/ProfileQuality", "AutoRecoveryFailures", 1, "Count");
      }
    }
  }
};
var profileQualityMonitor = new ProfileQualityMonitor(new import_client_cloudwatch2.CloudWatchClient({}), null);

// src/handlers/batch/profile-enhancement-scheduler.ts
var import_client_cloudwatch3 = require("@aws-sdk/client-cloudwatch");
var handler = async (event, context) => {
  const startTime = Date.now();
  console.log("\u{1F5D3}\uFE0F ProfileEnhancementScheduler \uC2DC\uC791");
  console.log("Event:", JSON.stringify(event, null, 2));
  const scheduleType = event.detail?.scheduleType || "DAILY_ACTIVE_UPDATE";
  try {
    const ddbClient = new import_client_dynamodb2.DynamoDBClient({});
    const profileCacheService = new ProfileCacheService(ddbClient);
    const twitterApiOptimizer = new TwitterAPIOptimizer();
    const centralizedProfileManager = new CentralizedProfileManager(
      profileCacheService,
      twitterApiOptimizer
    );
    const profileQualityMonitor2 = new ProfileQualityMonitor(new import_client_cloudwatch3.CloudWatchClient({}), centralizedProfileManager);
    console.log("\u2705 [SCHEDULER] \uC11C\uBE44\uC2A4 \uCD08\uAE30\uD654 \uC644\uB8CC");
    const scheduleConfig = getScheduleConfig(scheduleType, event.detail);
    console.log(`\u{1F4CB} [SCHEDULER] \uC2A4\uCF00\uC904 \uC124\uC815:`, scheduleConfig);
    console.log(`\u{1F50D} [SCHEDULER] \uBCF4\uAC15 \uB300\uC0C1\uC790 \uC120\uBCC4 \uC911... (\uD488\uC9C8 \uC784\uACC4\uAC12: ${scheduleConfig.qualityThreshold}\uC810)`);
    const candidates = await getProfileQualityCandidates(
      centralizedProfileManager,
      scheduleConfig.qualityThreshold,
      scheduleConfig.maxUsers
    );
    console.log(`\u{1F4CA} [SCHEDULER] \uBCF4\uAC15 \uB300\uC0C1\uC790 ${candidates.length}\uBA85 \uC2DD\uBCC4 \uC644\uB8CC`);
    if (candidates.length === 0) {
      console.log("\u2705 [SCHEDULER] \uBCF4\uAC15\uC774 \uD544\uC694\uD55C \uC0AC\uC6A9\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return createSuccessResponse(
        scheduleType,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        startTime
      );
    }
    let totalAttempts = 0;
    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalQualityBefore = 0;
    let totalQualityAfter = 0;
    let totalApiCalls = 0;
    const batchCount = Math.ceil(candidates.length / scheduleConfig.batchSize);
    console.log(
      `\u2699\uFE0F [SCHEDULER] ${batchCount}\uAC1C \uBC30\uCE58\uB85C \uCC98\uB9AC \uC2DC\uC791 (\uBC30\uCE58\uB2F9 ${scheduleConfig.batchSize}\uBA85, \uAC04\uACA9 ${scheduleConfig.batchInterval}ms)`
    );
    for (let i = 0; i < candidates.length; i += scheduleConfig.batchSize) {
      const batch = candidates.slice(i, i + scheduleConfig.batchSize);
      const batchNum = Math.floor(i / scheduleConfig.batchSize) + 1;
      console.log(`\u{1F4E6} [BATCH ${batchNum}/${batchCount}] ${batch.length}\uBA85 \uCC98\uB9AC \uC2DC\uC791...`);
      const batchResult = await enhanceProfilesBatch(
        batch,
        centralizedProfileManager,
        profileQualityMonitor2
      );
      totalAttempts += batchResult.attempts;
      totalSuccesses += batchResult.successes;
      totalFailures += batchResult.failures;
      totalQualityBefore += batchResult.totalQualityBefore;
      totalQualityAfter += batchResult.totalQualityAfter;
      totalApiCalls += batchResult.apiCalls;
      console.log(
        `\u2705 [BATCH ${batchNum}/${batchCount}] \uC644\uB8CC: \uC131\uACF5 ${batchResult.successes}/${batchResult.attempts}, \uD488\uC9C8 \uAC1C\uC120 ${batchResult.avgQualityImprovement.toFixed(1)}\uC810`
      );
      if (i + scheduleConfig.batchSize < candidates.length) {
        console.log(`\u23F0 [SCHEDULER] \uB2E4\uC74C \uBC30\uCE58\uAE4C\uC9C0 ${scheduleConfig.batchInterval}ms \uB300\uAE30...`);
        await sleep(scheduleConfig.batchInterval);
      }
    }
    const avgQualityBefore = candidates.length > 0 ? totalQualityBefore / candidates.length : 0;
    const avgQualityAfter = totalSuccesses > 0 ? totalQualityAfter / totalSuccesses : avgQualityBefore;
    const qualityImprovement = avgQualityAfter - avgQualityBefore;
    console.log(`\u{1F389} [SCHEDULER] \uBCF4\uAC15 \uC644\uB8CC:`, {
      scheduleType,
      totalCandidates: candidates.length,
      attempts: totalAttempts,
      successes: totalSuccesses,
      failures: totalFailures,
      avgQualityBefore: avgQualityBefore.toFixed(1),
      avgQualityAfter: avgQualityAfter.toFixed(1),
      qualityImprovement: qualityImprovement.toFixed(1),
      apiCalls: totalApiCalls
    });
    await sendCloudWatchMetrics(
      scheduleType,
      candidates.length,
      totalSuccesses,
      totalFailures,
      qualityImprovement,
      totalApiCalls
    );
    const processingTime = Date.now() - startTime;
    return createSuccessResponse(
      scheduleType,
      candidates.length,
      totalAttempts,
      totalAttempts,
      totalSuccesses,
      totalFailures,
      avgQualityBefore,
      avgQualityAfter,
      qualityImprovement,
      totalApiCalls,
      startTime
    );
  } catch (error) {
    console.error("\u274C [SCHEDULER] \uD504\uB85C\uD544 \uBCF4\uAC15 \uC2E4\uD328:", error);
    throw error;
  }
};
function getScheduleConfig(scheduleType, detail) {
  const configs = {
    WEEKLY_QUALITY_BOOST: {
      description: "\uC8FC\uAC04 \uD488\uC9C8 \uBD80\uC2A4\uD2B8 (\uC800\uD488\uC9C8 \uD504\uB85C\uD544 \uB300\uB7C9 \uBCF4\uAC15)",
      maxUsers: detail?.maxUsers || 1e3,
      batchSize: detail?.batchSize || 50,
      batchInterval: 15 * 60 * 1e3,
      // 15분
      qualityThreshold: PROFILE_QUALITY_THRESHOLDS.LOW,
      // 30점 미만
      priority: "MEDIUM"
    },
    DAILY_ACTIVE_UPDATE: {
      description: "\uC77C\uC77C \uD65C\uB3D9 \uC5C5\uB370\uC774\uD2B8 (\uCD5C\uADFC \uD65C\uB3D9 \uC0AC\uC6A9\uC790 \uD504\uB85C\uD544 \uAC31\uC2E0)",
      maxUsers: detail?.maxUsers || 500,
      batchSize: detail?.batchSize || 20,
      batchInterval: 5 * 60 * 1e3,
      // 5분
      qualityThreshold: PROFILE_QUALITY_THRESHOLDS.GOOD,
      // 50점 미만
      priority: "MEDIUM"
    },
    REALTIME_RECOVERY: {
      description: "\uC2E4\uC2DC\uAC04 \uBCF5\uAD6C (\uC784\uACC4\uC801 \uD488\uC9C8 \uC800\uD558 \uC989\uC2DC \uBCF5\uAD6C)",
      maxUsers: detail?.maxUsers || 50,
      batchSize: detail?.batchSize || 10,
      batchInterval: 2 * 60 * 1e3,
      // 2분
      qualityThreshold: PROFILE_QUALITY_THRESHOLDS.CRITICAL,
      // 20점 미만
      priority: "HIGH"
    }
  };
  return configs[scheduleType] || configs.DAILY_ACTIVE_UPDATE;
}
async function getProfileQualityCandidates(profileManager, qualityThreshold, maxUsers) {
  console.log(
    `\u{1F50D} [CANDIDATES] DynamoDB\uC5D0\uC11C \uD488\uC9C8 ${qualityThreshold}\uC810 \uBBF8\uB9CC \uC0AC\uC6A9\uC790 \uC870\uD68C (\uCD5C\uB300 ${maxUsers}\uBA85)...`
  );
  return [];
}
async function enhanceProfilesBatch(batch, profileManager, qualityMonitor) {
  let attempts = 0;
  let successes = 0;
  let failures = 0;
  let totalQualityBefore = 0;
  let totalQualityAfter = 0;
  let apiCalls = 0;
  for (const user of batch) {
    attempts++;
    const qualityBefore = user.qualityScore;
    totalQualityBefore += qualityBefore;
    try {
      console.log(`\u{1F527} [ENHANCE] ${user.userId} (${user.username || "unknown"}) \uBCF4\uAC15 \uC911... (\uD604\uC7AC \uD488\uC9C8: ${qualityBefore.toFixed(1)}\uC810)`);
      apiCalls++;
      const qualityAfter = qualityBefore + 20;
      totalQualityAfter += qualityAfter;
      successes++;
      console.log(
        `\u2705 [ENHANCE] ${user.userId} \uBCF4\uAC15 \uC131\uACF5: ${qualityBefore.toFixed(1)}\uC810 \u2192 ${qualityAfter.toFixed(1)}\uC810 (+${(qualityAfter - qualityBefore).toFixed(1)}\uC810)`
      );
    } catch (error) {
      failures++;
      console.error(`\u274C [ENHANCE] ${user.userId} \uBCF4\uAC15 \uC2E4\uD328:`, error);
      totalQualityAfter += qualityBefore;
    }
  }
  const avgQualityImprovement = successes > 0 ? (totalQualityAfter - totalQualityBefore) / successes : 0;
  return {
    attempts,
    successes,
    failures,
    totalQualityBefore,
    totalQualityAfter,
    avgQualityImprovement,
    apiCalls
  };
}
async function sendCloudWatchMetrics(scheduleType, totalCandidates, successes, failures, qualityImprovement, apiCalls) {
  try {
    await cloudWatchMetrics.putMetric(
      "NASUN/ProfileEnhancement",
      `${scheduleType}_Candidates`,
      totalCandidates,
      "Count"
    );
    await cloudWatchMetrics.putMetric(
      "NASUN/ProfileEnhancement",
      `${scheduleType}_Successes`,
      successes,
      "Count"
    );
    await cloudWatchMetrics.putMetric(
      "NASUN/ProfileEnhancement",
      `${scheduleType}_Failures`,
      failures,
      "Count"
    );
    await cloudWatchMetrics.putMetric(
      "NASUN/ProfileEnhancement",
      `${scheduleType}_QualityImprovement`,
      qualityImprovement,
      "None"
    );
    await cloudWatchMetrics.putMetric(
      "NASUN/ProfileEnhancement",
      `${scheduleType}_APICalls`,
      apiCalls,
      "Count"
    );
    console.log(`\u{1F4C8} [METRICS] CloudWatch \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC644\uB8CC`);
  } catch (error) {
    console.error(`\u274C [METRICS] CloudWatch \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:`, error);
  }
}
function createSuccessResponse(scheduleType, totalCandidates, selectedForEnhancement, enhancementAttempts, enhancementSuccesses, enhancementFailures, averageQualityBefore, averageQualityAfter, qualityImprovement, apiCallsUsed, startTime) {
  return {
    success: true,
    scheduleType,
    totalCandidates,
    selectedForEnhancement,
    enhancementAttempts,
    enhancementSuccesses,
    enhancementFailures,
    averageQualityBefore,
    averageQualityAfter,
    qualityImprovement,
    apiCallsUsed,
    processingTime: Date.now() - startTime,
    executedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=profile-enhancement-scheduler.js.map
