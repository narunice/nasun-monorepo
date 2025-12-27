/**
 * 이상 패턴 자동 감지 서비스
 * 
 * 실시간으로 데이터를 분석하여 의심스러운 패턴을 감지하고
 * 자동으로 알림을 발송하는 서비스입니다.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const snsClient = new SNSClient({});
const cloudWatchClient = new CloudWatchClient({});

/**
 * 이상 패턴 유형 정의
 */
export enum AnomalyType {
  IDENTICAL_COUNTS = 'identical_counts',           // @mdkitchen7 유형: replies = mentions
  EXCESSIVE_ENGAGEMENT = 'excessive_engagement',   // 과도한 engagement 수
  BOT_BEHAVIOR = 'bot_behavior',                  // 봇 같은 행동 패턴
  SPAM_BURST = 'spam_burst',                      // 짧은 시간 대량 활동
  ZERO_FOLLOWERS_HIGH_SCORE = 'zero_followers_high_score', // 팔로워 0인데 높은 점수
  SUSPICIOUS_RATIO = 'suspicious_ratio',          // 의심스러운 engagement 비율
  RAPID_SCORE_INCREASE = 'rapid_score_increase',  // 급격한 점수 증가
  WEIGHT_CALCULATION_ERROR = 'weight_calculation_error', // 가중치 계산 오류
  DATA_INCONSISTENCY = 'data_inconsistency',      // 데이터 불일치
  TIMESTAMP_ANOMALY = 'timestamp_anomaly'         // 시간 관련 이상
}

/**
 * 이상 패턴 심각도
 */
export enum AnomalySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * 이상 패턴 탐지 결과
 */
export interface AnomalyDetectionResult {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  affectedUsers: string[];
  detectedAt: string;
  confidence: number; // 0-1
  metadata: { [key: string]: any };
  recommendations: string[];
  autoActions: string[]; // 자동으로 수행할 액션들
  ruleId?: string;
}

/**
 * 감지 규칙 설정
 */
export interface DetectionRule {
  id: string;
  type: AnomalyType;
  enabled: boolean;
  severity: AnomalySeverity;
  threshold: { [key: string]: any };
  cooldownMinutes: number; // 동일 규칙 재실행 방지 시간
  autoAlert: boolean;
  description: string;
}

/**
 * 알림 설정
 */
export interface AlertConfig {
  enabled: boolean;
  snsTopicArn?: string;
  slackWebhookUrl?: string;
  emailRecipients: string[];
  minimumSeverity: AnomalySeverity;
  rateLimitPerHour: number;
}

/**
 * 이상 패턴 자동 감지 서비스
 */
export class AnomalyDetectionService {
  private tableName: string;
  private detectionRules: DetectionRule[];
  private alertConfig: AlertConfig;
  
  constructor(tableName?: string) {
    this.tableName = tableName || process.env.CUMULATIVE_TABLE_NAME || '';
    this.detectionRules = this.initializeDetectionRules();
    this.alertConfig = this.loadAlertConfig();
  }

  /**
   * 실시간 이상 패턴 감지 실행
   */
  async detectAnomalies(targetDate?: string): Promise<AnomalyDetectionResult[]> {
    const date = targetDate || new Date().toISOString().split('T')[0];
    
    console.log('🔍 이상 패턴 자동 감지 시작:', date);
    
    const detectedAnomalies: AnomalyDetectionResult[] = [];
    
    try {
      // 1. 분석할 데이터 조회
      const recentData = await this.fetchRecentData(date);
      const cumulativeData = await this.fetchCumulativeData();
      
      console.log(`📊 분석 데이터: 최근 ${recentData.length}건, 누적 ${cumulativeData.length}건`);
      
      // 2. 각 감지 규칙 실행
      for (const rule of this.detectionRules) {
        if (!rule.enabled) continue;
        
        console.log(`🧪 규칙 실행: ${rule.id} (${rule.type})`);
        
        try {
          // 쿨다운 시간 확인
          if (await this.isInCooldown(rule.id)) {
            console.log(`   ⏱️ 쿨다운 중 (${rule.cooldownMinutes}분), 스킵`);
            continue;
          }
          
          // 규칙별 감지 로직 실행
          const anomalies = await this.executeDetectionRule(rule, recentData, cumulativeData);
          
          if (anomalies.length > 0) {
            console.log(`   🚨 ${anomalies.length}개 이상 패턴 감지`);
            detectedAnomalies.push(...anomalies);
            
            // 쿨다운 기록 업데이트
            await this.updateCooldown(rule.id);
          } else {
            console.log(`   ✅ 이상 없음`);
          }
        } catch (error) {
          console.error(`   ❌ 규칙 실행 오류: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // 3. 감지된 이상 패턴 저장
      if (detectedAnomalies.length > 0) {
        await this.saveDetectedAnomalies(detectedAnomalies);
      }
      
      // 4. 알림 발송
      await this.sendAlerts(detectedAnomalies);
      
      // 5. CloudWatch 메트릭 발행
      await this.publishMetrics(detectedAnomalies);
      
      console.log(`✅ 이상 패턴 감지 완료: ${detectedAnomalies.length}개 감지`);
      
      return detectedAnomalies;
      
    } catch (error) {
      console.error('❌ 이상 패턴 감지 실패:', error);
      throw error;
    }
  }

  /**
   * 감지 규칙 초기화
   */
  private initializeDetectionRules(): DetectionRule[] {
    return [
      // 1. @mdkitchen7 유형 동일 카운트 패턴
      {
        id: 'identical_counts_detector',
        type: AnomalyType.IDENTICAL_COUNTS,
        enabled: true,
        severity: AnomalySeverity.HIGH,
        threshold: {
          minCount: 5,           // 최소 5개 이상
          exactMatch: true,      // 정확히 일치해야 함
          engagementTypes: ['replies', 'mentions']
        },
        cooldownMinutes: 60,
        autoAlert: true,
        description: 'replies와 mentions 수가 정확히 일치하는 의심스러운 패턴'
      },
      
      // 2. 과도한 engagement 감지
      {
        id: 'excessive_engagement_detector',
        type: AnomalyType.EXCESSIVE_ENGAGEMENT,
        enabled: true,
        severity: AnomalySeverity.MEDIUM,
        threshold: {
          totalEngagement: 1000,  // 1000개 이상
          singleType: 500,        // 단일 타입 500개 이상
          timeWindow: 24          // 24시간 내
        },
        cooldownMinutes: 120,
        autoAlert: true,
        description: '비정상적으로 높은 engagement 수를 보이는 사용자'
      },
      
      // 3. 봇 행동 패턴 감지
      {
        id: 'bot_behavior_detector',
        type: AnomalyType.BOT_BEHAVIOR,
        enabled: true,
        severity: AnomalySeverity.MEDIUM,
        threshold: {
          likeRatio: 0.95,        // likes가 95% 이상
          minEngagement: 20,      // 최소 20개 engagement
          timePattern: 'uniform', // 균등한 시간 간격
          intervalSeconds: 10     // 10초 이하 간격
        },
        cooldownMinutes: 180,
        autoAlert: true,
        description: '봇과 같은 기계적 패턴을 보이는 사용자'
      },
      
      // 4. 스팸 버스트 패턴
      {
        id: 'spam_burst_detector',
        type: AnomalyType.SPAM_BURST,
        enabled: true,
        severity: AnomalySeverity.HIGH,
        threshold: {
          burstCount: 50,         // 1시간 내 50개 이상
          timeWindowMinutes: 60,  // 1시간
          normalRatio: 10         // 평소의 10배 이상
        },
        cooldownMinutes: 240,
        autoAlert: true,
        description: '짧은 시간 내 대량의 활동을 보이는 스팸 패턴'
      },
      
      // 5. 팔로워 수 대비 이상 점수
      {
        id: 'zero_followers_high_score_detector',
        type: AnomalyType.ZERO_FOLLOWERS_HIGH_SCORE,
        enabled: true,
        severity: AnomalySeverity.MEDIUM,
        threshold: {
          maxFollowers: 10,       // 10명 이하 팔로워
          minScore: 100           // 100점 이상
        },
        cooldownMinutes: 360,
        autoAlert: false,
        description: '팔로워 수가 매우 적은데 높은 점수를 받은 사용자'
      },
      
      // 6. 급격한 점수 증가
      {
        id: 'rapid_score_increase_detector',
        type: AnomalyType.RAPID_SCORE_INCREASE,
        enabled: true,
        severity: AnomalySeverity.HIGH,
        threshold: {
          increaseRatio: 5.0,     // 5배 이상 증가
          timeWindowHours: 24,    // 24시간 내
          minBaseScore: 10        // 기준 점수 10점 이상
        },
        cooldownMinutes: 120,
        autoAlert: true,
        description: '짧은 시간 내 급격한 점수 증가를 보이는 사용자'
      },
      
      // 7. 가중치 계산 오류
      {
        id: 'weight_calculation_error_detector',
        type: AnomalyType.WEIGHT_CALCULATION_ERROR,
        enabled: true,
        severity: AnomalySeverity.CRITICAL,
        threshold: {
          koreanMultiplier: 1.2,  // 한국 커뮤니티 기대값
          globalMultiplier: 1.0,  // 글로벌 커뮤니티 기대값
          tolerance: 0.05         // 5% 허용 오차
        },
        cooldownMinutes: 60,
        autoAlert: true,
        description: '커뮤니티별 가중치가 잘못 적용된 사용자'
      },
      
      // 8. 데이터 불일치
      {
        id: 'data_inconsistency_detector',
        type: AnomalyType.DATA_INCONSISTENCY,
        enabled: true,
        severity: AnomalySeverity.HIGH,
        threshold: {
          scoreVariance: 0.1,     // 10% 이상 점수 차이
          requiredFields: ['total_score', 'likes', 'replies', 'user_id']
        },
        cooldownMinutes: 180,
        autoAlert: true,
        description: '계산된 점수와 저장된 점수 간 불일치'
      }
    ];
  }

  /**
   * 개별 감지 규칙 실행
   */
  private async executeDetectionRule(
    rule: DetectionRule, 
    recentData: any[], 
    cumulativeData: any[]
  ): Promise<AnomalyDetectionResult[]> {
    
    switch (rule.type) {
      case AnomalyType.IDENTICAL_COUNTS:
        return this.detectIdenticalCounts(rule, cumulativeData);
      
      case AnomalyType.EXCESSIVE_ENGAGEMENT:
        return this.detectExcessiveEngagement(rule, cumulativeData);
      
      case AnomalyType.BOT_BEHAVIOR:
        return this.detectBotBehavior(rule, recentData);
      
      case AnomalyType.SPAM_BURST:
        return this.detectSpamBurst(rule, recentData);
      
      case AnomalyType.ZERO_FOLLOWERS_HIGH_SCORE:
        return this.detectZeroFollowersHighScore(rule, cumulativeData);
      
      case AnomalyType.RAPID_SCORE_INCREASE:
        return this.detectRapidScoreIncrease(rule, cumulativeData);
      
      case AnomalyType.WEIGHT_CALCULATION_ERROR:
        return this.detectWeightCalculationError(rule, cumulativeData);
      
      case AnomalyType.DATA_INCONSISTENCY:
        return this.detectDataInconsistency(rule, cumulativeData);
      
      default:
        return [];
    }
  }

  /**
   * @mdkitchen7 유형 동일 카운트 감지
   */
  private async detectIdenticalCounts(rule: DetectionRule, data: any[]): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];
    const { minCount, engagementTypes } = rule.threshold;
    
    data.forEach(item => {
      const replies = item.replies || 0;
      const mentions = item.mentions || 0;
      
      if (replies >= minCount && mentions >= minCount && replies === mentions) {
        anomalies.push({
          id: `identical_counts_${item.user_id}_${Date.now()}`,
          type: AnomalyType.IDENTICAL_COUNTS,
          severity: rule.severity,
          title: '동일 카운트 패턴 감지',
          description: `사용자 ${item.username || item.user_id}의 replies(${replies})와 mentions(${mentions})가 동일합니다. 이는 @mdkitchen7과 같은 데이터 분류 오류일 가능성이 높습니다.`,
          affectedUsers: [item.user_id],
          detectedAt: new Date().toISOString(),
          confidence: 0.95,
          metadata: {
            userId: item.user_id,
            username: item.username,
            replies,
            mentions,
            totalScore: item.total_score,
            communityType: item.community_type
          },
          recommendations: [
            'Delta Calculator의 engagement_type 분류 로직 점검',
            '해당 사용자의 실제 Twitter 활동 수동 확인',
            'mentions 데이터 수집 과정 검증'
          ],
          autoActions: [
            'CloudWatch 알람 발생',
            '개발팀 Slack 알림',
            '데이터 검증 태스크 자동 실행'
          ]
        });
      }
    });
    
    return anomalies;
  }

  /**
   * 과도한 engagement 감지
   */
  private async detectExcessiveEngagement(rule: DetectionRule, data: any[]): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];
    const { totalEngagement, singleType } = rule.threshold;
    
    data.forEach(item => {
      const total = (item.likes || 0) + (item.replies || 0) + (item.reposts || 0) + 
                   (item.quotes || 0) + (item.mentions || 0);
      
      const maxSingle = Math.max(
        item.likes || 0, item.replies || 0, item.reposts || 0, 
        item.quotes || 0, item.mentions || 0
      );
      
      if (total >= totalEngagement || maxSingle >= singleType) {
        anomalies.push({
          id: `excessive_engagement_${item.user_id}_${Date.now()}`,
          type: AnomalyType.EXCESSIVE_ENGAGEMENT,
          severity: rule.severity,
          title: '과도한 Engagement 감지',
          description: `사용자 ${item.username || item.user_id}의 총 engagement가 ${total}개로 비정상적으로 높습니다.`,
          affectedUsers: [item.user_id],
          detectedAt: new Date().toISOString(),
          confidence: 0.85,
          metadata: {
            userId: item.user_id,
            username: item.username,
            totalEngagement: total,
            likes: item.likes,
            replies: item.replies,
            reposts: item.reposts,
            quotes: item.quotes,
            mentions: item.mentions,
            maxSingleType: maxSingle
          },
          recommendations: [
            '봇 또는 스팸 계정 여부 확인',
            'Twitter API 수집 데이터 검증',
            '계정 제외 목록 추가 검토'
          ],
          autoActions: [
            '임시 모니터링 목록 추가',
            '상세 분석 리포트 생성'
          ]
        });
      }
    });
    
    return anomalies;
  }

  /**
   * 봇 행동 패턴 감지
   */
  private async detectBotBehavior(rule: DetectionRule, data: any[]): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];
    const { likeRatio, minEngagement } = rule.threshold;
    
    // 사용자별 engagement 패턴 분석
    const userEngagements = new Map<string, any[]>();
    
    data.forEach(item => {
      const userId = item.user_id;
      if (!userEngagements.has(userId)) {
        userEngagements.set(userId, []);
      }
      userEngagements.get(userId)!.push(item);
    });
    
    userEngagements.forEach((engagements, userId) => {
      if (engagements.length < minEngagement) return;
      
      const likeCount = engagements.filter(e => e.engagement_type === 'like').length;
      const ratio = likeCount / engagements.length;
      
      if (ratio >= likeRatio) {
        const userItem = engagements[0];
        
        anomalies.push({
          id: `bot_behavior_${userId}_${Date.now()}`,
          type: AnomalyType.BOT_BEHAVIOR,
          severity: rule.severity,
          title: '봇 행동 패턴 감지',
          description: `사용자 ${userItem.username || userId}의 활동 중 ${(ratio * 100).toFixed(1)}%가 likes로, 봇과 같은 기계적 패턴을 보입니다.`,
          affectedUsers: [userId],
          detectedAt: new Date().toISOString(),
          confidence: 0.8,
          metadata: {
            userId,
            username: userItem.username,
            totalEngagements: engagements.length,
            likeCount,
            likeRatio: ratio,
            timePattern: 'analyzed'
          },
          recommendations: [
            '계정의 실제 사용자 여부 확인',
            '자동화 도구 사용 여부 검증',
            '필요시 계정 제외 목록 추가'
          ],
          autoActions: [
            '상세 행동 패턴 분석',
            '수동 검토 대기열 추가'
          ]
        });
      }
    });
    
    return anomalies;
  }

  /**
   * 급격한 점수 증가 감지
   */
  private async detectRapidScoreIncrease(rule: DetectionRule, data: any[]): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];
    const { increaseRatio, minBaseScore } = rule.threshold;
    
    // 이전 점수와 비교 (간단화된 구현)
    for (const item of data) {
      const currentScore = item.total_score || 0;
      
      // 이전 점수 조회 (실제 구현에서는 히스토리 테이블 조회)
      const previousScore = await this.getPreviousScore(item.user_id);
      
      if (previousScore >= minBaseScore && currentScore >= previousScore * increaseRatio) {
        anomalies.push({
          id: `rapid_increase_${item.user_id}_${Date.now()}`,
          type: AnomalyType.RAPID_SCORE_INCREASE,
          severity: rule.severity,
          title: '급격한 점수 증가 감지',
          description: `사용자 ${item.username || item.user_id}의 점수가 ${previousScore}에서 ${currentScore}로 ${((currentScore/previousScore)).toFixed(1)}배 급증했습니다.`,
          affectedUsers: [item.user_id],
          detectedAt: new Date().toISOString(),
          confidence: 0.9,
          metadata: {
            userId: item.user_id,
            username: item.username,
            previousScore,
            currentScore,
            increaseRatio: currentScore / previousScore,
            increaseAmount: currentScore - previousScore
          },
          recommendations: [
            '최근 engagement 활동 상세 분석',
            'viral 컨텐츠 또는 이벤트 확인',
            '점수 계산 로직 검증'
          ],
          autoActions: [
            'engagement 히스토리 분석',
            '이상 활동 모니터링 강화'
          ]
        });
      }
    }
    
    return anomalies;
  }

  /**
   * 가중치 계산 오류 감지
   */
  private async detectWeightCalculationError(rule: DetectionRule, data: any[]): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];
    const { koreanMultiplier, globalMultiplier, tolerance } = rule.threshold;
    
    data.forEach(item => {
      const communityType = item.community_type;
      const languageMultiplier = item.language_multiplier || 1.0;
      
      let expectedMultiplier = globalMultiplier;
      if (communityType === 'korean') {
        expectedMultiplier = koreanMultiplier;
      }
      
      const error = Math.abs(languageMultiplier - expectedMultiplier) / expectedMultiplier;
      
      if (error > tolerance) {
        anomalies.push({
          id: `weight_error_${item.user_id}_${Date.now()}`,
          type: AnomalyType.WEIGHT_CALCULATION_ERROR,
          severity: rule.severity,
          title: '가중치 계산 오류 감지',
          description: `사용자 ${item.username || item.user_id} (${communityType})의 언어 가중치가 ${languageMultiplier}로 잘못 적용되었습니다. 기대값: ${expectedMultiplier}`,
          affectedUsers: [item.user_id],
          detectedAt: new Date().toISOString(),
          confidence: 1.0,
          metadata: {
            userId: item.user_id,
            username: item.username,
            communityType,
            actualMultiplier: languageMultiplier,
            expectedMultiplier,
            error: error * 100
          },
          recommendations: [
            'CumulativeScoreCalculator 가중치 로직 점검',
            '커뮤니티 분류 정확성 검증',
            '설정값 vs 하드코딩 확인'
          ],
          autoActions: [
            '즉시 개발팀 알림',
            '가중치 재계산 태스크 생성',
            '시스템 점검 모드 활성화'
          ]
        });
      }
    });
    
    return anomalies;
  }

  /**
   * 데이터 불일치 감지
   */
  private async detectDataInconsistency(rule: DetectionRule, data: any[]): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];
    const { scoreVariance, requiredFields } = rule.threshold;
    
    data.forEach(item => {
      // 필수 필드 누락 확인
      const missingFields = requiredFields.filter((field: string) => 
        item[field] === undefined || item[field] === null
      );
      
      if (missingFields.length > 0) {
        anomalies.push({
          id: `data_inconsistency_${item.user_id}_${Date.now()}`,
          type: AnomalyType.DATA_INCONSISTENCY,
          severity: rule.severity,
          title: '데이터 불일치 감지',
          description: `사용자 ${item.username || item.user_id}의 데이터에서 필수 필드가 누락되었습니다: ${missingFields.join(', ')}`,
          affectedUsers: [item.user_id],
          detectedAt: new Date().toISOString(),
          confidence: 1.0,
          metadata: {
            userId: item.user_id,
            username: item.username,
            missingFields,
            availableFields: Object.keys(item)
          },
          recommendations: [
            '데이터 수집 파이프라인 점검',
            'DynamoDB 스키마 검증',
            '데이터 마이그레이션 필요 여부 확인'
          ],
          autoActions: [
            '데이터 복구 프로세스 시작',
            '수집 파이프라인 상태 점검'
          ]
        });
      }
      
      // 점수 계산 불일치 확인 (간단화된 구현)
      const calculatedScore = this.calculateExpectedScore(item);
      const actualScore = item.total_score || 0;
      
      if (actualScore > 0) {
        const variance = Math.abs(calculatedScore - actualScore) / actualScore;
        
        if (variance > scoreVariance) {
          anomalies.push({
            id: `score_inconsistency_${item.user_id}_${Date.now()}`,
            type: AnomalyType.DATA_INCONSISTENCY,
            severity: rule.severity,
            title: '점수 계산 불일치 감지',
            description: `사용자 ${item.username || item.user_id}의 계산된 점수(${calculatedScore})와 저장된 점수(${actualScore})가 ${(variance * 100).toFixed(1)}% 차이납니다.`,
            affectedUsers: [item.user_id],
            detectedAt: new Date().toISOString(),
            confidence: 0.9,
            metadata: {
              userId: item.user_id,
              username: item.username,
              calculatedScore,
              actualScore,
              variance: variance * 100
            },
            recommendations: [
              '점수 계산 로직 재검토',
              'engagement 가중치 확인',
              '점수 재계산 실행'
            ],
            autoActions: [
              '점수 재계산 태스크 생성',
              '계산 로직 검증 실행'
            ]
          });
        }
      }
    });
    
    return anomalies;
  }

  /**
   * 최근 데이터 조회
   */
  private async fetchRecentData(date: string): Promise<any[]> {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'contains(#pk, :userPrefix) AND contains(#sk, :date)',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk'
      },
      ExpressionAttributeValues: {
        ':userPrefix': 'USER#',
        ':date': date
      },
      Limit: 1000 // 최근 1000건으로 제한
    }));
    
    return response.Items || [];
  }

  /**
   * 누적 데이터 조회
   */
  private async fetchCumulativeData(): Promise<any[]> {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'contains(#pk, :prefix)',
      ExpressionAttributeNames: {
        '#pk': 'pk'
      },
      ExpressionAttributeValues: {
        ':prefix': 'CUMULATIVE#'
      },
      Limit: 2000 // 최대 2000명으로 제한
    }));
    
    return response.Items || [];
  }

  /**
   * 쿨다운 확인
   */
  private async isInCooldown(ruleId: string): Promise<boolean> {
    const rule = this.detectionRules.find(r => r.id === ruleId);
    if (!rule) return false;
    
    try {
      const response = await dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': `ANOMALY_COOLDOWN#${ruleId}`
        },
        ScanIndexForward: false,
        Limit: 1
      }));
      
      if (response.Items && response.Items.length > 0) {
        const lastExecution = new Date(response.Items[0].executed_at);
        const cooldownEnd = new Date(lastExecution.getTime() + rule.cooldownMinutes * 60 * 1000);
        return new Date() < cooldownEnd;
      }
    } catch (error) {
      console.warn('쿨다운 확인 실패:', error);
    }
    
    return false;
  }

  /**
   * 쿨다운 업데이트
   */
  private async updateCooldown(ruleId: string): Promise<void> {
    try {
      await dynamoClient.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: `ANOMALY_COOLDOWN#${ruleId}`,
          sk: new Date().toISOString(),
          executed_at: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24시간 TTL
        }
      }));
    } catch (error) {
      console.warn('쿨다운 업데이트 실패:', error);
    }
  }

  /**
   * 감지된 이상 패턴 저장
   */
  private async saveDetectedAnomalies(anomalies: AnomalyDetectionResult[]): Promise<void> {
    for (const anomaly of anomalies) {
      try {
        await dynamoClient.send(new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: `ANOMALY#${anomaly.type}`,
            sk: anomaly.id,
            ...anomaly,
            ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30일 TTL
          }
        }));
      } catch (error) {
        console.error('이상 패턴 저장 실패:', error);
      }
    }
  }

  /**
   * 알림 발송
   */
  private async sendAlerts(anomalies: AnomalyDetectionResult[]): Promise<void> {
    if (!this.alertConfig.enabled || anomalies.length === 0) return;
    
    // 심각도 필터링
    const filteredAnomalies = anomalies.filter(anomaly => 
      this.getSeverityLevel(anomaly.severity) >= this.getSeverityLevel(this.alertConfig.minimumSeverity)
    );
    
    if (filteredAnomalies.length === 0) return;
    
    // 비율 제한 확인 (간단화된 구현)
    const recentAlertCount = await this.getRecentAlertCount();
    if (recentAlertCount >= this.alertConfig.rateLimitPerHour) {
      console.log('알림 비율 제한으로 인해 알림 발송 스킵');
      return;
    }
    
    // SNS 알림 발송
    if (this.alertConfig.snsTopicArn) {
      await this.sendSNSAlert(filteredAnomalies);
    }
    
    // Slack 알림 발송 (구현 필요시)
    if (this.alertConfig.slackWebhookUrl) {
      await this.sendSlackAlert(filteredAnomalies);
    }
    
    console.log(`📢 ${filteredAnomalies.length}개 이상 패턴 알림 발송 완료`);
  }

  /**
   * CloudWatch 메트릭 발행
   */
  private async publishMetrics(anomalies: AnomalyDetectionResult[]): Promise<void> {
    try {
      const metricData = [
        {
          MetricName: 'AnomaliesDetected',
          Value: anomalies.length,
          Unit: 'Count' as const,
          Timestamp: new Date()
        }
      ];
      
      // 심각도별 메트릭
      const severityCounts = this.countBySeverity(anomalies);
      Object.entries(severityCounts).forEach(([severity, count]) => {
        metricData.push({
          MetricName: 'AnomaliesBySeverity',
          Value: count,
          Unit: 'Count' as const,
          Timestamp: new Date()
        });
      });
      
      await cloudWatchClient.send(new PutMetricDataCommand({
        Namespace: 'NASUN/AnomalyDetection',
        MetricData: metricData
      }));
      
    } catch (error) {
      console.error('CloudWatch 메트릭 발행 실패:', error);
    }
  }

  /**
   * 헬퍼 메서드들
   */
  
  private loadAlertConfig(): AlertConfig {
    return {
      enabled: process.env.ANOMALY_ALERTS_ENABLED === 'true',
      snsTopicArn: process.env.ANOMALY_SNS_TOPIC_ARN,
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      emailRecipients: (process.env.ALERT_EMAIL_RECIPIENTS || '').split(',').filter(e => e),
      minimumSeverity: (process.env.MINIMUM_ALERT_SEVERITY as AnomalySeverity) || AnomalySeverity.MEDIUM,
      rateLimitPerHour: parseInt(process.env.ALERT_RATE_LIMIT || '10')
    };
  }
  
  private getSeverityLevel(severity: AnomalySeverity): number {
    switch (severity) {
      case AnomalySeverity.LOW: return 1;
      case AnomalySeverity.MEDIUM: return 2;
      case AnomalySeverity.HIGH: return 3;
      case AnomalySeverity.CRITICAL: return 4;
      default: return 0;
    }
  }
  
  private countBySeverity(anomalies: AnomalyDetectionResult[]): { [key: string]: number } {
    const counts: { [key: string]: number } = {};
    anomalies.forEach(anomaly => {
      counts[anomaly.severity] = (counts[anomaly.severity] || 0) + 1;
    });
    return counts;
  }
  
  private calculateExpectedScore(item: any): number {
    const weights = { like: 1, reply: 3, repost: 2, quote: 2, mention: 1 };
    const baseScore = 
      (item.likes || 0) * weights.like +
      (item.replies || 0) * weights.reply +
      (item.reposts || 0) * weights.repost +
      (item.quotes || 0) * weights.quote +
      (item.mentions || 0) * weights.mention;
    
    const languageMultiplier = item.language_multiplier || 1.0;
    const followerWeight = item.follower_weight || 1.0;
    
    return Math.round(baseScore * languageMultiplier * followerWeight);
  }
  
  private async getPreviousScore(userId: string): Promise<number> {
    // 간단화된 구현 - 실제로는 히스토리 테이블에서 조회
    return 50; // 기본값
  }
  
  private async getRecentAlertCount(): Promise<number> {
    // 간단화된 구현 - 실제로는 최근 1시간 알림 수 조회
    return 0;
  }
  
  private async sendSNSAlert(anomalies: AnomalyDetectionResult[]): Promise<void> {
    try {
      const message = this.formatAlertMessage(anomalies);
      
      await snsClient.send(new PublishCommand({
        TopicArn: this.alertConfig.snsTopicArn,
        Subject: `NASUN 이상 패턴 감지: ${anomalies.length}개`,
        Message: message
      }));
      
    } catch (error) {
      console.error('SNS 알림 발송 실패:', error);
    }
  }
  
  private async sendSlackAlert(anomalies: AnomalyDetectionResult[]): Promise<void> {
    // Slack Webhook 구현 (필요시)
    console.log('Slack 알림 발송 구현 필요');
  }
  
  private formatAlertMessage(anomalies: AnomalyDetectionResult[]): string {
    let message = `🚨 NASUN 리더보드 이상 패턴 감지\n\n`;
    message += `감지 시간: ${new Date().toISOString()}\n`;
    message += `총 ${anomalies.length}개 이상 패턴 발견\n\n`;
    
    anomalies.forEach((anomaly, index) => {
      message += `${index + 1}. ${anomaly.title}\n`;
      message += `   심각도: ${anomaly.severity.toUpperCase()}\n`;
      message += `   설명: ${anomaly.description}\n`;
      message += `   영향 사용자: ${anomaly.affectedUsers.join(', ')}\n\n`;
    });
    
    return message;
  }

  /**
   * 스팸 버스트 감지
   */
  private async detectSpamBurst(rule: any, recentData: any[]): Promise<AnomalyDetectionResult[]> {
    const results: AnomalyDetectionResult[] = [];
    
    // 최근 1시간 내 급격한 활동 증가 감지
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentActivity = recentData.filter(item => 
      new Date(item.createdAt || item.timestamp) > oneHourAgo
    );
    
    if (recentActivity.length > (rule.threshold || 50)) {
      results.push({
        id: `spam-burst-${Date.now()}`,
        type: AnomalyType.SPAM_BURST,
        ruleId: rule.id,
        title: 'Spam Burst Detected',
        description: `최근 1시간 내 ${recentActivity.length}개의 급격한 활동 증가 감지`,
        severity: AnomalySeverity.HIGH,
        detectedAt: new Date().toISOString(),
        confidence: 0.8,
        affectedUsers: recentActivity.map(item => item.userId).slice(0, 10),
        recommendations: ['사용자 검증 강화', '활동 패턴 분석'],
        autoActions: ['일시 점수 동결'],
        metadata: {
          activityCount: recentActivity.length,
          threshold: rule.threshold
        }
      });
    }
    
    return results;
  }

  /**
   * 팔로워 수 0인 사용자의 높은 점수 감지
   */
  private async detectZeroFollowersHighScore(rule: any, cumulativeData: any[]): Promise<AnomalyDetectionResult[]> {
    const results: AnomalyDetectionResult[] = [];
    
    const suspiciousUsers = cumulativeData.filter(item => 
      (item.followersCount === 0 || item.followersCount === undefined) && 
      (item.totalScore || 0) > (rule.threshold || 100)
    );
    
    if (suspiciousUsers.length > 0) {
      results.push({
        id: `zero-followers-${Date.now()}`,
        type: AnomalyType.ZERO_FOLLOWERS_HIGH_SCORE,
        ruleId: rule.id,
        title: 'Zero Followers High Score',
        description: `팔로워 수 0인 사용자 ${suspiciousUsers.length}명이 높은 점수를 기록`,
        severity: AnomalySeverity.MEDIUM,
        detectedAt: new Date().toISOString(),
        confidence: 0.7,
        affectedUsers: suspiciousUsers.map(user => user.userId || user.username).slice(0, 10),
        recommendations: ['팔로워 수 검증', '계정 진위 확인'],
        autoActions: ['점수 검토 대상 표시'],
        metadata: {
          userCount: suspiciousUsers.length,
          threshold: rule.threshold
        }
      });
    }
    
    return results;
  }
}