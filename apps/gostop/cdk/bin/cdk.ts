#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GostopSiteStack } from '../lib/gostop-site-stack';

const app = new cdk.App();

// HARD-CODED region+account. Do NOT pull from CDK_DEFAULT_REGION because
// the nasun-prod AWS profile defaults to ap-northeast-2, which would
// silently misroute this stack. CloudFront ACM MUST be in us-east-1.
const account = '__AWS_PROD_ACCOUNT__'; // nasun-prod
const region = 'us-east-1';     // required for CloudFront ACM

new GostopSiteStack(app, 'GostopSiteStack', {
  env: { account, region },
  domainName: 'gostop.app',
  subdomains: ['www'],
  description: 'gostop.app static SPA hosting (S3 + CloudFront + Route53)',
  tags: {
    Project: 'gostop',
    ManagedBy: 'cdk',
    Environment: 'production',
  },
});
