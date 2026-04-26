import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  onReveal: () => void
  revealed: boolean
  children: React.ReactNode
}

const BRUSH_RADIUS =
  typeof window !== 'undefined' && 'ontouchstart' in window ? 22 : 18
const REVEAL_THRESHOLD = 0.5

/**
 * Drag-to-scratch overlay. Children render underneath as the prize surface.
 * Hits >= 50% scratched, fires onReveal. Falls back gracefully: clicking
 * with no drag triggers onReveal immediately so the per-card tap behavior
 * users expect from the "Reveal" buttons still works.
 */
export function ScratchSurface({ onReveal, revealed, children }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)
  const revealedRef = useRef(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  // Observe size so DPR-scaled canvas matches container.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Paint the scratch surface.
  useEffect(() => {
    if (!size) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    const grad = ctx.createLinearGradient(0, 0, size.w, size.h)
    grad.addColorStop(0, '#3a2f12')
    grad.addColorStop(0.5, '#6b541d')
    grad.addColorStop(1, '#a07a23')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size.w, size.h)

    ctx.fillStyle = 'rgba(255, 215, 80, 0.08)'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    for (let y = 22; y < size.h; y += 28) {
      for (let x = 30; x < size.w; x += 70) {
        ctx.fillText('SCRATCH', x, y)
      }
    }

    revealedRef.current = false
    canvas.style.opacity = '1'
  }, [size])

  // Instant reveal animation.
  useEffect(() => {
    if (!revealed) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.transition = 'opacity 0.35s ease-out'
    canvas.style.opacity = '0'
    revealedRef.current = true
  }, [revealed])

  const getPos = useCallback(
    (e: React.TouchEvent | React.MouseEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      if ('touches' in e) {
        const t = e.touches[0]
        if (!t) return null
        return { x: t.clientX - rect.left, y: t.clientY - rect.top }
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    },
    [],
  )

  const scratch = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current
    if (!canvas || revealedRef.current) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'destination-out'
    const last = lastPosRef.current
    if (last) {
      ctx.lineWidth = BRUSH_RADIUS * 2 * dpr
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(last.x * dpr, last.y * dpr)
      ctx.lineTo(x * dpr, y * dpr)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(x * dpr, y * dpr, BRUSH_RADIUS * dpr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    lastPosRef.current = { x, y }
  }, [])

  const checkProgress = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || revealedRef.current) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let transparent = 0
    let total = 0
    for (let i = 3; i < data.length; i += 16) {
      total++
      if (data[i] === 0) transparent++
    }
    if (transparent / total >= REVEAL_THRESHOLD) {
      revealedRef.current = true
      onReveal()
    }
  }, [onReveal])

  const onStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (revealed) return
      e.preventDefault()
      isDrawingRef.current = true
      lastPosRef.current = null
      movedRef.current = false
      setHasStarted(true)
      const p = getPos(e)
      if (p) scratch(p.x, p.y)
    },
    [getPos, scratch, revealed],
  )

  const onMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!isDrawingRef.current) return
      e.preventDefault()
      const p = getPos(e)
      if (!p) return
      const last = lastPosRef.current
      if (last) {
        const dx = p.x - last.x
        const dy = p.y - last.y
        if (dx * dx + dy * dy > 9) movedRef.current = true
      }
      scratch(p.x, p.y)
    },
    [getPos, scratch],
  )

  const onEnd = useCallback(() => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    lastPosRef.current = null
    // Tap (no drag) counts as "reveal" so single-click behavior is preserved.
    if (!movedRef.current && !revealedRef.current) {
      revealedRef.current = true
      onReveal()
      return
    }
    checkProgress()
  }, [checkProgress, onReveal])

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full select-none rounded-lg overflow-hidden"
    >
      <div className="absolute inset-0">{children}</div>
      {!revealed && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-pointer touch-none"
          onMouseDown={onStart}
          onMouseMove={onMove}
          onMouseUp={onEnd}
          onMouseLeave={onEnd}
          onTouchStart={onStart}
          onTouchMove={onMove}
          onTouchEnd={onEnd}
        />
      )}
      {!hasStarted && !revealed && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-[0.2em] text-amber-100/80 font-semibold">
            Scratch
          </span>
        </div>
      )}
    </div>
  )
}
