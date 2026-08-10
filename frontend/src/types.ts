export interface User {
  id: string
  name: string
  phone_number: string
  description?: string | null
  image_url?: string | null
  is_active?: boolean
  /** Момент последнего heartbeat — для строки «был(а) вчера в 21:40». */
  last_seen?: string | null
  public_key?: string | null
}

export interface Member {
  id: string
  name: string
  image_url?: string | null
  is_active?: boolean
  last_seen?: string | null
}

/** Последнее сообщение чата. text для type==='text' зашифрован — расшифровка
 *  на клиенте, ключи лежат в chatKeysRef. */
export interface LastMessage {
  id: string
  text: string
  type: 'text' | 'image' | 'video' | 'audio' | 'file'
  sender_id: string
  sender_name?: string | null
  created_at: string
  file_name?: string | null
}

export interface Chat {
  id: string
  name?: string | null
  image_url?: string | null
  members: Member[]
  members_ids: string[]
  created_at: string
  unread_count?: number
  last_message?: LastMessage | null
}

/** Цитата в ответе. Текст тоже зашифрован. */
export interface ReplyPreview {
  id: string
  text: string
  type: 'text' | 'image' | 'video' | 'audio' | 'file'
  sender_id: string
  sender_name?: string | null
  file_name?: string | null
}

export interface Message {
  id?: string
  _id?: string
  // Локальный id оптимистично показанного сообщения; сервер возвращает его
  // в эхе, чтобы заменить временное сообщение настоящим, а не дублировать
  client_id?: string
  text: string
  type: 'text' | 'image' | 'video' | 'audio' | 'file'
  sender_id?: string
  writer?: string
  sender_name?: string | null
  is_read: boolean
  thumbnail_url?: string | null
  date?: string
  created_at?: string
  reply_to_id?: string | null
  reply_to?: ReplyPreview | null
  /** Имя документа: в хранилище ключ случайный, показывать его нечего. */
  file_name?: string | null
  _msgStatus?: string
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
  materials_count?: number
  last_added_at?: string | null
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

// Профиль — полноценный четвёртый экран, а не окошко поверх текущего:
// раньше три вкладки переключали экран, а четвёртая открывала модалку и
// никогда не подсвечивалась.
export type NavSection = 'chats' | 'posts' | 'albums' | 'profile'
export type MobileScreen = 'list' | 'detail'
