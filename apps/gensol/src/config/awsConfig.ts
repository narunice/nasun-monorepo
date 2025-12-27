const awsConfig = {
  aws_project_region: import.meta.env.VITE_AWS_PROJECT_REGION,
  aws_cognito_region: import.meta.env.VITE_COGNITO_REGION,
  aws_user_pools_id: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  aws_user_pools_web_client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
  oauth: {
    domain: import.meta.env.VITE_COGNITO_DOMAIN,
    scope: ["email", "openid", "profile", "aws.cognito.signin.user.admin"],
    redirectSignIn: import.meta.env.VITE_COGNITO_REDIRECT_SIGNIN,
    redirectSignOut: import.meta.env.VITE_COGNITO_REDIRECT_SIGNOUT,
    responseType: "code",
  },
  aws_cognito_username_attributes: import.meta.env.VITE_COGNITO_USERNAME_ATTRIBUTES.split(","),
  aws_cognito_social_providers: import.meta.env.VITE_COGNITO_SOCIAL_PROVIDERS.split(","),
  aws_cognito_signup_attributes: import.meta.env.VITE_COGNITO_SIGNUP_ATTRIBUTES.split(","),
  aws_cognito_mfa_configuration: import.meta.env.VITE_COGNITO_MFA_CONFIGURATION,
  aws_cognito_mfa_types: import.meta.env.VITE_COGNITO_MFA_TYPES.split(","),
  aws_cognito_password_protection_settings: {
    passwordPolicyMinLength: Number(import.meta.env.VITE_COGNITO_PASSWORD_MIN_LENGTH),
    passwordPolicyCharacters: import.meta.env.VITE_COGNITO_PASSWORD_POLICY_CHARACTERS.split(","),
  },
  aws_cognito_verification_mechanisms: import.meta.env.VITE_COGNITO_VERIFICATION_MECHANISMS.split(
    ","
  ),
}

export default awsConfig
