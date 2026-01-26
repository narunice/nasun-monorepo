import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { Button } from "@/components/ui/button";
import usePosts from "../../../../hooks/wordpress/usePosts";
import NewsCard from "./NewsCard";
import FeaturedPost from "./FeaturedPost";
import CategoryFilter from "./CategoryFilter";
import { CategoryType, getCategoryIds } from "./categoryUtils";
import Pagination from "./Pagination";

const POSTS_PER_PAGE = 10;

function CardSkeleton() {
  return (
    <div className="bg-black rounded-2xl overflow-hidden border border-nasun-c7/30 animate-pulse">
      <div className="aspect-video bg-white/5" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="h-6 w-16 bg-white/5 rounded-full" />
          <div className="h-4 w-20 bg-white/5 rounded" />
        </div>
        <div className="h-6 w-3/4 bg-white/5 rounded mb-2" />
        <div className="h-4 w-full bg-white/5 rounded mb-1" />
        <div className="h-4 w-2/3 bg-white/5 rounded" />
      </div>
    </div>
  );
}

function FeaturedSkeleton() {
  return (
    <div className="bg-black rounded-2xl overflow-hidden border border-nasun-c7/30 animate-pulse">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-1/2 h-64 md:h-80 bg-white/5" />
        <div className="md:w-1/2 p-6 md:p-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-6 w-20 bg-white/5 rounded-full" />
            <div className="h-6 w-16 bg-white/5 rounded-full" />
          </div>
          <div className="h-8 w-3/4 bg-white/5 rounded mb-4" />
          <div className="h-4 w-32 bg-white/5 rounded mb-4" />
          <div className="h-4 w-full bg-white/5 rounded mb-2" />
          <div className="h-4 w-2/3 bg-white/5 rounded mb-6" />
          <div className="h-10 w-32 bg-white/5 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function NewsSection() {
  const { t } = useTranslation("news");
  const { t: tCommon } = useTranslation("common");
  const [activeCategory, setActiveCategory] = useState<CategoryType>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const categoryIds = getCategoryIds(activeCategory);
  const { posts, loading, error, refetch } = usePosts(categoryIds, 100);

  const handleCategoryChange = (category: CategoryType) => {
    setActiveCategory(category);
    setCurrentPage(1);
  };

  const { featuredPost, remainingPosts, totalPages, paginatedPosts } = useMemo(() => {
    if (!posts || posts.length === 0) {
      return { featuredPost: null, remainingPosts: [], totalPages: 0, paginatedPosts: [] };
    }

    const featured = posts[0];
    const remaining = posts.slice(1);
    const total = Math.ceil(remaining.length / POSTS_PER_PAGE);
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    const paginated = remaining.slice(startIndex, startIndex + POSTS_PER_PAGE);

    return {
      featuredPost: featured,
      remainingPosts: remaining,
      totalPages: total,
      paginatedPosts: paginated,
    };
  }, [posts, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 400, behavior: "smooth" });
  };

  return (
    <SectionLayout className="!max-w-6xl">
      <PageTitle as="h2" align="center" className="">
        {t("pageTitle")}
      </PageTitle>

      <div className="flex justify-center -mt-4 mb-4 md:mb-5 lg:mb-6">
        <CategoryFilter activeCategory={activeCategory} onCategoryChange={handleCategoryChange} />
      </div>

      {loading && (
        <>
          <FeaturedSkeleton />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </>
      )}

      {error && !loading && (
        <div className="text-center py-20">
          <p className="text-orange-400 mb-4">{error}</p>
          <Button variant="black" onClick={() => refetch()}>
            {tCommon("actions.retry") || "Retry"}
          </Button>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p>{tCommon("info.noData") || "No posts found."}</p>
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <>
          {featuredPost && <FeaturedPost post={featuredPost} />}

          {paginatedPosts.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
                {paginatedPosts.map((post) => (
                  <NewsCard key={post.id} post={post} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-12">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}

          {remainingPosts.length === 0 && featuredPost && (
            <div className="text-center py-12 text-gray-400 mt-8">
              <p>{tCommon("info.noMorePosts") || "No more posts available."}</p>
            </div>
          )}
        </>
      )}
    </SectionLayout>
  );
}
