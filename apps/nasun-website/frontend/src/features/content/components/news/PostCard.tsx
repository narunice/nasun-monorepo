// components/news/PostCard.tsx
import { useTranslation } from "react-i18next";
import { Post } from "../../../types/post.d";
import DOMPurify from "dompurify";

interface PostCardProps {
  post: Post;
}

export default function PostCard({ post }: PostCardProps) {
  const { t } = useTranslation("common");
  const featuredImage = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  // The excerpt is already sanitized by replacing HTML tags, but we can also use DOMPurify for consistency if needed.
  const excerptText = post.excerpt.rendered.replace(/<[^>]*>/g, "").trim();

  // Sanitize the title before rendering
  const sanitizedTitle = DOMPurify.sanitize(post.title.rendered);

  const handleCardClick = () => {
    window.open(post.link, "_blank");
  };

  return (
    <article
      className="rounded-lg overflow-hidden transition-shadow cursor-pointer hover:shadow-lg"
      onClick={handleCardClick}
    >
      {featuredImage && (
        <div className="w-full h-64 overflow-hidden">
          <img
            src={featuredImage}
            alt={post._embedded?.["wp:featuredmedia"]?.[0]?.alt_text || post.title.rendered}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-6">
        <h3 className="mb-2" dangerouslySetInnerHTML={{ __html: sanitizedTitle }} />
        <time dateTime={post.date} className="text-gray-400 text-sm lg:text-base block mb-4">
          {new Date(post.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        <p className="mb-4 line-clamp-3">{excerptText}</p>
        <a
          href={post.link}
          className="mt-auto inline-flex items-center font-medium transition-all underline text-gray-200  hover:text-gray-300"
          onClick={(e) => e.stopPropagation()}
        >
          {t("actions.readMore")}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 ml-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      </div>
    </article>
  );
}
