# Lambda Factory 사용 예제

## Quick Start

```typescript
import { LambdaFactory } from '../lib/lambda-factory';

// 1. 기본 사용
const lambda = LambdaFactory.createFromRegistry(this, 'wallet-api');

// 2. 환경 변수 추가
const lambda = LambdaFactory.createFromRegistry(this, 'wallet-api', {
  environment: {
    TABLE_NAME: myTable.tableName
  }
});

// 3. Fluent API
const lambda = new LambdaBuilder(this, 'wallet-api')
  .withEnvironment({ TABLE_NAME: myTable.tableName })
  .withTimeout(cdk.Duration.minutes(5))
  .build();
```

## 사용 가능한 Lambda 목록

Registry에 등록된 모든 Lambda:
- `wallet-api`
- `get-user-profile`
- `score-calculator`
- `collect-likes`
- 등 33개 Lambda

전체 목록: `LambdaFactory.listRegistry()`
