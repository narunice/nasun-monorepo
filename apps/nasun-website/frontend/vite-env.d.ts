/// <reference types="vite/client" />

type SuiID = {
  id: string;
};

interface ImportMetaEnv {
  readonly VITE_NETWORK: string;
  readonly VITE_FILTER_STRINGS: string;
  readonly VITE_AWS_REGION: string;
  readonly VITE_COGNITO_REGION: string;
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_COGNITO_DOMAIN: string;
  readonly VITE_COGNITO_USERNAME_ATTRIBUTES: string;
  readonly VITE_COGNITO_SOCIAL_PROVIDERS: string;
  readonly VITE_COGNITO_SIGNUP_ATTRIBUTES: string;
  readonly VITE_COGNITO_MFA_CONFIGURATION: string;
  readonly VITE_COGNITO_MFA_TYPES: string;
  readonly VITE_COGNITO_PASSWORD_MIN_LENGTH: string;
  readonly VITE_COGNITO_PASSWORD_POLICY_CHARACTERS: string;
  readonly VITE_COGNITO_VERIFICATION_MECHANISMS: string;
  readonly VITE_PRICE_API_ENDPOINT: string;
  readonly VITE_BACKUP_API_ENDPOINT: string;
  readonly VITE_RANDOM_IMAGE_API_ENDPOINT: string;
  readonly VITE_WALLET_API_ENDPOINT: string;
  readonly VITE_GENSOL_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
