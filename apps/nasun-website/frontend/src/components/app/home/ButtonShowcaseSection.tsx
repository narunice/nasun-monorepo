/**
 * ButtonShowcaseSection - 2025 NASUN Color Palette Button Showcase
 *
 * Data-driven component that displays all button variants, tags, and UI components.
 * Refactored from 1008 lines to ~200 lines using data definitions.
 */
import { SectionLayout } from "../../layout/SectionLayout";
import { Button } from "../../ui/button";
import { Tag } from "../../ui/tag";
import ButtonVariantRow from "./ButtonVariantRow";
import {
  BRAND_BUTTONS,
  STANDARD_VARIANTS,
  DISABLED_VARIANTS,
  COLOR_SWATCHES,
  FILLED_TAG_VARIANTS,
  OUTLINE_TAG_VARIANTS,
} from "./buttonShowcaseData";

// Color Swatch Component
function ColorSwatch({
  name,
  bgClass,
  hex,
  hasBorder,
}: {
  name: string;
  bgClass: string;
  hex: string;
  hasBorder?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div
        className={`w-full h-24 rounded-lg ${bgClass} ${hasBorder ? "border border-nasun-c4/30" : ""}`}
      />
      <div className="text-center">
        <p className="font-medium text-sm">{name}</p>
        <p className="text-xs text-nasun-black/60">{hex}</p>
      </div>
    </div>
  );
}

// Stats Card Component
function StatsCard({
  title,
  value,
  change,
  borderColor,
  bgColor,
  iconPath,
}: {
  title: string;
  value: string;
  change: string;
  borderColor: string;
  bgColor: string;
  iconPath: string;
}) {
  return (
    <div className={`p-6 rounded-xl border ${borderColor} ${bgColor}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-3 rounded-full ${borderColor.replace("border-", "bg-")}`}>
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
          </svg>
        </div>
        <h4 className={`text-lg font-medium ${borderColor.replace("border-", "text-")}`}>
          {title}
        </h4>
      </div>
      <p className="text-3xl font-bold text-nasun-white mb-2">{value}</p>
      <p className={`text-sm ${borderColor.replace("border-", "text-")}`}>{change}</p>
    </div>
  );
}

export default function ButtonShowcaseSection() {
  return (
    <SectionLayout className="min-h-screen">
      <div className="w-full max-w-none mx-auto space-y-12 mt-20 md:mt-24 lg:mt-28 mb-16">
        {/* Title */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">NASUN Button Showcase</h2>
          <p className="text-base text-nasun-white/70">
            2025 Color Palette - All button variants and sizes
          </p>
        </div>

        {/* Brand Buttons */}
        <div className="space-y-8">
          <h3 className="text-2xl font-semibold border-b border-nasun-c4/30 pb-2">Brand Buttons</h3>
          {BRAND_BUTTONS.map((config) => (
            <ButtonVariantRow key={`${config.name}-${config.variant}`} config={config} />
          ))}
        </div>

        {/* Standard Variants */}
        <div className="space-y-8">
          <h3 className="text-2xl font-semibold border-b border-nasun-c4/30 pb-2">
            Standard Variants
          </h3>
          {STANDARD_VARIANTS.map((config, index) => (
            <ButtonVariantRow key={`${config.name}-${config.variant}-${index}`} config={config} />
          ))}
        </div>

        {/* Disabled State */}
        <div className="space-y-8">
          <h3 className="text-2xl font-semibold border-b border-nasun-c4/30 pb-2">Disabled State</h3>
          <div className="space-y-3">
            <h4 className="text-lg font-medium">All Variants - Disabled</h4>
            <div className="flex flex-wrap gap-3 items-center">
              {DISABLED_VARIANTS.map(({ variant, label }, index) => (
                <Button key={`${variant}-${index}`} variant={variant as never} size="md" disabled>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Color Reference */}
        <div className="space-y-8">
          <h3 className="text-2xl font-semibold border-b border-nasun-c4/30 pb-2">
            Color Reference
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {COLOR_SWATCHES.map((swatch) => (
              <ColorSwatch key={`${swatch.name}-${swatch.hex}`} {...swatch} />
            ))}
          </div>
        </div>

        {/* UI Components Showcase */}
        <div className="mt-16 space-y-12">
          <h2 className="text-3xl font-bold border-b border-nasun-c4/30 pb-3">
            UI Components Showcase
          </h2>

          {/* Tags */}
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">Tags</h3>

            {/* Filled Tags */}
            <div className="space-y-2">
              <h4 className="text-lg font-medium">Filled Tags</h4>
              <div className="flex flex-wrap gap-3">
                {FILLED_TAG_VARIANTS.map(({ variant, label }, index) => (
                  <Tag key={`${variant}-${index}`} variant={variant as never}>
                    {label}
                  </Tag>
                ))}
              </div>
            </div>

            {/* Outline Tags */}
            <div className="space-y-2">
              <h4 className="text-lg font-medium">Outline Tags</h4>
              <div className="flex flex-wrap gap-3">
                {OUTLINE_TAG_VARIANTS.map(({ variant, label }, index) => (
                  <Tag key={`${variant}-${index}`} variant={variant as never}>
                    {label}
                  </Tag>
                ))}
              </div>
            </div>

            {/* Tag Sizes */}
            <div className="space-y-2">
              <h4 className="text-lg font-medium">Tag Sizes</h4>
              <div className="flex flex-wrap gap-3 items-center">
                <Tag variant="filledC1" size="sm">
                  Small
                </Tag>
                <Tag variant="filledC1" size="default">
                  Default
                </Tag>
                <Tag variant="filledC1" size="lg">
                  Large
                </Tag>
              </div>
            </div>
          </div>

          {/* Alerts */}
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">Alerts</h3>
            <div className="space-y-3">
              <div className="p-4 rounded-lg border border-nasun-c1 bg-nasun-c1/10">
                <p className="font-medium text-nasun-c1">Alert message using c1 (#f9a824)</p>
              </div>
              <div className="p-4 rounded-lg border border-nasun-c2 bg-nasun-c2/10">
                <p className="text-nasun-c2 font-medium">Alert message using c2 (#f4d35d)</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">Stats Cards</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatsCard
                title="Total Revenue"
                value="$15,231.89"
                change="+20.1% from last month"
                borderColor="border-nasun-c1"
                bgColor="bg-nasun-c1/5"
                iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
              <StatsCard
                title="Active Users"
                value="12,234"
                change="+2.3% from last week"
                borderColor="border-nasun-c2"
                bgColor="bg-nasun-c2/5"
                iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
              <StatsCard
                title="Conversion Rate"
                value="3.42%"
                change="+0.5% from yesterday"
                borderColor="border-nasun-c1"
                bgColor="bg-nasun-c1/5"
                iconPath="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </div>
          </div>

          {/* Form Elements */}
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">Form Elements</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Login Form */}
              <div className="p-6 rounded-xl border border-nasun-c1 bg-nasun-c1/5">
                <h4 className="text-xl font-semibold text-nasun-c1 mb-6">Login Form</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-nasun-white mb-2">Email</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      className="w-full px-4 py-2 rounded-lg border border-nasun-c1 focus:outline-none focus:ring-2 focus:ring-nasun-c1/50 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-nasun-white mb-2">
                      Password
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full px-4 py-2 rounded-lg border border-nasun-c1 focus:outline-none focus:ring-2 focus:ring-nasun-c1/50 bg-white"
                    />
                  </div>
                  <button className="w-full py-3 rounded-lg bg-nasun-c1 hover:bg-nasun-c1/90 text-white font-semibold transition-colors">
                    Sign In
                  </button>
                </div>
              </div>

              {/* Settings */}
              <div className="p-6 rounded-xl border border-nasun-c2 bg-nasun-c2/5">
                <h4 className="text-xl font-semibold text-nasun-c2 mb-6">Settings</h4>
                <div className="space-y-4">
                  <div>
                    <h5 className="font-semibold text-nasun-white mb-1">Notifications</h5>
                    <p className="text-sm text-nasun-white/60">Receive email notifications</p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-nasun-white mb-1">Dark Mode</h5>
                    <p className="text-sm text-nasun-white/60">Toggle dark mode theme</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">Table</h3>
            <div className="rounded-xl border border-nasun-c1 bg-black/20 overflow-hidden">
              <table className="w-full">
                <thead className="bg-nasun-c1/10 border-b border-nasun-c1">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-medium text-white">STATUS</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-white">EMAIL</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-white">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { email: "user1@example.com", amount: "$976.92" },
                    { email: "user2@example.com", amount: "$641.95" },
                    { email: "user3@example.com", amount: "$466.17" },
                  ].map((row, index, arr) => (
                    <tr
                      key={row.email}
                      className={index < arr.length - 1 ? "border-b border-nasun-c1/20" : ""}
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-normal text-nasun-c1">Success</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-nasun-white/80">{row.email}</td>
                      <td className="px-6 py-4 text-sm text-nasun-white/80">{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="mt-8 p-6 bg-nasun-c4/10 rounded-lg border border-nasun-c4/30">
          <p className="text-sm">
            💡 <strong>Tip:</strong> All colors have been carefully selected for the 2025 NASUN
            color scheme with optimal contrast and accessibility in mind.
          </p>
        </div>
      </div>
    </SectionLayout>
  );
}
