import { useState, useEffect, useCallback } from 'react'

const DEFAULT_BOOK = 'Default'

export default function useBooks() {
  const [books, setBooks] = useState([DEFAULT_BOOK])
  const [current, setCurrent] = useState(DEFAULT_BOOK)

  const load = useCallback(async () => {
    const list = await window.api.listBooks()
    setBooks(list)
    return list
  }, [])

  useEffect(() => { load() }, [load])

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

  return { books, current, setCurrent, create, remove, DEFAULT_BOOK }
}
