// PR2.A — Agent Vault stack
//
// Grants the chat-server EC2 instance role permission to PUT/GET/DELETE
// SSM Parameter Store SecureString parameters under /nasun/ai-agent/* and
// to use the AWS-managed alias/aws/ssm KMS key for encryption/decryption.
//
// The EC2 instance role is provisioned outside CDK (console / external).
// We import it via Role.fromRoleArn — CloudFormation does not validate
// principal existence at deploy time, so a missing role only fails when
// the policy is actually attached or when chat-server tries to call SSM.
//
// dev-vs-prod: instantiate this stack only when the env var
// AGENT_VAULT_CHAT_SERVER_ROLE_ARN is set. dev currently has no
// chat-server EC2.

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AgentVaultStackProps extends cdk.StackProps {
  /** ARN of the EC2 instance role that runs chat-server. */
  chatServerRoleArn: string;
  /** SSM parameter prefix. Defaults to /nasun/ai-agent. */
  parameterPrefix?: string;
}

export class AgentVaultStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AgentVaultStackProps) {
    super(scope, id, props);

    const prefix = props.parameterPrefix ?? '/nasun/ai-agent';
    const parameterArn = `arn:aws:ssm:${this.region}:${this.account}:parameter${prefix}/*`;
    const ssmKmsKeyArn = `arn:aws:kms:${this.region}:${this.account}:alias/aws/ssm`;

    const role = iam.Role.fromRoleArn(this, 'ChatServerRole', props.chatServerRoleArn, {
      mutable: true,
    });

    // SSM Parameter Store CRUD on the agent-key prefix only.
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'AgentVaultParameterCrud',
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:PutParameter',
        'ssm:GetParameter',
        'ssm:DeleteParameter',
        'ssm:AddTagsToResource',
      ],
      resources: [parameterArn],
    }));

    // KMS Decrypt on the AWS-managed SSM key. SSM enforces the parameter
    // ARN as EncryptionContext automatically, so this grant alone does not
    // permit decryption of unrelated parameters.
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'AgentVaultKmsDecrypt',
      effect: iam.Effect.ALLOW,
      actions: ['kms:Decrypt'],
      resources: [ssmKmsKeyArn],
    }));

    new cdk.CfnOutput(this, 'AgentVaultParameterPrefix', { value: prefix });
    new cdk.CfnOutput(this, 'AgentVaultParameterArn', { value: parameterArn });
  }
}
