// loadData.js
// 민팅에 사용할 이미지 url들(/src/assets/data/nftImages.json)을 dynamoDB 테이블에 일괄적으로 입력하는 코드.

const AWS = require("aws-sdk");
AWS.config.update({ region: "ap-northeast-2" });
const docClient = new AWS.DynamoDB.DocumentClient();
const data = require("./nftImages.json");

async function seed() {
  for (const tier in data) {
    for (const imageUrl of data[tier]) {
      const params = {
        TableName: "NftImages",
        Item: { tier, imageUrl, mintedCount: 0 },
      };
      await docClient.put(params).promise();
      console.log(`Inserted ${tier} → ${imageUrl}`);
    }
  }
  console.log("Seeding complete.");
}

seed().catch(console.error);
