export interface Post {
  id: number
  date: string
  slug: string
  link: string
  title: {
    rendered: string
  }
  content?: {
    rendered: string
  }
  excerpt: {
    rendered: string
  }
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url: string
      alt_text?: string
      media_details?: {
        sizes?: {
          medium?: { source_url: string }
          large?: { source_url: string }
          full?: { source_url: string }
        }
      }
    }>
    "wp:term"?: Array<
      Array<{
        id: number
        name: string
        taxonomy: string
      }>
    >
    author?: Array<{ name: string }>
  }
}
