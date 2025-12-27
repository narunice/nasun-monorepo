// // src/types/team.d.ts
export interface TeamMember {
  id: string;
  nameKey: string;
  positionKey: string;
  descriptionKey: string;
  imageUrl: string;
  emphasizedWordCount?: number; // 첫 번째 문단에서 강조할 단어 수 (기본값: 6)
  socialLinks?: {
    email?: string;
    linkedin?: string;
    twitter?: string;
    website?: string;
  };
  publications?: { label: string; url: string }[];
  filmography?: { label: string; url: string }[];
  otherLinks?: { label: string; url: string }[];
}

export interface JoinUsContent {
  title: string;
  buttonText: string;
  descriptionKey: string; // string[] 대신 키 사용
}
