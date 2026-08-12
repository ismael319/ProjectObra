import { useEffect, useState } from 'react'
import { addDays, startOfDay } from 'date-fns'

export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()))

  useEffect(() => {
    let timeoutId = 0

    const refresh = () => {
      const now = new Date()
      const currentDay = startOfDay(now)
      setToday((previous) => previous.getTime() === currentDay.getTime() ? previous : currentDay)
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(refresh, addDays(currentDay, 1).getTime() - now.getTime() + 1000)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    refresh()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return today
}
