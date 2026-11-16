import { useEffect, useRef } from 'react'

const LINK_DIST = 140
const MOUSE_DIST = 180

// Interactive particle network: nodes drift, link to neighbours and to the
// cursor, and get pushed away when the mouse gets close. A soft spotlight and
// a grid follow the pointer.
function TechBackground() {
  const canvasRef = useRef(null)
  const glowRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const glow = glowRef.current
    const ctx = canvas.getContext('2d')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const accent = (getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim() || '236 65 65').replace(/\s+/g, ',')
    const mouse = { x: -9999, y: -9999 }
    let w = 0
    let h = 0
    let dpr = 1
    let nodes = []
    let raf

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(120, Math.round((w * h) / 14000))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.8,
      }))
    }

    const onMove = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`
      glow.style.opacity = '1'
    }
    const onLeave = () => {
      mouse.x = mouse.y = -9999
      glow.style.opacity = '0'
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        if (!reduceMotion) {
          const dx = a.x - mouse.x
          const dy = a.y - mouse.y
          const d = Math.hypot(dx, dy)
          if (d < MOUSE_DIST && d > 0) {
            const f = (1 - d / MOUSE_DIST) * 0.6
            a.vx += (dx / d) * f
            a.vy += (dy / d) * f
          }
          a.vx *= 0.97
          a.vy *= 0.97
          a.x += a.vx + (Math.abs(a.vx) < 0.15 ? Math.sign(a.vx || 1) * 0.05 : 0)
          a.y += a.vy + (Math.abs(a.vy) < 0.15 ? Math.sign(a.vy || 1) * 0.05 : 0)
          if (a.x < 0 || a.x > w) a.vx *= -1
          if (a.y < 0 || a.y > h) a.vy *= -1
        }
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < LINK_DIST) {
            ctx.strokeStyle = `rgba(${accent},${(1 - d / LINK_DIST) * 0.35})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
        const md = Math.hypot(a.x - mouse.x, a.y - mouse.y)
        if (md < MOUSE_DIST * 1.4) {
          ctx.strokeStyle = `rgba(${accent},${(1 - md / (MOUSE_DIST * 1.4)) * 0.8})`
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(mouse.x, mouse.y)
          ctx.stroke()
        }
        ctx.fillStyle = `rgba(${accent},0.9)`
        ctx.beginPath()
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-[#05070d]" aria-hidden="true">
      <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
      <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(var(--c-accent)/0.18)] blur-[120px]" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        ref={glowRef}
        className="absolute left-0 top-0 h-[420px] w-[420px] rounded-full opacity-0 transition-opacity duration-300 [background:radial-gradient(circle,rgb(var(--c-accent)/0.22),transparent_65%)]"
      />
    </div>
  )
}

export default TechBackground
