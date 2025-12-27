export interface Post {
  id: number;
  date: string;
  slug: string;
  link: string;
  title: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url: string;
      alt_text?: string;
      media_details?: {
        sizes?: {
          full?: {
            source_url: string;
          };
          medium?: {
            source_url: string;
          };
          thumbnail?: {
            source_url: string;
          };
          [size: string]:
            | {
                // 동적 이미지 사이즈 대응
                source_url?: string;
              }
            | undefined;
        };
      };
    }>;
    "wp:term"?: Array<{
      id: number;
      name: string;
      taxonomy: string;
    }>;
  };
  // WordPress에서 추가로 제공할 수 있는 공통 필드
  content?: {
    rendered: string;
  };
  author?: number;
  featured_media?: number;
  categories?: number[];
  tags?: number[];
}

export interface PostsState {
  posts: Post[];
  loading: boolean;
  error: string | null;
}

interface AwardsSectionProps {
  posts: Post[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  className?: string;
}

interface NewsSectionProps {
  posts: Post[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  className?: string;
}
