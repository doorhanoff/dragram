let _refreshing = false
let _refreshQueue = []

async function tryRefresh() {
  if (_refreshing) {
    // Уже обновляется — ждём результата
    return new Promise((resolve, reject) => _refreshQueue.push({ resolve, reject }))
  }
  _refreshing = true
  try {
    const res = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
    if (!res.ok) throw new Error('refresh_failed')
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
  const opts = { method, credentials: 'include' }
  if (body && !isForm) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  } else if (body) {
    opts.body = body
  }

  let res = await fetch(path, opts)

  // Автоматический refresh при 401
  if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    try {
      await tryRefresh()
      // Повторяем оригинальный запрос с новым куки
      res = await fetch(path, opts)
    } catch {
      // Refresh не удался — сообщаем приложению через событие (без перезагрузки страницы)
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
  login:           (phone, pwd)    => req('POST', '/auth/login',    { phone_number: phone, password: pwd }),
  register:        (data)          => req('POST', '/auth/register', data),
  logout:          ()              => req('POST', '/auth/logout'),
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
      xhr.open('POST', `/chats/${id}/upload`)
      xhr.withCredentials = true
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
  // Posts
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
      xhr.open('POST', `/posts/${id}/media`)
      xhr.withCredentials = true
      if (onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)) }
      xhr.onload  = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(String(xhr.status)))
      xhr.onerror = () => reject(new Error('Ошибка сети'))
      xhr.send(fd)
    })
  },
  getComments:    (postId, limit=50, offset=0) => req('GET',    `/posts/${postId}/comments?limit=${limit}&offset=${offset}`),
  addComment:     (postId, data)               => req('POST',   `/posts/${postId}/comments`, data),
  deleteComment:  (commentId)                  => req('DELETE', `/posts/comments/${commentId}`),

  uploadChatPhoto: (id, file) => {
    const fd = new FormData()
    fd.append('photo', file)
    return req('POST', `/chats/${id}/photo`, fd, true)
  },
}
