export interface SubSection {
  title: string;
  description: string;
  image?: string;
}

export interface FoodArticle {
  id?: string;
  title: string;
  summary: string;
  coverImage: string;
  subSections: SubSection[];
  author: string;
  createdAt: number;
}

export type ViewState = 'HOME' | 'DETAIL' | 'ADMIN_LOGIN' | 'ADMIN_DASHBOARD' | 'PROFILE' | 'GAME' | 'DEVELOPER_INFO' | 'ABOUT' | 'CONTACT' | 'SEJARAH' | 'FILOSOFI';
