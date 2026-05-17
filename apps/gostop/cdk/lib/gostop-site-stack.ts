import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export interface GostopSiteStackProps extends cdk.StackProps {
  /** Apex domain, e.g. "gostop.app". */
  domainName: string;
  /** Optional subdomains (e.g. ["www"]). The apex is always wired up. */
  subdomains?: string[];
  /**
   * Base64-encoded "user:password" tokens for basic auth via CloudFront Function.
   * Omit to disable basic auth.
   */
  basicAuthTokens?: string[];
  /**
   * Optional IPv4 of the gostop-backend host. When set, creates an A record
   * `api.${domainName}` so the SPA can reach the backend over HTTPS
   * (host serves its own LE cert directly; not fronted by CloudFront).
   */
  apiBackendIp?: string;
}

/**
 * gostop.app static SPA hosting.
 *
 * Architecture:
 *   Route53 (gostop.app + www.gostop.app)
 *      -> CloudFront (TLS via ACM, OAC to S3)
 *         -> S3 private bucket (SPA assets)
 *
 * Deploy flow:
 *   1. cdk deploy this stack
 *   2. Run scripts/deploy-frontend.sh to build + sync dist + invalidate CF
 *
 * Phase 1: NO WAF (see .claude/handoffs/2026-04-24-nasun-waf-expansion.md
 * for shared WebACL strategy when backend APIs are added later).
 */
export class GostopSiteStack extends cdk.Stack {
  public readonly distribution: cloudfront.IDistribution;
  public readonly bucket: s3.IBucket;
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: GostopSiteStackProps) {
    super(scope, id, props);

    const { domainName, subdomains = ['www'], basicAuthTokens, apiBackendIp } = props;

    // ---- Hosted zone ----
    // Created here so apex + subdomains share one zone. Porkbun NS records
    // must be updated to delegate gostop.app to this zone (4 NS records
    // shown in the stack outputs after first deploy).
    const hostedZone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: domainName,
      comment: 'gostop.app — managed by gostop-cdk',
    });
    this.hostedZone = hostedZone;

    // ---- ACM certificate (us-east-1 for CloudFront) ----
    // crossRegionReferences enables creating us-east-1 cert from any region.
    const certificate = new acm.Certificate(this, 'SiteCert', {
      domainName,
      subjectAlternativeNames: subdomains.map((s) => `${s}.${domainName}`),
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ---- S3 bucket (private, OAC-only access) ----
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `gostop-site-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: false,
    });
    this.bucket = siteBucket;

    // ---- Basic auth CloudFront Function (viewer request) ----
    // Stores allowed tokens as base64("user:password") strings. CloudFront
    // Functions run at the edge before the cache, so the 401 is never cached.
    let basicAuthFunction: cloudfront.Function | undefined;
    if (basicAuthTokens && basicAuthTokens.length > 0) {
      const tokenList = basicAuthTokens.map((t) => `"${t}"`).join(', ');
      basicAuthFunction = new cloudfront.Function(this, 'BasicAuthFunction', {
        functionName: `${id}-basic-auth`,
        code: cloudfront.FunctionCode.fromInline(`
var TOKENS = [${tokenList}];
function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var auth = headers.authorization ? headers.authorization.value : '';
  if (auth.indexOf('Basic ') === 0) {
    var token = auth.slice(6);
    for (var i = 0; i < TOKENS.length; i++) {
      if (token === TOKENS[i]) { return request; }
    }
  }
  return {
    statusCode: 401,
    statusDescription: 'Unauthorized',
    headers: {
      'www-authenticate': { value: 'Basic realm="Restricted"' }
    }
  };
}
        `.trim()),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
      });
    }

    // ---- CloudFront distribution ----
    // OAC (Origin Access Control) is the modern replacement for OAI.
    // SPA fallback: 403/404 -> /index.html so client-side routing works.
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      comment: `gostop.app static SPA`,
      domainNames: [domainName, ...subdomains.map((s) => `${s}.${domainName}`)],
      certificate,
      defaultRootObject: 'index.html',
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200, // Asia + Europe + N. America (skip Aus/SA for cost)
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: basicAuthFunction
          ? [
              {
                function: basicAuthFunction,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ]
          : [],
      },
      errorResponses: [
        // SPA fallback for client-routed paths
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(1),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(1),
        },
      ],
    });
    this.distribution = distribution;

    // ---- Route53 alias records ----
    new route53.ARecord(this, 'ApexAlias', {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });
    new route53.AaaaRecord(this, 'ApexAliasAAAA', {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });
    for (const sub of subdomains) {
      new route53.ARecord(this, `${cap(sub)}Alias`, {
        zone: hostedZone,
        recordName: `${sub}.${domainName}`,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution),
        ),
      });
      new route53.AaaaRecord(this, `${cap(sub)}AliasAAAA`, {
        zone: hostedZone,
        recordName: `${sub}.${domainName}`,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution),
        ),
      });
    }

    // ---- api.${domainName} -> backend host (direct A record, not CloudFront) ----
    if (apiBackendIp) {
      new route53.ARecord(this, 'ApiBackendARecord', {
        zone: hostedZone,
        recordName: `api.${domainName}`,
        target: route53.RecordTarget.fromIpAddresses(apiBackendIp),
        ttl: cdk.Duration.minutes(5),
      });
    }

    // ---- Outputs ----
    new cdk.CfnOutput(this, 'BucketName', {
      value: siteBucket.bucketName,
      description: 'S3 bucket for SPA assets (sync dist/ here)',
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution id (use for invalidations)',
    });
    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront default domain (cert-validated)',
    });
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: hostedZone.hostedZoneId,
      description: 'Route53 hosted zone id',
    });
    new cdk.CfnOutput(this, 'HostedZoneNameServers', {
      value: cdk.Fn.join(',', hostedZone.hostedZoneNameServers ?? []),
      description: 'Update Porkbun NS records to these 4 nameservers',
    });
    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${domainName}`,
      description: 'Public site URL (after Porkbun NS delegation propagates)',
    });
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
