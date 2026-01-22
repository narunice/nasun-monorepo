import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { Post } from "../../../types/post.d";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";

interface PostNavigationProps {
  previousPost: Post | null;
  nextPost: Post | null;
  basePath: string; // "/awards-grants" or "/news-events"
}

const NavLink = ({
  post,
  direction,
  label,
  basePath,
}: {
  post: Post;
  direction: "previous" | "next";
  label: string;
  basePath: string;
}) => {
  const imageUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";

  return (
    <Link
      to={`${basePath}/${post.slug}`}
      className="group w-1/2 p-4 md:p-6 hover:bg-gray-50 hover:bg-gray-800/50 transition-all   block"
    >
      <div
        className={`flex items-center gap-4 ${
          direction === "next" ? "justify-end" : "justify-start"
        }`}
      >
        {direction === "previous" && <ChevronLeftIcon className="w-8 h-8 text-gray-400 shrink-0" />}

        {direction === "previous" && imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="w-16 h-16 object-cover rounded-lg hidden md:block"
          />
        )}

        <div className={direction === "next" ? "text-right" : "text-left"}>
          <span className="text-sm text-gray-500 uppercase tracking-wider">{label}</span>
          <p
            className="font-bold line-clamp-2 group-hover:text-nasun-accent transition-all"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.title.rendered) }}
          />
        </div>

        {direction === "next" && imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="w-16 h-16 object-cover rounded-lg hidden md:block"
          />
        )}

        {direction === "next" && <ChevronRightIcon className="w-8 h-8 text-gray-400 shrink-0" />}
      </div>
    </Link>
  );
};

const PostNavigation: React.FC<PostNavigationProps> = ({ previousPost, nextPost, basePath }) => {
  const { t } = useTranslation("common");

  if (!previousPost && !nextPost) {
    return null;
  }

  return (
    <div className="mt-9 flex border-t border-gray-700">
      {previousPost ? (
        <NavLink post={previousPost} direction="previous" label={t("post.previousPost")} basePath={basePath} />
      ) : (
        <div className="w-1/2" />
      )}
      {nextPost ? (
        <NavLink post={nextPost} direction="next" label={t("post.nextPost")} basePath={basePath} />
      ) : (
        <div className="w-1/2" />
      )}
    </div>
  );
};

export default PostNavigation;
