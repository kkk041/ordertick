import { useEffect, useMemo, useRef, useState } from 'react'

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function easeOutCubic(progress) {
  return 1 - Math.pow(1 - progress, 3)
}

export default function useAnimatedSeries(
  items,
  { keyField = 'key', fields = ['value'], duration = 720 } = {},
) {
  const fieldList = useMemo(
    () => (Array.isArray(fields) && fields.length ? [...fields] : ['value']),
    [JSON.stringify(fields || ['value'])],
  )
  const safeItems = useMemo(
    () => (Array.isArray(items) ? items.map((item) => ({ ...item })) : []),
    [items],
  )

  const [animatedItems, setAnimatedItems] = useState(safeItems)
  const snapshotRef = useRef(new Map())

  useEffect(() => {
    snapshotRef.current = new Map(
      animatedItems.map((item) => [
        String(item?.[keyField] ?? ''),
        fieldList.reduce((accumulator, field) => {
          accumulator[field] = toNumber(item?.[field])
          return accumulator
        }, {}),
      ]),
    )
  }, [animatedItems, fieldList, keyField])

  useEffect(() => {
    const nextSnapshot = new Map(
      safeItems.map((item) => [
        String(item?.[keyField] ?? ''),
        fieldList.reduce((accumulator, field) => {
          accumulator[field] = toNumber(item?.[field])
          return accumulator
        }, {}),
      ]),
    )

    const shouldAnimate = safeItems.some((item) => {
      const key = String(item?.[keyField] ?? '')
      const previous = snapshotRef.current.get(key) || {}

      return fieldList.some(
        (field) =>
          Math.abs(toNumber(item?.[field]) - toNumber(previous[field])) >
          0.000001,
      )
    })

    if (!shouldAnimate) {
      setAnimatedItems(safeItems)
      snapshotRef.current = nextSnapshot
      return undefined
    }

    let raf = 0
    const startTime = performance.now()

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration)
      const eased = easeOutCubic(progress)

      setAnimatedItems(
        safeItems.map((item) => {
          const key = String(item?.[keyField] ?? '')
          const previous = snapshotRef.current.get(key) || {}
          const nextItem = { ...item }

          fieldList.forEach((field) => {
            const from = toNumber(previous[field])
            const to = toNumber(item?.[field])
            nextItem[field] = from + (to - from) * eased
          })

          return nextItem
        }),
      )

      if (progress < 1) {
        raf = window.requestAnimationFrame(tick)
        return
      }

      snapshotRef.current = nextSnapshot
    }

    raf = window.requestAnimationFrame(tick)

    return () => {
      if (raf) {
        window.cancelAnimationFrame(raf)
      }
    }
  }, [duration, fieldList, keyField, safeItems])

  return animatedItems
}
