// sections/news/FeaturedPost.tsx
import { Link } from "react-router-dom";
import { ArrowTopRightIcon } from "@radix-ui/react-icons";
import { Post } from "../../types/post.d";
import { Tag } from "@/components/ui/tag";

interface FeaturedPostProps {
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
    month: "long",
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

export default function FeaturedPost({ post }: FeaturedPostProps) {
  const imageUrl = getImageUrl(post);
  const category = getCategory(post);
  const title = stripHtml(post.title.rendered);
  const excerpt = stripHtml(post.excerpt.rendered);

  return (
    <Link to={`/news-events/${post.slug}`} state={{ from: "/news" }} className="block group">
      <article className="bg-nasun-black rounded-sm overflow-hidden border border-nasun-white/50 hover:border-nasun-white/70 transition-all duration-300">
        {/* Horizontal card layout */}
        <div className="flex flex-col md:flex-row">
          {/* Left: Image */}
          <div className="md:w-1/2 md:self-stretch">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={title}
                className="block w-full h-64 md:h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-64 md:h-full min-h-[300px] bg-gradient-to-br from-nasun-c4/30 to-nasun-c5/20 flex items-center justify-center">
                <span className="text-white/40 text-lg">No Image</span>
              </div>
            )}
          </div>

          {/* Right: Content */}
          <div className="md:w-1/2 p-6 md:p-10 flex flex-col justify-center">
            {/* Featured badge */}
            <div className="flex items-center gap-3 mb-4">
              <Tag variant="filledC1" size="sm" className="font-medium uppercase tracking-wider !border-none !bg-nasun-c1 text-nasun-black">
                Featured
              </Tag>
              <Tag variant="outlineC1" size="sm" className="font-medium uppercase tracking-wider">
                {category}
              </Tag>
            </div>

            {/* Title */}
            <h2 className="text-2xl md:text-3xl font-semibold mb-4 line-clamp-3 group-hover:text-nasun-white transition-colors">
              {title}
            </h2>

            {/* Date */}
            <time className="text-nasun-white/80 mb-4" dateTime={post.date}>
              {formatDate(post.date)}
            </time>

            {/* Excerpt */}
            <p className="text-nasun-white/80 mb-6 line-clamp-3">{excerpt}</p>

            {/* Read More indicator (visual only, card is clickable) */}
            <Tag
              variant="filledC1"
              size="sm"
              className="self-end !border-none !bg-nasun-c1 text-nasun-black hover:!bg-nasun-c2 transition-all capitalize px-8"
            >
              Read More
              <ArrowTopRightIcon className="ml-2 w-4 h-4" />
            </Tag>
          </div>
        </div>
      </article>
    </Link>
  );
}
