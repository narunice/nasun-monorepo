import { SectionLayout } from "../../layout/SectionLayout";
import { Button } from "../../ui/button";
import { Tag } from "../../ui/tag";

export default function ButtonShowcaseSection() {
  return (
    <SectionLayout className="min-h-screen">
      <div className="w-full max-w-none mx-auto space-y-12 mt-20 md:mt-24 lg:mt-28 mb-16">
        {/* Title */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">NASUN Button Showcase</h2>
          <p className="text-base  text-nasun-white/70">
            2025 Color Palette - All button variants and sizes
          </p>
        </div>

        {/* Brand Buttons */}
        <div className="space-y-8">
          <h3 className="text-2xl font-semibold border-b border-nasun-c4/30 pb-2">Brand Buttons</h3>

          {/* Scarlet */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-scarlet">Scarlet</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="scarlet" size="xs">
                Extra Small
              </Button>
              <Button variant="scarlet" size="sm">
                Small
              </Button>
              <Button variant="scarlet" size="default">
                Default
              </Button>
              <Button variant="scarlet" size="md">
                Medium
              </Button>
              <Button variant="scarlet" size="lg">
                Large
              </Button>
              <Button variant="scarlet" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Amber - c1 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c1">Amber (c1)</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="c1" size="xs">
                Extra Small
              </Button>
              <Button variant="c1" size="sm">
                Small
              </Button>
              <Button variant="c1" size="default">
                Default
              </Button>
              <Button variant="c1" size="md">
                Medium
              </Button>
              <Button variant="c1" size="lg">
                Large
              </Button>
              <Button variant="c1" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Sunshine - c2 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c2">Sunshine (c2)</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="c2" size="xs">
                Extra Small
              </Button>
              <Button variant="c2" size="sm">
                Small
              </Button>
              <Button variant="c2" size="default">
                Default
              </Button>
              <Button variant="c2" size="md">
                Medium
              </Button>
              <Button variant="c2" size="lg">
                Large
              </Button>
              <Button variant="c2" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Mint - c1 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c1">Mint (c1)</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="c1" size="xs">
                Extra Small
              </Button>
              <Button variant="c1" size="sm">
                Small
              </Button>
              <Button variant="c1" size="default">
                Default
              </Button>
              <Button variant="c1" size="md">
                Medium
              </Button>
              <Button variant="c1" size="lg">
                Large
              </Button>
              <Button variant="c1" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Ocean - c4 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c4">Ocean (c4)</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="c4" size="xs">
                Extra Small
              </Button>
              <Button variant="c4" size="sm">
                Small
              </Button>
              <Button variant="c4" size="default">
                Default
              </Button>
              <Button variant="c4" size="md">
                Medium
              </Button>
              <Button variant="c4" size="lg">
                Large
              </Button>
              <Button variant="c4" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Purple - c5 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c5">Purple (c5)</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="c5" size="xs">
                Extra Small
              </Button>
              <Button variant="c5" size="sm">
                Small
              </Button>
              <Button variant="c5" size="default">
                Default
              </Button>
              <Button variant="c5" size="md">
                Medium
              </Button>
              <Button variant="c5" size="lg">
                Large
              </Button>
              <Button variant="c5" size="xl">
                Extra Large
              </Button>
            </div>
          </div>
        </div>

        {/* Standard Variants */}
        <div className="space-y-8">
          <h3 className="text-2xl font-semibold border-b border-nasun-c4/30 pb-2">
            Standard Variants
          </h3>

          {/* Default (Monochrome) */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium">Default - Monochrome</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="default" size="xs">
                Extra Small
              </Button>
              <Button variant="default" size="sm">
                Small
              </Button>
              <Button variant="default" size="default">
                Default
              </Button>
              <Button variant="default" size="md">
                Medium
              </Button>
              <Button variant="default" size="lg">
                Large
              </Button>
              <Button variant="default" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Default Reverse */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium">Default Reverse - Inverted Monochrome</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="defaultReverse" size="xs">
                Extra Small
              </Button>
              <Button variant="defaultReverse" size="sm">
                Small
              </Button>
              <Button variant="defaultReverse" size="default">
                Default
              </Button>
              <Button variant="defaultReverse" size="md">
                Medium
              </Button>
              <Button variant="defaultReverse" size="lg">
                Large
              </Button>
              <Button variant="defaultReverse" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Outline Scarlet */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-scarlet">Outline - Scarlet</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="outlineScarlet" size="xs">
                Extra Small
              </Button>
              <Button variant="outlineScarlet" size="sm">
                Small
              </Button>
              <Button variant="outlineScarlet" size="default">
                Default
              </Button>
              <Button variant="outlineScarlet" size="md">
                Medium
              </Button>
              <Button variant="outlineScarlet" size="lg">
                Large
              </Button>
              <Button variant="outlineScarlet" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Outline c1 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c1">Outline - c1</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="outlineC1" size="xs">
                Extra Small
              </Button>
              <Button variant="outlineC1" size="sm">
                Small
              </Button>
              <Button variant="outlineC1" size="default">
                Default
              </Button>
              <Button variant="outlineC1" size="md">
                Medium
              </Button>
              <Button variant="outlineC1" size="lg">
                Large
              </Button>
              <Button variant="outlineC1" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Outline c2 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c2">Outline - c2</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="outlineC2" size="xs">
                Extra Small
              </Button>
              <Button variant="outlineC2" size="sm">
                Small
              </Button>
              <Button variant="outlineC2" size="default">
                Default
              </Button>
              <Button variant="outlineC2" size="md">
                Medium
              </Button>
              <Button variant="outlineC2" size="lg">
                Large
              </Button>
              <Button variant="outlineC2" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Outline c1 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c1">Outline - c1</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="outlineC1" size="xs">
                Extra Small
              </Button>
              <Button variant="outlineC1" size="sm">
                Small
              </Button>
              <Button variant="outlineC1" size="default">
                Default
              </Button>
              <Button variant="outlineC1" size="md">
                Medium
              </Button>
              <Button variant="outlineC1" size="lg">
                Large
              </Button>
              <Button variant="outlineC1" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Outline c4 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c4">Outline - c4</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="outlineC4" size="xs">
                Extra Small
              </Button>
              <Button variant="outlineC4" size="sm">
                Small
              </Button>
              <Button variant="outlineC4" size="default">
                Default
              </Button>
              <Button variant="outlineC4" size="md">
                Medium
              </Button>
              <Button variant="outlineC4" size="lg">
                Large
              </Button>
              <Button variant="outlineC4" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Outline c5 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c5">Outline - c5</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="outlineC5" size="xs">
                Extra Small
              </Button>
              <Button variant="outlineC5" size="sm">
                Small
              </Button>
              <Button variant="outlineC5" size="default">
                Default
              </Button>
              <Button variant="outlineC5" size="md">
                Medium
              </Button>
              <Button variant="outlineC5" size="lg">
                Large
              </Button>
              <Button variant="outlineC5" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Filled Outline Scarlet */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-scarlet">Filled Outline - Scarlet</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="filledOutlineScarlet" size="xs">
                Extra Small
              </Button>
              <Button variant="filledOutlineScarlet" size="sm">
                Small
              </Button>
              <Button variant="filledOutlineScarlet" size="default">
                Default
              </Button>
              <Button variant="filledOutlineScarlet" size="md">
                Medium
              </Button>
              <Button variant="filledOutlineScarlet" size="lg">
                Large
              </Button>
              <Button variant="filledOutlineScarlet" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Filled Outline c1 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c1">Filled Outline - c1</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="filledOutlineC1" size="xs">
                Extra Small
              </Button>
              <Button variant="filledOutlineC1" size="sm">
                Small
              </Button>
              <Button variant="filledOutlineC1" size="default">
                Default
              </Button>
              <Button variant="filledOutlineC1" size="md">
                Medium
              </Button>
              <Button variant="filledOutlineC1" size="lg">
                Large
              </Button>
              <Button variant="filledOutlineC1" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Filled Outline c2 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c2">Filled Outline - c2</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="filledOutlineC2" size="xs">
                Extra Small
              </Button>
              <Button variant="filledOutlineC2" size="sm">
                Small
              </Button>
              <Button variant="filledOutlineC2" size="default">
                Default
              </Button>
              <Button variant="filledOutlineC2" size="md">
                Medium
              </Button>
              <Button variant="filledOutlineC2" size="lg">
                Large
              </Button>
              <Button variant="filledOutlineC2" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Filled Outline c1 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c1">Filled Outline - c1</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="filledOutlineC1" size="xs">
                Extra Small
              </Button>
              <Button variant="filledOutlineC1" size="sm">
                Small
              </Button>
              <Button variant="filledOutlineC1" size="default">
                Default
              </Button>
              <Button variant="filledOutlineC1" size="md">
                Medium
              </Button>
              <Button variant="filledOutlineC1" size="lg">
                Large
              </Button>
              <Button variant="filledOutlineC1" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Filled Outline c4 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c4">Filled Outline - c4</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="filledOutlineC4" size="xs">
                Extra Small
              </Button>
              <Button variant="filledOutlineC4" size="sm">
                Small
              </Button>
              <Button variant="filledOutlineC4" size="default">
                Default
              </Button>
              <Button variant="filledOutlineC4" size="md">
                Medium
              </Button>
              <Button variant="filledOutlineC4" size="lg">
                Large
              </Button>
              <Button variant="filledOutlineC4" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Filled Outline c5 */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-nasun-c5">Filled Outline - c5</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="filledOutlineC5" size="xs">
                Extra Small
              </Button>
              <Button variant="filledOutlineC5" size="sm">
                Small
              </Button>
              <Button variant="filledOutlineC5" size="default">
                Default
              </Button>
              <Button variant="filledOutlineC5" size="md">
                Medium
              </Button>
              <Button variant="filledOutlineC5" size="lg">
                Large
              </Button>
              <Button variant="filledOutlineC5" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Ghost */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium">Ghost</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="ghost" size="xs">
                Extra Small
              </Button>
              <Button variant="ghost" size="sm">
                Small
              </Button>
              <Button variant="ghost" size="default">
                Default
              </Button>
              <Button variant="ghost" size="md">
                Medium
              </Button>
              <Button variant="ghost" size="lg">
                Large
              </Button>
              <Button variant="ghost" size="xl">
                Extra Large
              </Button>
            </div>
          </div>

          {/* Link */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium">Link</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="link" size="xs">
                Read More →
              </Button>
              <Button variant="link" size="sm">
                Learn More →
              </Button>
              <Button variant="link" size="default">
                Explore →
              </Button>
              <Button variant="link" size="md">
                Discover →
              </Button>
              <Button variant="link" size="lg">
                Find Out →
              </Button>
              <Button variant="link" size="xl">
                Get Started →
              </Button>
            </div>
          </div>

          {/* Destructive */}
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-red-500">Destructive - Dangerous Actions</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="destructive" size="xs">
                Delete
              </Button>
              <Button variant="destructive" size="sm">
                Unlink
              </Button>
              <Button variant="destructive" size="default">
                Remove
              </Button>
              <Button variant="destructive" size="md">
                Withdraw
              </Button>
              <Button variant="destructive" size="lg">
                Disconnect
              </Button>
              <Button variant="destructive" size="xl">
                Terminate
              </Button>
            </div>
          </div>
        </div>

        {/* Disabled State */}
        <div className="space-y-8">
          <h3 className="text-2xl font-semibold border-b border-nasun-c4/30 pb-2">
            Disabled State
          </h3>
          <div className="space-y-3">
            <h4 className="text-lg font-medium">All Variants - Disabled</h4>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="scarlet" size="md" disabled>
                Scarlet
              </Button>
              <Button variant="c1" size="md" disabled>
                Amber
              </Button>
              <Button variant="c2" size="md" disabled>
                Sunshine
              </Button>
              <Button variant="c1" size="md" disabled>
                Mint
              </Button>
              <Button variant="c4" size="md" disabled>
                Ocean
              </Button>
              <Button variant="c5" size="md" disabled>
                Purple
              </Button>
              <Button variant="default" size="md" disabled>
                Default
              </Button>
              <Button variant="defaultReverse" size="md" disabled>
                Default Reverse
              </Button>
              <Button variant="outlineScarlet" size="md" disabled>
                Outline Scarlet
              </Button>
              <Button variant="outlineC1" size="md" disabled>
                Outline c1
              </Button>
              <Button variant="outlineC2" size="md" disabled>
                Outline c2
              </Button>
              <Button variant="outlineC1" size="md" disabled>
                Outline c1
              </Button>
              <Button variant="outlineC4" size="md" disabled>
                Outline c4
              </Button>
              <Button variant="outlineC5" size="md" disabled>
                Outline c5
              </Button>
              <Button variant="filledOutlineScarlet" size="md" disabled>
                Filled Outline Scarlet
              </Button>
              <Button variant="filledOutlineC1" size="md" disabled>
                Filled Outline c1
              </Button>
              <Button variant="filledOutlineC2" size="md" disabled>
                Filled Outline c2
              </Button>
              <Button variant="filledOutlineC1" size="md" disabled>
                Filled Outline c1
              </Button>
              <Button variant="filledOutlineC4" size="md" disabled>
                Filled Outline c4
              </Button>
              <Button variant="filledOutlineC5" size="md" disabled>
                Filled Outline c5
              </Button>
              <Button variant="ghost" size="md" disabled>
                Ghost
              </Button>
              <Button variant="link" size="md" disabled>
                Link
              </Button>
              <Button variant="destructive" size="md" disabled>
                Destructive
              </Button>
            </div>
          </div>
        </div>

        {/* Color Reference */}
        <div className="space-y-8">
          <h3 className="text-2xl font-semibold border-b border-nasun-c4/30 pb-2">
            Color Reference
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Scarlet */}
            <div className="space-y-2">
              <div className="w-full h-24 rounded-lg bg-nasun-scarlet"></div>
              <div className="text-center">
                <p className="font-medium text-sm">Scarlet</p>
                <p className="text-xs text-nasun-black/60">#fa3102</p>
              </div>
            </div>

            {/* c1 */}
            <div className="space-y-2">
              <div className="w-full h-24 rounded-lg bg-nasun-c1"></div>
              <div className="text-center">
                <p className="font-medium text-sm">c1</p>
                <p className="text-xs text-nasun-black/60">#f9a824</p>
              </div>
            </div>

            {/* c2 */}
            <div className="space-y-2">
              <div className="w-full h-24 rounded-lg bg-nasun-c2"></div>
              <div className="text-center">
                <p className="font-medium text-sm">c2</p>
                <p className="text-xs text-nasun-black/60">#f4d35d</p>
              </div>
            </div>

            {/* c1 */}
            <div className="space-y-2">
              <div className="w-full h-24 rounded-lg bg-nasun-c1"></div>
              <div className="text-center">
                <p className="font-medium text-sm">c1</p>
                <p className="text-xs text-nasun-black/60">#f9a824</p>
              </div>
            </div>

            {/* c4 */}
            <div className="space-y-2">
              <div className="w-full h-24 rounded-lg bg-nasun-c4"></div>
              <div className="text-center">
                <p className="font-medium text-sm">c4</p>
                <p className="text-xs text-nasun-black/60">#3d7ea9</p>
              </div>
            </div>

            {/* c5 */}
            <div className="space-y-2">
              <div className="w-full h-24 rounded-lg bg-nasun-c5"></div>
              <div className="text-center">
                <p className="font-medium text-sm">c5</p>
                <p className="text-xs text-nasun-black/60">#2a2c41</p>
              </div>
            </div>

            {/* White */}
            <div className="space-y-2">
              <div className="w-full h-24 rounded-lg bg-nasun-white border border-nasun-c4/30"></div>
              <div className="text-center">
                <p className="font-medium text-sm">White</p>
                <p className="text-xs text-nasun-black/60">#faf7f4</p>
              </div>
            </div>

            {/* Black */}
            <div className="space-y-2">
              <div className="w-full h-24 rounded-lg bg-nasun-black"></div>
              <div className="text-center">
                <p className="font-medium text-sm">Black</p>
                <p className="text-xs text-nasun-black/60">#191615</p>
              </div>
            </div>
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
                <Tag variant="filledScarlet">Scarlet</Tag>
                <Tag variant="filledC1">c1</Tag>
                <Tag variant="filledC2">c2</Tag>
                <Tag variant="filledC1">c1</Tag>
                <Tag variant="filledC4">c4</Tag>
                <Tag variant="filledC5">c5</Tag>
              </div>
            </div>

            {/* Outline Tags */}
            <div className="space-y-2">
              <h4 className="text-lg font-medium">Outline Tags</h4>
              <div className="flex flex-wrap gap-3">
                <Tag variant="outlineScarlet">Scarlet</Tag>
                <Tag variant="outlineC1">c1</Tag>
                <Tag variant="outlineC2">c2</Tag>
                <Tag variant="outlineC1">c1</Tag>
                <Tag variant="outlineC4">c4</Tag>
                <Tag variant="outlineC5">c5</Tag>
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
              <div className="p-4 rounded-lg border border-nasun-c1 bg-nasun-c1/10 ">
                <p className=" font-medium text-nasun-c1">Alert message using c1 (#f9a824)</p>
              </div>
              <div className="p-4 rounded-lg border border-nasun-c2 bg-nasun-c2/10 ">
                <p className="text-nasun-c2 font-medium ">Alert message using c2 (#f4d35d)</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">Stats Cards</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total Revenue - Amber */}
              <div className="p-6 rounded-xl border border-nasun-c1 bg-nasun-c1/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-full bg-nasun-c1">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h4 className="text-lg font-medium text-nasun-c1">Total Revenue</h4>
                </div>
                <p className="text-3xl font-bold text-nasun-white mb-2">$15,231.89</p>
                <p className="text-sm text-nasun-c1">+20.1% from last month</p>
              </div>

              {/* Active Users - Sunshine */}
              <div className="p-6 rounded-xl border border-nasun-c2 bg-nasun-c2/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-full bg-nasun-c2">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                  <h4 className="text-lg font-medium text-nasun-c2">Active Users</h4>
                </div>
                <p className="text-3xl font-bold text-nasun-white mb-2">12,234</p>
                <p className="text-sm text-nasun-c2">+2.3% from last week</p>
              </div>

              {/* Conversion Rate - Amber */}
              <div className="p-6 rounded-xl border border-nasun-c1 bg-nasun-c1/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-full bg-nasun-c1">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                  </div>
                  <h4 className="text-lg font-medium text-nasun-c1">Conversion Rate</h4>
                </div>
                <p className="text-3xl font-bold text-nasun-white mb-2">3.42%</p>
                <p className="text-sm text-nasun-c1">+0.5% from yesterday</p>
              </div>
            </div>
          </div>

          {/* Form Elements */}
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">Form Elements</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Login Form - Amber */}
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

              {/* Settings - Sunshine */}
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
                  <tr className="border-b border-nasun-c1/20">
                    <td className="px-6 py-4">
                      <span className="text-sm font-normal text-nasun-c1">Success</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-nasun-white/80">user1@example.com</td>
                    <td className="px-6 py-4 text-sm text-nasun-white/80">$976.92</td>
                  </tr>
                  <tr className="border-b border-nasun-c1/20">
                    <td className="px-6 py-4">
                      <span className="text-sm  font-normal text-nasun-c1">Success</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-nasun-white/80">user2@example.com</td>
                    <td className="px-6 py-4 text-sm text-nasun-white/80">$641.95</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4">
                      <span className="text-sm  font-normal text-nasun-c1">Success</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-nasun-white/80">user3@example.com</td>
                    <td className="px-6 py-4 text-sm text-nasun-white/80">$466.17</td>
                  </tr>
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
