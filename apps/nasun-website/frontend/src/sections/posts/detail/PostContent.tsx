import { useMemo } from "react";
import { motion } from "framer-motion";
import DOMPurify from "dompurify";
import { sanitizeWordPressContent } from "@/utils/wordpressContent";

interface PostContentProps {
  content: string;
}

const PROSE_CLASSES = `flex-1 prose prose-lg prose-invert max-w-none
  prose-headings:font-eurostile prose-headings:tracking-wide prose-headings:text-white
  prose-h1:text-4xl prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:text-nasun-nw1
  prose-h3:text-2xl prose-h3:mt-8 prose-h3:text-nasun-nw1
  prose-p:text-gray-300 prose-p:leading-relaxed prose-p:font-light
  prose-strong:text-nasun-white prose-strong:font-semibold
  prose-a:text-blue-500 prose-a:no-underline prose-a:border-b prose-a:border-blue-500/50 prose-a:break-all
  hover:prose-a:text-blue-300 hover:prose-a:border-blue-300 hover:prose-a:transition-colors
  prose-blockquote:border-l-4 prose-blockquote:border-nasun-nw1
  prose-blockquote:bg-white/5 prose-blockquote:px-6 prose-blockquote:py-4 prose-blockquote:rounded-r-lg
  prose-blockquote:text-gray-200 prose-blockquote:not-italic
  prose-img:rounded-sm prose-img:shadow-xl prose-img:border prose-img:border-white/10 prose-img:my-4
  prose-li:text-gray-300 prose-li:marker:text-nasun-nw1`;

// Enforce rel="noopener noreferrer" on all target="_blank" links to prevent
// reverse tabnapping attacks via window.opener.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export default function PostContent({ content }: PostContentProps) {
  const sanitizedContent = useMemo(() => {
    const cleanContent = sanitizeWordPressContent(content);
    return DOMPurify.sanitize(cleanContent, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'figure', 'figcaption', 'blockquote', 'pre', 'code', 'div', 'span'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target', 'rel', 'width', 'height'],
      ALLOW_DATA_ATTR: false,
    });
  }, [content]);

  // Extract the first <figure> (featured image) from content for separate animation
  const { featuredHtml, bodyHtml } = useMemo(() => {
    const doc = new DOMParser().parseFromString(sanitizedContent, "text/html");
    const firstFigure = doc.querySelector("figure");
    if (firstFigure) {
      const featuredHtml = firstFigure.outerHTML;
      firstFigure.remove();
      return { featuredHtml, bodyHtml: doc.body.innerHTML };
    }
    return { featuredHtml: null, bodyHtml: sanitizedContent };
  }, [sanitizedContent]);

  return (
    <div className="flex-1 min-w-0">
      {featuredHtml && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="prose prose-invert max-w-none mb-8
            prose-img:rounded-sm prose-img:shadow-xl prose-img:border prose-img:border-white/10 prose-img:my-0
            prose-figcaption:text-gray-500 prose-figcaption:text-sm prose-figcaption:text-center"
          dangerouslySetInnerHTML={{ __html: featuredHtml }}
        />
      )}
      <div
        className={PROSE_CLASSES}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  );
}
