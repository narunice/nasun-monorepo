import { ResourcesConfig } from '@aws-amplify/core';

const awsConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
      identityPoolId: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID as string,
      allowGuestAccess: true,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_OAUTH_DOMAIN as string,
          scopes: ['email', 'profile', 'openid'],
          redirectSignIn: [import.meta.env.VITE_COGNITO_OAUTH_REDIRECT_SIGN_IN as string],
          redirectSignOut: [import.meta.env.VITE_COGNITO_OAUTH_REDIRECT_SIGN_OUT as string],
          responseType: 'code', // or 'token'
        },
      }
    }
  }
};

export default awsConfig;
