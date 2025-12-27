interface SocialLink {
  name: string
  url: string
  icon?: string // 추후 아이콘 추가를 위해 옵셔널로 지정
}

export const SOCIAL_LINKS: SocialLink[] = [
  { name: "YouTube", url: "https://youtube.com" },
  { name: "Facebook", url: "https://facebook.com" },
  { name: "X", url: "https://x.com" },
  { name: "Instagram", url: "https://instagram.com" },
  { name: "TikTok", url: "https://tiktok.com" },
  { name: "Threads", url: "https://threads.net" },
  { name: "Discord", url: "https://discord.com" },
  { name: "Reddit", url: "https://reddit.com" },
  { name: "Zealy", url: "https://zealy.io" },
]
