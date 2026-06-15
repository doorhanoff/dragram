const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

// На мобильном куки не работают кросс-домен — храним токены в localStorage
const IS_NATIVE = !!import.meta.env.VITE_API_URL

function getAccessToken()  { return IS_NATIVE ? localStorage.getItem('access_token')  : null }
function getRefreshToken() { return IS_NATIVE ? localStorage.getItem('refresh_token') : null }
function saveTokens(access, refresh) {
  if (!IS_NATIVE) return
  if (access)  localStorage.setItem('access_token',  access)
  if (refresh) localStorage.setItem('refresh_token', refresh)
}
function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

let _refreshing = false
let _refreshQueue = []

async function tryRefresh() {
  if (_refreshing) {
    return new Promise((resolve, reject) => _refreshQueue.push({ resolve, reject }))
  }
  _refreshing = true
  try {
    let res
    if (IS_NATIVE) {
      const refreshToken = getRefreshToken()
      if (!refreshToken) throw new Error('no_refresh_token')
      res = await fetch(BASE + '/auth/refresh', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${refreshToken}` },
      })
    } else {
      res = await fetch(BASE + '/auth/refresh', { method: 'POST', credentials: 'include' })
    }
    if (!res.ok) throw new Error('refresh_failed')
    if (IS_NATIVE) {
      const data = await res.json()
      saveTokens(data.access_token, data.refresh_token)
    }
    _refreshQueue.forEach(p => p.resolve())
  } catch (e) {
    _refreshQueue.forEach(p => p.reject(e))
    throw e
  } finally {
    _refreshing = false
    _refreshQueue = []
  }
}

async function req(method, path, body, isForm = false) {
  const opts = IS_NATIVE
    ? { method, headers: {} }
    : { method, credentials: 'include' }

  if (IS_NATIVE) {
    const token = getAccessToken()
    if (token) opts.headers['Authorization'] = `Bearer ${token}`
  }

  if (body && !isForm) {
    opts.headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  } else if (body) {
    opts.body = body
  }

  let res = await fetch(BASE + path, opts)

  if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    try {
      await tryRefresh()
      if (IS_NATIVE) {
        const token = getAccessToken()
        if (token) opts.headers['Authorization'] = `Bearer ${token}`
      }
      res = await fetch(BASE + path, opts)
    } catch {
      window.dispatchEvent(new Event('auth:expired'))
      throw new Error('Session expired')
    }
  }

  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.detail || String(res.status))
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export const api = {
  getMe:           ()              => req('GET',  '/auth/me'),
  heartbeat:       ()              => req('POST', '/auth/heartbeat'),
  setOffline:      ()              => req('POST', '/auth/offline'),
  login: async (phone, pwd) => {
    const data = await req('POST', '/auth/login', { phone_number: phone, password: pwd })
    saveTokens(data?.access_token, data?.refresh_token)
    return data
  },
  register:        (data)          => req('POST', '/auth/register', data),
  logout: async () => {
    const data = await req('POST', '/auth/logout')
    clearTokens()
    return data
  },
  getChats:        ()              => req('GET',  '/chats/'),
  createChat:      (data)          => req('POST', '/chats/create',  data),
  getMessages:     (id, limit=50, beforeId=null) => {
    let url = `/chats/${id}/messages?limit=${limit}`
    if (beforeId) url += `&before_id=${beforeId}`
    return req('GET', url)
  },
  markRead:        (id)            => req('PUT',  `/chats/${id}/read`),
  deleteMessage:   (chatId, msgId) => req('DELETE', `/chats/${chatId}/messages/${msgId}`),
  getUser:         (id)            => req('GET',  `/auth/users/${id}`),
  searchUsers:     (q)             => req('GET',  `/auth/users?search_text=${encodeURIComponent(q)}&limit=20`),
  setPublicKey:    (key)           => req('PUT',  '/auth/me/public-key', { public_key: key }),
  setKeyBackup:    (backup)        => req('PUT',  '/auth/me/key-backup', { key_backup: backup }),
  getKeyBackup:    ()              => req('GET',  '/auth/me/key-backup'),
  getUserPublicKey:(id)            => req('GET',  `/auth/users/${id}/public-key`),
  setChatKeys:     (id, keys)      => req('POST', `/chats/${id}/keys`, { keys }),
  getMyChatKey:    (id)            => req('GET',  `/chats/${id}/keys/me`),
  updateProfile:   (data)          => req('PATCH', '/auth/me', data),
  uploadAvatar:    (file)          => {
    const fd = new FormData()
    fd.append('photo', file)
    return req('POST', '/auth/me/avatar', fd, true)
  },
  uploadMedia: (id, file, onProgress) => {
    return new Promise((resolve, reject) => {
      const fd  = new FormData()
      fd.append('file', file)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE}/chats/${id}/upload`)
      if (IS_NATIVE) {
        const token = getAccessToken()
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      } else {
        xhr.withCredentials = true
      }
      if (onProgress) {
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText))
        else reject(new Error(JSON.parse(xhr.responseText)?.detail || String(xhr.status)))
      }
      xhr.onerror = () => reject(new Error('Ошибка сети'))
      xhr.send(fd)
    })
  },
  getPosts:       (text, limit=20, offset=0, filter='all') => req('GET', `/posts/?${text ? `text=${encodeURIComponent(text)}&` : ''}limit=${limit}&offset=${offset}&filter=${filter}`),
  likePost:       (id)           => req('POST', `/posts/${id}/like`),
  bookmarkPost:   (id)           => req('POST', `/posts/${id}/bookmark`),
  getPost:        (id)           => req('GET',  `/posts/${id}`),
  createPost:     (data)         => req('POST', '/posts/create', data),
  uploadPostMedia:(id, files, onProgress) => {
    return new Promise((resolve, reject) => {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE}/posts/${id}/media`)
      if (IS_NATIVE) {
        const token = getAccessToken()
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      } else {
        xhr.withCredentials = true
      }
      if (onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)) }
      xhr.onload  = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(String(xhr.status)))
      xhr.onerror = () => reject(new Error('Ошибка сети'))
      xhr.send(fd)
    })
  },
  getComments:    (postId, limit=50, offset=0) => req('GET',    `/posts/${postId}/comments?limit=${limit}&offset=${offset}`),
  addComment:     (postId, data)               => req('POST',   `/posts/${postId}/comments`, data),
  deleteComment:  (commentId)                  => req('DELETE', `/posts/comments/${commentId}`),

  getAlbums:        ()             => req('GET',  '/albums/'),
  getAlbum:         (id)           => req('GET',  `/albums/${id}`),
  createAlbum:      (name)         => req('POST', '/albums/create', { name }),
  addAlbumMember:   (id, userId)   => req('POST', `/albums/${id}/members`, { user_id: userId }),
  removeAlbumMember:(id, userId)   => req('DELETE', `/albums/${id}/members/${userId}`),
  getAlbumMaterials:(id)           => req('GET',  `/albums/${id}/materials`),
  uploadAlbumMaterials: (id, files, onProgress) => {
    return new Promise((resolve, reject) => {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE}/albums/${id}/materials`)
      if (IS_NATIVE) {
        const token = getAccessToken()
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      } else {
        xhr.withCredentials = true
      }
      if (onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)) }
      xhr.onload  = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(String(xhr.status)))
      xhr.onerror = () => reject(new Error('Ошибка сети'))
      xhr.send(fd)
    })
  },

  uploadChatPhoto: (id, file) => {
    const fd = new FormData()
    fd.append('photo', file)
    return req('POST', `/chats/${id}/photo`, fd, true)
  },

  registerPushToken:   (token, platform = 'android') => req('POST', '/notifications/register', { token, platform }),
  unregisterPushToken: (token)                        => req('POST', '/notifications/unregister', { token }),

  // Экспортируем для использования в WebSocket
  getAccessToken,
}
