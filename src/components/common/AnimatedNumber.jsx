/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import './AnimatedNumber.css'

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatNumber(value, decimals) {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function AnimatedNumber({
  value,
  decimals = 0,
  duration = 650,
  prefix = '',
  suffix = '',
}) {
  const target = toNumber(value)
  const prevValueRef = useRef(target)
  const [displayValue, setDisplayValue] = useState(target)

  useEffect(() => {
    const from = prevValueRef.current
    const to = target

    if (Math.abs(to - from) < 0.000001) {
      setDisplayValue(to)
      prevValueRef.current = to
      return
    }

    let raf = 0
    const startTime = performance.now()

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(from + (to - from) * eased)

      if (progress < 1) {
        raf = window.requestAnimationFrame(tick)
      }
    }

    raf = window.requestAnimationFrame(tick)
    prevValueRef.current = to

    return () => {
      if (raf) {
        window.cancelAnimationFrame(raf)
      }
    }
  }, [target, duration])

  return (
    <span className="animated-number">
      {prefix}
      {formatNumber(displayValue, decimals)}
      {suffix}
    </span>
  )
}

export default AnimatedNumber
