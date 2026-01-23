// sections/news/NewsCard.tsx
import { Link } from "react-router-dom";
import { Post } from "../../types/post.d";
import { Tag } from "@/components/ui/tag";

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
  const imageUrl = getImageUrl(post);
  const category = getCategory(post);
  const title = stripHtml(post.title.rendered);
  const excerpt = stripHtml(post.excerpt.rendered);

  return (
    <Link to={`/news-events/${post.slug}`} state={{ from: "/news" }}>
      <article className="group bg-nasun-black rounded-sm overflow-hidden border border-nasun-white/50 hover:border-nasun-white/70 transition-all duration-300 h-full flex flex-col">
        {/* Image: 16:9 aspect ratio */}
        <div className="aspect-video overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-nasun-c4/30 to-nasun-c5/20 flex items-center justify-center">
              <span className="text-white/40 text-lg">No Image</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col flex-grow">
          {/* Category badge and date */}
          <div className="flex items-center justify-between mb-3">
            <Tag variant="outlineC1" size="sm" className="font-medium uppercase tracking-wider">
              {category}
            </Tag>
            <time className="text-sm text-gray-400" dateTime={post.date}>
              {formatDate(post.date)}
            </time>
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold line-clamp-2 mb-2 group-hover:text-nasun-white transition-colors">
            {title}
          </h3>

          {/* Excerpt */}
          <p className="text-gray-400 text-sm line-clamp-3 flex-grow">{excerpt}</p>

          {/* Read More button (visual only, card is clickable) */}
          <Tag
            variant="filledC1"
            size="sm"
            className="self-end mt-4 !border-none !bg-nasun-c1 text-nasun-black hover:!bg-nasun-c1/80 transition-all capitalize px-8"
          >
            Read More
          </Tag>
        </div>
      </article>
    </Link>
  );
}
