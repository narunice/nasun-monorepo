// index.cjs
const AWS = require("aws-sdk");
AWS.config.update({ region: "ap-northeast-2" });
const docClient = new AWS.DynamoDB.DocumentClient();

const TABLE = process.env.TABLE_NAME;
const MAX_COUNTS = JSON.parse(process.env.MAX_MINT_COUNTS);
const MAX_RETRIES = 5;

exports.handler = async (event) => {
  try {
    // 1) 요청 바디에서 tier 파싱 및 유효성 검사
    const { tier } = JSON.parse(event.body || "{}");
    if (!tier || !MAX_COUNTS[tier]) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Invalid or missing tier" }),
      };
    }

    // 2) ConsistentRead 로 최신 상태 반영하여 해당 티어 전체 데이터 조회
    const { Items = [] } = await docClient
      .query({
        TableName: TABLE,
        KeyConditionExpression: "tier = :t",
        ExpressionAttributeValues: { ":t": tier },
        ConsistentRead: true,
      })
      .promise();

    // 3) 아직 발행 가능(재사용 횟수 남음)한 후보 목록 필터링
    let candidates = Items.filter((item) => item.mintedCount < MAX_COUNTS[tier]);
    if (candidates.length === 0) {
      return {
        statusCode: 410,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: `${tier} images sold out` }),
      };
    }

    // 4) ConditionalUpdate + 재시도 로직
    for (let attempt = 0; attempt < MAX_RETRIES && candidates.length > 0; attempt++) {
      // 4-1) 후보 중 랜덤 선택
      const idx = Math.floor(Math.random() * candidates.length);
      const choice = candidates[idx];

      try {
        // 4-2) 조건부로 mintedCount 증가 시도
        await docClient
          .update({
            TableName: TABLE,
            Key: { tier, imageUrl: choice.imageUrl },
            UpdateExpression: "SET mintedCount = mintedCount + :inc",
            ConditionExpression: "mintedCount < :max",
            ExpressionAttributeValues: {
              ":inc": 1,
              ":max": MAX_COUNTS[tier],
            },
          })
          .promise();

        // 4-3) 성공 시 해당 URL 반환
        return {
          statusCode: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ imageUrl: choice.imageUrl }),
        };
      } catch (err) {
        // Conditional 체크 실패 시 후보에서 제거 후 재시도
        if (err.code === "ConditionalCheckFailedException") {
          candidates.splice(idx, 1);
          continue;
        }
        // 그 외 에러는 상위로
        throw err;
      }
    }

    // 5) 모든 재시도에도 실패했으면 sold-out 처리
    return {
      statusCode: 410,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: `${tier} images sold out` }),
    };
  } catch (err) {
    console.error("randomImageHandler error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};