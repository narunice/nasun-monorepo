import DOMPurify from "dompurify";
import { sanitizeWordPressContent } from "@/utils/wordpressContent";

interface PostContentProps {
  content: string;
}

export default function PostContent({ content }: PostContentProps) {
  // WordPress Content Sanitization with strict allowlist
  const cleanContent = sanitizeWordPressContent(content);
  const sanitizedContent = DOMPurify.sanitize(cleanContent, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'blockquote', 'pre', 'code', 'div', 'span'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  });

  return (
    <div
      className="flex-1 prose prose-lg prose-invert max-w-none
        /* Headings */
        prose-headings:font-eurostile prose-headings:tracking-wide prose-headings:text-white
        prose-h1:text-4xl prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:text-nasun-nw1
        prose-h3:text-2xl prose-h3:mt-8 prose-h3:text-nasun-nw1

        /* Text */
        prose-p:text-gray-300 prose-p:leading-relaxed prose-p:font-light
        prose-strong:text-nasun-white prose-strong:font-semibold

        /* Links */
        prose-a:text-blue-500 prose-a:no-underline prose-a:border-b prose-a:border-blue-500/50 prose-a:break-all
        hover:prose-a:text-blue-300 hover:prose-a:border-blue-300 hover:prose-a:transition-colors

        /* Blockquotes */
        prose-blockquote:border-l-4 prose-blockquote:border-nasun-nw1
        prose-blockquote:bg-white/5 prose-blockquote:px-6 prose-blockquote:py-4 prose-blockquote:rounded-r-lg
        prose-blockquote:text-gray-200 prose-blockquote:not-italic

        /* Images inside content */
        prose-img:rounded-sm prose-img:shadow-xl prose-img:border prose-img:border-white/10 prose-img:my-4

        /* Lists */
        prose-li:text-gray-300 prose-li:marker:text-nasun-nw1"
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
