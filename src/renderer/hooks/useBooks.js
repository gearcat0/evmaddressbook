import { useState, useEffect, useCallback } from 'react'

const DEFAULT_BOOK = 'Default'
const STORAGE_KEY = 'selectedBook'

function rememberedBook() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_BOOK
  } catch {
    return DEFAULT_BOOK
  }
}

export default function useBooks() {
  const [books, setBooks] = useState([DEFAULT_BOOK])
  // Restore the last-selected book so it survives tab switches (the Addresses
  // screen unmounts when navigating away) and app restarts.
  const [current, setCurrent] = useState(rememberedBook)

  const load = useCallback(async () => {
    const list = await window.api.listBooks()
    setBooks(list)
    // Fall back to Default if the remembered book no longer exists.
    setCurrent(prev => (list.includes(prev) ? prev : DEFAULT_BOOK))
    return list
  }, [])

  useEffect(() => { load() }, [load])

  // Persist the selection whenever it changes.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, current) } catch {}
  }, [current])

  const create = useCallback(async (name) => {
    const created = await window.api.createBook(name)
    await load()
    setCurrent(created)
    return created
  }, [load])

  const remove = useCallback(async (name) => {
    await window.api.deleteBook(name)
    const list = await load()
    setCurrent(prev => (prev === name ? DEFAULT_BOOK : prev))
    return list
  }, [load])

  return { books, current, setCurrent, create, remove, reload: load, DEFAULT_BOOK }
}
