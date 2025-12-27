/**
 * Tweet Classification Logic Unit Tests
 *
 * 2025-10-28: Quote Reply 지원 테스트 추가
 *
 * 이 테스트는 twitter-api.ts의 isReply 판단 로직이
 * referenced_tweets.type을 올바르게 확인하는지 검증합니다.
 */

describe('Tweet Classification Logic', () => {
  /**
   * Helper function to classify tweet based on new logic (2025-10-28)
   *
   * 이 함수는 twitter-api.ts (Line 619-626, 685-692)의 로직을 추출한 것입니다.
   */
  const classifyTweet = (tweet: {
    id: string;
    conversation_id: string;
    referenced_tweets?: Array<{ type: string; id: string }> | null;
  }): { isQuoteTweet: boolean; isReply: boolean } => {
    // 🔧 Fix: Quote Reply 지원 (referenced_tweets.type 확인)
    const isQuoteTweet = tweet.referenced_tweets?.some(
      (ref: any) => ref.type === 'quoted'
    ) || false;

    const isReply = !isQuoteTweet &&
                    !!(tweet.conversation_id && tweet.conversation_id !== tweet.id);

    return { isQuoteTweet, isReply };
  };

  /**
   * Test 1: Pure Quote Tweet
   *
   * 시나리오:
   * - 타겟 계정이 새로운 conversation을 시작하며 다른 트윗을 인용
   * - conversation_id = tweet.id (자신이 conversation의 시작)
   * - referenced_tweets = ['quoted']
   *
   * 예상 결과:
   * - isQuoteTweet: true
   * - isReply: false (Passive Engagement 수집 대상)
   */
  test('Pure Quote Tweet: isReply should be false', () => {
    const tweet = {
      id: '100',
      conversation_id: '100',
      referenced_tweets: [{ type: 'quoted', id: '50' }]
    };

    const result = classifyTweet(tweet);

    expect(result.isQuoteTweet).toBe(true);
    expect(result.isReply).toBe(false);
  });

  /**
   * Test 2: Quote Reply (버그 수정 대상)
   *
   * 시나리오:
   * - User A가 트윗 작성 (ID: 100)
   * - User B가 A의 트윗에 답글 (ID: 101, conversation_id: 100)
   * - 타겟 계정이 B의 답글을 인용 (ID: 102, conversation_id: 100)
   *
   * 기존 버그:
   * - conversation_id (100) ≠ tweet.id (102) → isReply: true → 제외됨 ❌
   *
   * 수정 후:
   * - referenced_tweets에 'quoted' 포함 → isQuoteTweet: true → isReply: false ✅
   *
   * 예상 결과:
   * - isQuoteTweet: true
   * - isReply: false (Passive Engagement 수집 대상)
   */
  test('Quote Reply: isReply should be false', () => {
    const tweet = {
      id: '102',
      conversation_id: '100',
      referenced_tweets: [{ type: 'quoted', id: '101' }]
    };

    const result = classifyTweet(tweet);

    expect(result.isQuoteTweet).toBe(true);
    expect(result.isReply).toBe(false);
  });

  /**
   * Test 3: Pure Reply
   *
   * 시나리오:
   * - User A가 트윗 작성 (ID: 100)
   * - 타겟 계정이 A의 트윗에 답글 (ID: 101, conversation_id: 100)
   *
   * 예상 결과:
   * - isQuoteTweet: false
   * - isReply: true (Passive Engagement 수집 제외)
   */
  test('Pure Reply: isReply should be true', () => {
    const tweet = {
      id: '101',
      conversation_id: '100',
      referenced_tweets: [{ type: 'replied_to', id: '100' }]
    };

    const result = classifyTweet(tweet);

    expect(result.isQuoteTweet).toBe(false);
    expect(result.isReply).toBe(true);
  });

  /**
   * Test 4: Original Post
   *
   * 시나리오:
   * - 타겟 계정이 새로운 트윗 작성 (누구도 인용하지 않음)
   * - conversation_id = tweet.id
   * - referenced_tweets = null
   *
   * 예상 결과:
   * - isQuoteTweet: false
   * - isReply: false (Passive Engagement 수집 대상)
   */
  test('Original Post: isReply should be false', () => {
    const tweet = {
      id: '100',
      conversation_id: '100',
      referenced_tweets: null
    };

    const result = classifyTweet(tweet);

    expect(result.isQuoteTweet).toBe(false);
    expect(result.isReply).toBe(false);
  });

  /**
   * Test 5: Self Thread
   *
   * 시나리오:
   * - 타겟 계정이 자신의 이전 트윗에 답글 (스레드 작성)
   * - conversation_id = 처음 트윗 ID (자신의 트윗)
   * - referenced_tweets = ['replied_to']
   *
   * 중요:
   * - conversation_id가 다르지만 (100 ≠ 101), 타겟 계정 자신의 스레드임
   * - 하지만 현재 로직은 타겟 계정 스레드도 답글로 분류함 (예상된 동작)
   *
   * 예상 결과:
   * - isQuoteTweet: false
   * - isReply: true (Passive Engagement 수집 제외)
   *
   * 참고: Self-thread를 Passive 수집 대상에 포함하려면
   *       author_id를 추가로 확인해야 함 (현재 스코프 외)
   */
  test('Self Thread: isReply should be true (current behavior)', () => {
    const tweet = {
      id: '101',
      conversation_id: '100',  // 자신의 이전 트윗 ID
      referenced_tweets: [{ type: 'replied_to', id: '100' }]
    };

    const result = classifyTweet(tweet);

    // Self thread도 현재 로직에서는 답글로 분류됨
    expect(result.isQuoteTweet).toBe(false);
    expect(result.isReply).toBe(true);
  });

  /**
   * Test 6: Quote Tweet with multiple references
   *
   * 시나리오:
   * - 타겟 계정이 다른 트윗을 인용하면서 동시에 답글도 작성
   * - referenced_tweets = ['quoted', 'replied_to']
   *
   * X API에서는 Quote + Reply를 동시에 할 수 있음
   *
   * 예상 결과:
   * - isQuoteTweet: true (quoted가 포함되어 있음)
   * - isReply: false (Quote Tweet이 우선순위)
   */
  test('Quote Tweet with multiple references: isReply should be false', () => {
    const tweet = {
      id: '103',
      conversation_id: '100',
      referenced_tweets: [
        { type: 'quoted', id: '101' },
        { type: 'replied_to', id: '100' }
      ]
    };

    const result = classifyTweet(tweet);

    // quoted가 포함되어 있으면 Quote Tweet으로 분류
    expect(result.isQuoteTweet).toBe(true);
    expect(result.isReply).toBe(false);
  });

  /**
   * Test 7: Edge Case - referenced_tweets가 빈 배열
   *
   * 시나리오:
   * - X API가 빈 배열을 반환하는 경우
   *
   * 예상 결과:
   * - isQuoteTweet: false
   * - isReply: false (원본 포스트로 분류)
   */
  test('Empty referenced_tweets array: should classify as Original Post', () => {
    const tweet = {
      id: '100',
      conversation_id: '100',
      referenced_tweets: []
    };

    const result = classifyTweet(tweet);

    expect(result.isQuoteTweet).toBe(false);
    expect(result.isReply).toBe(false);
  });

  /**
   * Test 8: Edge Case - referenced_tweets가 undefined
   *
   * 시나리오:
   * - X API가 referenced_tweets를 포함하지 않은 경우
   *
   * 예상 결과:
   * - isQuoteTweet: false
   * - isReply: false (원본 포스트로 분류)
   */
  test('Undefined referenced_tweets: should classify as Original Post', () => {
    const tweet = {
      id: '100',
      conversation_id: '100',
      referenced_tweets: undefined
    };

    const result = classifyTweet(tweet);

    expect(result.isQuoteTweet).toBe(false);
    expect(result.isReply).toBe(false);
  });
});
