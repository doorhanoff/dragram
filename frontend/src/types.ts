export interface User {
  id: string
  name: string
  phone_number: string
  description?: string | null
  image_url?: string | null
  is_active?: boolean
  public_key?: string | null
}

export interface Member {
  id: string
  name: string
  image_url?: string | null
  is_active?: boolean
}

export interface Chat {
  id: string
  name?: string | null
  image_url?: string | null
  members: Member[]
  members_ids: string[]
  created_at: string
  unread_count?: number
}

export interface Message {
  id?: string
  _id?: string
  text: string
  type: 'text' | 'image' | 'video' | 'audio'
  sender_id?: string
  writer?: string
  sender_name?: string | null
  is_read: boolean
  date?: string
  created_at?: string
}

export interface Post {
  id: string
  title: string
  description?: string | null
  materials: string[]
  created_by_id?: string
  created_by?: { id: string; name: string; image_url?: string | null }
  created_at: string
}

export interface Comment {
  id: string
  text: string
  post_id: string
  created_by_id: string
  created_by?: { id: string; name: string; image_url?: string | null }
  reply_to_id?: string | null
  created_at: string
}

export interface Album {
  id: string
  name: string
  creator_id: string
  created_at: string
  cover?: string | null
}

export interface AlbumDetail extends Album {
  members: Member[]
}

export interface AlbumMaterial {
  id: string
  link: string
  published_by_id: string
  published_at: string
}

export type NavSection = 'chats' | 'posts' | 'albums'
export type MobileScreen = 'list' | 'detail'
