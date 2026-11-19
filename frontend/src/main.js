import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './channel.css'
import './corners.css'

const revealObserver = typeof IntersectionObserver === 'undefined'
  ? null
  : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const element = entry.target
        element.classList.remove('reveal-pending')
        element.classList.add(`reveal-${element.dataset.revealVariant}`)
        revealObserver.unobserve(element)
      }
    }, { rootMargin: '0px 0px 12% 0px', threshold: 0.06 })

const app = createApp(App)

app.directive('reveal', {
  mounted(element, binding) {
    const settings = typeof binding.value === 'number' ? { delay: binding.value } : binding.value || {}
    const variant = ['fade', 'side', 'left', 'right'].includes(settings.variant) ? settings.variant : 'lift'

    if (!revealObserver || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    element.dataset.revealVariant = variant
    element.style.setProperty('--reveal-delay', `${Math.max(0, Math.min(Number(settings.delay) || 0, 500))}ms`)
    element.classList.add('reveal-pending')
    revealObserver.observe(element)
  },
  unmounted(element) {
    revealObserver?.unobserve(element)
  },
})

app.mount('#app')
