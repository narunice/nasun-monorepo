/**
 * Regression test for the MetaMask-unlink walletAddress fix.
 *
 * Drives the REAL exported handler with jose + DynamoDB mocked, then asserts
 * the UpdateExpression applied to the primary profile. The bug: metamask unlink
 * used to `REMOVE walletAddress` unconditionally, wiping the Nasun login wallet
 * for non-MetaMask-provider primaries.
 */

// ── jose: bypass JWT, return a fixed identity as the authenticated user ──
let AUTH_ID = '';
jest.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async () => ({ payload: { sub: AUTH_ID } }),
}));

// ── AWS SDK: capture commands, serve profiles from a per-test fixture ──
const sent: any[] = [];
let PROFILES: Record<string, any> = {};

function makeCmd(kind: string) {
  return class {
    input: any;
    __kind = kind;
    constructor(input: any) {
      this.input = input;
    }
  };
}

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {},
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({
      send: async (cmd: any) => {
        sent.push(cmd);
        if (cmd.__kind === 'Get') {
          return { Item: PROFILES[cmd.input.Key.identityId] };
        }
        // Update/Put/Query/Scan/Delete: acknowledge, return empty
        return {};
      },
    }),
  },
  GetCommand: makeCmd('Get'),
  UpdateCommand: makeCmd('Update'),
  QueryCommand: makeCmd('Query'),
  ScanCommand: makeCmd('Scan'),
  DeleteCommand: makeCmd('Delete'),
  PutCommand: makeCmd('Put'),
}));

process.env.COGNITO_IDENTITY_POOL_ID = 'ap-northeast-2:test-pool';
process.env.USER_PROFILES_TABLE = 'UserProfiles';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handler } = require('../index');

const PRIMARY = 'ap-northeast-2:primary';
const SEC_MM = 'ap-northeast-2:secondary-metamask';
const SEC_TW = 'ap-northeast-2:secondary-twitter';
const SEC_GG = 'ap-northeast-2:secondary-google';

// Synthetic fixtures: Nasun login wallet = 64-hex (Sui), EVM = 40-hex.
const NASUN_WALLET = '0x' + 'a'.repeat(64);
const EVM_ADDR = '0x' + 'b'.repeat(40);

function unlinkEvent(provider: string) {
  return {
    httpMethod: 'POST',
    path: '/unlink',
    headers: { Authorization: 'Bearer x', origin: 'https://nasun.io' },
    body: JSON.stringify({ primaryIdentityId: PRIMARY, provider }),
  } as any;
}

function primaryUpdateExpr(): string {
  // The first Update targeting the PRIMARY identity carries removeExpression.
  const u = sent.find(
    (c) => c.__kind === 'Update' && c.input.Key.identityId === PRIMARY,
  );
  return u?.input.UpdateExpression || '';
}

function primaryLinkedAccounts(): any {
  const u = sent.find(
    (c) => c.__kind === 'Update' && c.input.Key.identityId === PRIMARY,
  );
  return u?.input.ExpressionAttributeValues?.[':linkedAccounts'];
}

beforeEach(() => {
  sent.length = 0;
  AUTH_ID = PRIMARY;
  PROFILES = {};
});

describe('metamask unlink walletAddress guard', () => {
  test('A. Nasun Wallet primary: unlinking EVM must NOT remove top-level walletAddress', async () => {
    PROFILES[PRIMARY] = {
      identityId: PRIMARY,
      provider: 'Nasun Wallet',
      walletAddress: NASUN_WALLET,
      linkedAccounts: {
        metamask: { walletAddress: EVM_ADDR, identityId: SEC_MM },
        google: { email: 'u@x.com', identityId: SEC_GG },
      },
    };
    PROFILES[SEC_MM] = { identityId: SEC_MM, provider: 'MetaMask', linkedAccounts: {} };

    const res: any = await handler(unlinkEvent('metamask'));
    expect(res.statusCode).toBe(200);
    expect(primaryUpdateExpr()).not.toContain('REMOVE walletAddress');
    // EVM link removed, google preserved
    expect(primaryLinkedAccounts().metamask).toBeUndefined();
    expect(primaryLinkedAccounts().google).toBeDefined();
  });

  test('B. MetaMask-provider primary: unlinking EVM SHOULD remove top-level walletAddress (preserve original)', async () => {
    PROFILES[PRIMARY] = {
      identityId: PRIMARY,
      provider: 'MetaMask',
      walletAddress: EVM_ADDR, // login wallet IS the EVM
      linkedAccounts: {
        metamask: { walletAddress: EVM_ADDR, identityId: SEC_MM },
      },
    };
    PROFILES[SEC_MM] = { identityId: SEC_MM, provider: 'MetaMask', linkedAccounts: {} };

    const res: any = await handler(unlinkEvent('metamask'));
    expect(res.statusCode).toBe(200);
    expect(primaryUpdateExpr()).toContain('REMOVE walletAddress');
  });

  test('B2. MetaMask-provider primary, checksummed top-level vs lowercase link: still removes (case-insensitive)', async () => {
    PROFILES[PRIMARY] = {
      identityId: PRIMARY,
      provider: 'MetaMask',
      walletAddress: EVM_ADDR.toUpperCase().replace('0X', '0x'),
      linkedAccounts: {
        metamask: { walletAddress: EVM_ADDR, identityId: SEC_MM },
      },
    };
    PROFILES[SEC_MM] = { identityId: SEC_MM, provider: 'MetaMask', linkedAccounts: {} };

    const res: any = await handler(unlinkEvent('metamask'));
    expect(res.statusCode).toBe(200);
    expect(primaryUpdateExpr()).toContain('REMOVE walletAddress');
  });

  test('C. Google primary with Nasun wallet linked: unlinking EVM must NOT remove walletAddress', async () => {
    PROFILES[PRIMARY] = {
      identityId: PRIMARY,
      provider: 'Google',
      walletAddress: NASUN_WALLET,
      linkedAccounts: {
        metamask: { walletAddress: EVM_ADDR, identityId: SEC_MM },
      },
    };
    PROFILES[SEC_MM] = { identityId: SEC_MM, provider: 'MetaMask', linkedAccounts: {} };

    const res: any = await handler(unlinkEvent('metamask'));
    expect(res.statusCode).toBe(200);
    expect(primaryUpdateExpr()).not.toContain('REMOVE walletAddress');
  });

  test('C2. primary with no top-level walletAddress: no crash, no REMOVE', async () => {
    PROFILES[PRIMARY] = {
      identityId: PRIMARY,
      provider: 'Google',
      linkedAccounts: {
        metamask: { walletAddress: EVM_ADDR, identityId: SEC_MM },
      },
    };
    PROFILES[SEC_MM] = { identityId: SEC_MM, provider: 'MetaMask', linkedAccounts: {} };

    const res: any = await handler(unlinkEvent('metamask'));
    expect(res.statusCode).toBe(200);
    expect(primaryUpdateExpr()).not.toContain('REMOVE walletAddress');
  });
});

describe('regression: other providers unchanged', () => {
  test('D. Twitter unlink on Nasun Wallet primary: removes twitter fields, NOT walletAddress', async () => {
    PROFILES[PRIMARY] = {
      identityId: PRIMARY,
      provider: 'Nasun Wallet',
      walletAddress: NASUN_WALLET,
      twitterHandle: 'uxzzang',
      twitterId: '123',
      linkedAccounts: {
        twitter: { twitterHandle: 'uxzzang', identityId: SEC_TW },
      },
    };
    PROFILES[SEC_TW] = { identityId: SEC_TW, provider: 'Twitter', linkedAccounts: {} };

    const res: any = await handler(unlinkEvent('twitter'));
    expect(res.statusCode).toBe(200);
    const expr = primaryUpdateExpr();
    expect(expr).toContain('REMOVE twitterHandle, originalTwitterHandle, twitterId, profileImageUrl');
    expect(expr).not.toContain('REMOVE walletAddress');
  });

  test('E. Google unlink on Twitter primary: removes email', async () => {
    PROFILES[PRIMARY] = {
      identityId: PRIMARY,
      provider: 'Twitter',
      email: 'u@x.com',
      linkedAccounts: {
        google: { email: 'u@x.com', identityId: SEC_GG },
      },
    };
    PROFILES[SEC_GG] = { identityId: SEC_GG, provider: 'Google', linkedAccounts: {} };

    const res: any = await handler(unlinkEvent('google'));
    expect(res.statusCode).toBe(200);
    expect(primaryUpdateExpr()).toContain('REMOVE email');
  });
});
