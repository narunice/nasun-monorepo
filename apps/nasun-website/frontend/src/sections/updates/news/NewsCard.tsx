// sections/news/NewsCard.tsx
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Post } from "../../../types/post.d";
import { TagV2 } from "@/components/ui/tag-v2";
import { ButtonV3 } from "@/components/ui/button-v3";

interface NewsCardProps {
  post: Post;
}

// Helper function to strip HTML tags
const stripHtml = (html: string): string => {
  return html.replace(/<[^>]*>?/gm, "");
};

// Helper function to format date
const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Helper function to extract category from WordPress post
const getCategory = (post: Post): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terms = (post._embedded as any)?.["wp:term"];
  if (terms && Array.isArray(terms) && terms[0] && Array.isArray(terms[0]) && terms[0][0]?.name) {
    return terms[0][0].name;
  }
  return "NEWS";
};

// Helper function to extract image URL from WordPress post
const getImageUrl = (post: Post): string => {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  if (!media) return "";

  // 1. Try direct source_url
  if (media.source_url) return media.source_url;

  // 2. Try media_details sizes (preferred order)
  const sizes = media.media_details?.sizes;
  if (sizes) {
    if (sizes.large?.source_url) return sizes.large.source_url;
    if (sizes.medium_large?.source_url) return sizes.medium_large.source_url;
    if (sizes.full?.source_url) return sizes.full.source_url;
  }

  return "";
};

export default function NewsCard({ post }: NewsCardProps) {
  const { t } = useTranslation("common");
  const imageUrl = getImageUrl(post);
  const category = getCategory(post);
  const title = stripHtml(post.title.rendered);
  const excerpt = stripHtml(post.excerpt.rendered);

  return (
    <Link to={`/news-events/${post.slug}`}>
      <article className="group bg-nasun-white rounded-sm overflow-hidden shadow-lg transition-all duration-300 h-full flex flex-col">
        {/* Image: 16:9 aspect ratio */}
        <div className="aspect-video overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-nasun-nw4/30 to-nasun-nw1/20 flex items-center justify-center">
              <span className="text-nasun-black/30 text-lg">No Image</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col flex-grow">
          {/* Category badge and date */}
          <div className="flex items-center justify-between mb-3">
            <TagV2 variant="outlineNw2" size="sm" className="font-medium tracking-wider">
              {category}
            </TagV2>
            <time className="text-sm text-nasun-black/60" dateTime={post.date}>
              {formatDate(post.date)}
            </time>
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold line-clamp-2 mb-2 text-nasun-black">
            {title}
          </h3>

          {/* Excerpt */}
          <p className="text-nasun-black/80 text-sm line-clamp-3 flex-grow">{excerpt}</p>

          {/* Read More button (visual only, card is clickable) */}
          <div className="flex justify-end mt-4">
            <ButtonV3 variant="gradient" size="sm" className="capitalize">
              {t("actions.readMore")}
              <ArrowRight className="ml-2 w-4 h-4" />
            </ButtonV3>
          </div>
        </div>
      </article>
    </Link>
  );
}
