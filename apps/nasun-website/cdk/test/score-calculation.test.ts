import { LeaderboardServiceV2 } from '../lambda-src/x-leaderboard/src/services/leaderboard-service';
import { EnvConfigV2 } from '../lambda-src/x-leaderboard/src/utils/env';

// 생성자에서 발생하는 오류를 피하기 위해 최소한의 config 속성을 가진 mock 객체를 생성합니다.
const mockDDBClient: any = {
  config: {},
};

const mockConfig = {
  cumulativeTableName: 'mock-table',
} as EnvConfigV2;

describe('Score Calculation Logic (getScoreByEngagementType)', () => {
  let service: LeaderboardServiceV2;

  beforeAll(() => {
    service = new LeaderboardServiceV2(mockDDBClient, mockConfig);
  });

  // private 메서드에 접근하기 위한 헬퍼 함수
  const getScore = (engagementType: string): number => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return service['getScoreByEngagementType'](engagementType);
  };

  // 각 인게이지먼트 타입에 대한 테스트 케이스 (복수형)
  test('should return 0.8 for "likes"', () => {
    expect(getScore('likes')).toBe(0.8);
  });

  test('should return 2.2 for "replies"', () => {
    expect(getScore('replies')).toBe(2.2);
  });

  test('should return 2.0 for "reposts"', () => {
    expect(getScore('reposts')).toBe(2.0);
  });

  test('should return 3.0 for "quotes"', () => {
    expect(getScore('quotes')).toBe(3.0);
  });

  test('should return 2.3 for "mentions"', () => {
    expect(getScore('mentions')).toBe(2.3);
  });

  // 호환성을 위한 단수형 테스트 케이스
  test('should return 0.8 for "like"', () => {
    expect(getScore('like')).toBe(0.8);
  });

  test('should return 2.2 for "reply"', () => {
    expect(getScore('reply')).toBe(2.2);
  });

  test('should return 2.0 for "repost"', () => {
    expect(getScore('repost')).toBe(2.0);
  });

  test('should return 3.0 for "quote"', () => {
    expect(getScore('quote')).toBe(3.0);
  });

  test('should return 2.3 for "mention"', () => {
    expect(getScore('mention')).toBe(2.3);
  });

  // 보너스 점수 테스트 케이스
  test('should return 6.0 for "target_retweet"', () => {
    expect(getScore('target_retweet')).toBe(6.0);
  });

  test('should return 4.0 for "target_bookmark"', () => {
    expect(getScore('target_bookmark')).toBe(4.0);
  });

  // 잘못된 인게이지먼트 타입 테스트 케이스
  test('should return 0 for an unknown engagement type', () => {
    expect(getScore('invalid_type')).toBe(0);
  });

  // 빈 문자열 테스트 케이스
  test('should return 0 for an empty string', () => {
    expect(getScore('')).toBe(0);
  });
});
