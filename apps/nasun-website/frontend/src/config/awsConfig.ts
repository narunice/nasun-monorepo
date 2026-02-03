import { ResourcesConfig } from '@aws-amplify/core';

// Identity Pool only — User Pool is not used.
// Auth is handled via @aws-sdk/client-cognito-identity (Google)
// and custom backend APIs (Twitter, MetaMask).
const awsConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      identityPoolId: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID as string,
      allowGuestAccess: true,
    }
  }
};

export default awsConfig;
