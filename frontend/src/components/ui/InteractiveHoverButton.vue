<script setup>
import { ArrowRight } from 'lucide-vue-next'

defineProps({
  type: { type: String, default: 'button' },
  tone: { type: String, default: 'blue' },
  variant: { type: String, default: 'outline' },
})
</script>

<template>
  <button :type="type" class="interactive-hover-button" :class="[`hover-tone-${tone}`, `hover-variant-${variant}`]">
    <span class="hover-button-fill" aria-hidden="true"></span>
    <span v-if="$slots.prefix" class="hover-button-prefix" aria-hidden="true"><slot name="prefix" /></span>
    <span class="hover-button-label"><slot /></span>
    <span class="hover-button-reveal" aria-hidden="true"><slot name="reveal"><slot /></slot><ArrowRight class="hover-button-arrow" :size="16" /></span>
  </button>
</template>

<style scoped>
.interactive-hover-button{
  --button-accent:var(--blue,#0066cc);
  --button-hover:var(--blue-dark,#0052a3);
  --button-dot:var(--button-accent);
  --button-fill-scale:120;
  position:relative;isolation:isolate;display:inline-flex;align-items:center;justify-content:center;
  gap:0;overflow:hidden;min-height:38px;padding:9px 22px;border:1px solid #a6d4fa;
  border-radius:6px;background:#fff;color:var(--button-accent);font-weight:600;
  white-space:nowrap;vertical-align:middle;touch-action:manipulation;
}
.hover-tone-orange{--button-accent:#f58220;--button-hover:#dd6d12}
.hover-variant-solid{--button-dot:#ffffffb3;background:var(--button-accent);border-color:transparent;color:#fff}
.interactive-hover-button.hover-variant-solid:not(:disabled):not(:active){background:var(--button-accent)}
.hover-button-fill{
  position:absolute;z-index:0;left:var(--button-fill-origin-x,28px);top:50%;width:6px;height:6px;border-radius:50%;
  background:var(--button-dot);transform:translateY(-50%) scale(0);transform-origin:center;pointer-events:none;
  transition:transform 0.936s cubic-bezier(.4,0,.2,1),background-color .22s;
}
.hover-button-label,.hover-button-reveal{
  position:relative;z-index:1;
  display:inline-flex;align-items:center;justify-content:center;gap:7px;
  line-height:1.4;pointer-events:none;
}
.hover-button-prefix{position:relative;z-index:1;display:inline-flex;align-items:center;flex:none;pointer-events:none}
.hover-button-label{transform:translateX(4px);transition:transform 0.364s ease,opacity 0.26s ease .06s}
.hover-button-reveal{
  position:absolute;inset:0;gap:7px;padding:0 10px;color:#fff;
  transform:translateX(-12px);opacity:0;transition:transform 0.416s ease .12s,opacity 0.26s ease .12s;
}
.hover-button-arrow{flex:none;width:1.1em;height:1.1em}
.hover-button-reveal :deep(svg:not(.hover-button-arrow)){display:none}
.interactive-hover-button:focus-visible{outline:3px solid #6cbbff;outline-offset:3px}
.interactive-hover-button:disabled{cursor:not-allowed}
.interactive-hover-button:disabled .hover-button-fill{opacity:0}
.interactive-hover-button:disabled .hover-button-label{transform:none}
@media(hover:hover) and (pointer:fine){
  .interactive-hover-button:not(:disabled):hover .hover-button-fill{
    background:var(--button-hover);transform:translateY(-50%) scale(var(--button-fill-scale));
  }
  .interactive-hover-button:not(:disabled):hover .hover-button-label{transform:translateX(16px);opacity:0}
  .interactive-hover-button:not(:disabled):hover .hover-button-reveal{transform:translateX(0);opacity:1}
}
.interactive-hover-button:not(:disabled):focus-visible .hover-button-fill{
  background:var(--button-hover);transform:translateY(-50%) scale(var(--button-fill-scale));
}
.interactive-hover-button:not(:disabled):focus-visible .hover-button-label{transform:translateX(16px);opacity:0}
.interactive-hover-button:not(:disabled):focus-visible .hover-button-reveal{transform:translateX(0);opacity:1}
@media(prefers-reduced-motion:reduce){
  .hover-button-fill,.hover-button-label,.hover-button-reveal{transition:none}
}
</style>
