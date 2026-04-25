/**
 * Shared WAF Stack
 *
 * Single REGIONAL WebACL shared across all nasun-website API Gateway stages.
 * Each API gets its own per-IP rate limit rule scoped by the execute-api hostname
 * (matched via the Host header), so limits can be tuned per endpoint without
 * paying the $5/month base cost for multiple WebACLs.
 *
 * Global rules (IP reputation, known bad inputs) apply to all attached resources.
 *
 * Consumers import the WebACL ARN via CfnOutput / cross-stack reference and
 * create a CfnWebACLAssociation pointing at their API Gateway stage ARN.
 */

import * as cdk from "aws-cdk-lib";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

export interface ApiRateLimitConfig {
  /** API Gateway REST API ID (used to scope the rate rule via Host header) */
  apiId: string;
  /** Short identifier used in CloudWatch metric names and rule names */
  name: string;
  /** Per-IP request limit over a 5-minute window */
  limit: number;
}

/**
 * Per-API rate limits (requests per 5 min per IP).
 * Tuned for each endpoint's expected traffic profile.
 *
 * API IDs are pinned to the current production account (466841130170).
 * When re-deploying to a new account, these will need to be re-mapped or
 * the scope-down switched to a different signal (e.g. tag, custom domain).
 */
// NOTE: Pre-gostop-launch (2026-04-27) limits are doubled from the planned
// baseline to leave a false-positive buffer during initial rollout.
// After launch + 24h observation, tune down to targets:
//   Twitter 30, BugReport 60, auth/airdrop/referral 60, NftEvent 100,
//   GenesisPass 300, LeaderboardV3 600.
//
// NOTE 2: AWS WAF default quota for rate-based statements per WebACL is 10.
// Ecosystem API is intentionally excluded from rate-limit rules (it still
// receives global IP-reputation + known-bad-inputs protection via the
// WebACLAssociation). If an 11th rate rule is needed later, request a quota
// increase or split into a second WebACL ($5/mo additional).
export const API_RATE_LIMITS: ApiRateLimitConfig[] = [
  { apiId: "br30jspm8j", name: "TwitterAuth", limit: 60 },
  { apiId: "p2du2vo5uf", name: "BugReport", limit: 120 },
  { apiId: "gtzq164xhb", name: "MetaMaskAuth", limit: 120 },
  { apiId: "r0thrlqqcf", name: "ZkLoginAuth", limit: 120 },
  { apiId: "r45cfshhkf", name: "SuiAuth", limit: 120 },
  { apiId: "2b5cjqtnci", name: "Airdrop", limit: 120 },
  { apiId: "9snrweav74", name: "Referral", limit: 120 },
  { apiId: "jrrge0lqtk", name: "NftEvent", limit: 200 },
  { apiId: "hntjvkuyvk", name: "GenesisPass", limit: 600 },
  { apiId: "auzo707xql", name: "LeaderboardV3", limit: 1200 },
];

export class SharedWafStack extends cdk.Stack {
  public readonly webAcl: wafv2.CfnWebACL;
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Rule priority allocation:
    //   1-2     : global managed rules (IP reputation, known bad inputs)
    //   10-99   : per-API rate limit rules
    const rateRules: wafv2.CfnWebACL.RuleProperty[] = API_RATE_LIMITS.map(
      (cfg, idx) => ({
        name: `RateLimit-${cfg.name}`,
        priority: 10 + idx,
        action: { block: {} },
        statement: {
          rateBasedStatement: {
            limit: cfg.limit,
            aggregateKeyType: "IP",
            // Scope-down: only count requests targeting this API's hostname,
            // and exclude CORS preflight (OPTIONS). Preflights are unauthenticated
            // browser-issued probes; counting them inflates the rate against
            // legitimate users (e.g. admin pages that fire many parallel queries),
            // which surfaced as blocked OPTIONS on /admin/creator-posts.
            scopeDownStatement: {
              andStatement: {
                statements: [
                  {
                    byteMatchStatement: {
                      fieldToMatch: { singleHeader: { name: "host" } },
                      positionalConstraint: "STARTS_WITH",
                      searchString: `${cfg.apiId}.execute-api`,
                      textTransformations: [{ priority: 0, type: "LOWERCASE" }],
                    },
                  },
                  {
                    notStatement: {
                      statement: {
                        byteMatchStatement: {
                          fieldToMatch: { method: {} },
                          positionalConstraint: "EXACTLY",
                          searchString: "OPTIONS",
                          textTransformations: [{ priority: 0, type: "NONE" }],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: `RateLimit-${cfg.name}`,
        },
      })
    );

    const globalRules: wafv2.CfnWebACL.RuleProperty[] = [
      {
        name: "AWSManagedIPReputation",
        priority: 1,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesAmazonIpReputationList",
          },
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "IPReputation",
        },
      },
      {
        name: "AWSManagedKnownBadInputs",
        priority: 2,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesKnownBadInputsRuleSet",
          },
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "KnownBadInputs",
        },
      },
    ];

    this.webAcl = new wafv2.CfnWebACL(this, "NasunSharedWaf", {
      name: "nasun-shared-waf",
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: "nasun-shared-waf",
      },
      rules: [...globalRules, ...rateRules],
    });

    this.webAclArn = this.webAcl.attrArn;

    new cdk.CfnOutput(this, "WebAclArn", {
      value: this.webAclArn,
      exportName: "NasunSharedWafArn",
      description: "ARN of the shared WAF WebACL for all nasun-website APIs",
    });
  }
}
