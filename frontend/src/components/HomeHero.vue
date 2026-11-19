<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import cloudFar from '../assets/hero-cloud-far-enhanced.png'

const emit = defineEmits(['navigate'])
const page = ref(null)
const progress = ref(0)
let frame = 0

function updateProgress() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const element = page.value
    if (!element) return
    progress.value = element.scrollTop / Math.max(element.clientHeight, 1)
  })
}

onMounted(() => page.value?.addEventListener('scroll', updateProgress, { passive: true }))
onBeforeUnmount(() => {
  page.value?.removeEventListener('scroll', updateProgress)
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div
    ref="page"
    class="home-page"
    :style="{
      '--hero-visibility': Math.max(0, 1 - progress / 0.72),
      '--hero-offset': `${(1 - Math.max(0, 1 - progress / 0.72)) * 34}px`,
      '--hero-scale': 0.94 + Math.max(0, 1 - progress / 0.72) * 0.06,
      '--hero-blur': `${(1 - Math.max(0, 1 - progress / 0.72)) * 5}px`,
      '--discover-visibility': Math.min(1, Math.max(0, (progress - 0.5) / 0.5)),
      '--discover-offset': `${(1 - Math.min(1, Math.max(0, (progress - 0.5) / 0.5))) * 32}px`,
      '--discover-blur': `${(1 - Math.min(1, Math.max(0, (progress - 0.5) / 0.5))) * 6}px`,
    }"
  >
    <div class="home-backdrop" aria-hidden="true">
      <img class="home-hero-image" src="https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=2400&q=88" alt="" />
      <div class="home-hero-shade"></div>
      <div class="home-cloud-layer home-cloud-far">
        <img :src="cloudFar" alt="" />
        <img :src="cloudFar" alt="" />
      </div>
    </div>
    <section class="home-hero">
      <div class="home-hero-copy">
        <h1>下一段旅程，<br /><em>从这里开始。</em></h1>
        <p>好风景值得期待，好旅程也值得从容计划。</p>
      </div>
    </section>

    <section class="home-discover">
      <div class="home-discover-heading">
        <p>THE WORLD IS WAITING</p>
        <h2>下一站，<br />按自己的节奏出发。</h2>
        <span>海岛、山野或城市，挑一种心情出发。</span>
        <button class="home-explore-link" @click="emit('navigate', '酒店')">
          <span class="home-explore-label">开始探索旅程</span>
          <ArrowRight class="home-explore-arrow" :size="17" aria-hidden="true" />
        </button>
      </div>
      <footer class="home-footer"><span>下一站，由你决定。</span><span>课程演示 · 商品与服务信息为演示数据</span></footer>
    </section>
  </div>
</template>

<style scoped>
.home-page{--hero-visibility:1;--discover-visibility:0;width:100%;height:100vh;height:100svh;margin:0;padding:0;overflow-y:auto;overscroll-behavior-y:contain;position:relative;isolation:isolate}
.home-hero,.home-discover{position:relative;z-index:1}
.home-hero{height:100vh;height:100svh;min-height:680px;overflow:hidden;color:#fff}
.home-backdrop{position:sticky;z-index:0;top:0;height:100vh;height:100svh;margin-bottom:-100vh;margin-bottom:-100svh;overflow:hidden;background:#668291;pointer-events:none}
.home-hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 54%;view-transition-name:travel-landscape;animation:home-image-in 1.43s cubic-bezier(.16,1,.3,1) both}
.home-hero-shade{position:absolute;z-index:1;inset:0;background:linear-gradient(90deg,rgba(10,31,43,.52),rgba(10,31,43,.15) 48%,rgba(10,31,43,0) 82%),linear-gradient(0deg,rgba(10,31,43,.48),rgba(10,31,43,.08) 48%,rgba(10,31,43,.08))}
.home-cloud-layer{position:absolute;z-index:2;left:0;width:200%;height:min(54svh,34vw);display:flex;pointer-events:none;will-change:transform;filter:blur(2.5px);mix-blend-mode:screen;opacity:.9}
.home-cloud-layer img{display:block;width:50%;height:100%;flex:none;object-fit:fill}
.home-cloud-far{top:-3%;animation:cloud-drift 72s linear infinite}
.home-hero-copy{position:absolute;z-index:3;left:8.5%;top:50%;width:min(650px,75%);transform:translateY(calc(-50% - var(--hero-offset))) scale(var(--hero-scale));transform-origin:left center;opacity:var(--hero-visibility);filter:blur(var(--hero-blur));pointer-events:auto;will-change:transform,opacity,filter}
.home-hero h1{font-size:68px;line-height:1.22;font-weight:600;margin:0 0 20px}
.home-hero h1 em{font-style:normal}
.home-hero-copy>p{font-size:16px;color:#f1f6f7;margin:0}
.home-explore-link{
  position:relative;isolation:isolate;overflow:hidden;
  margin-top:34px;width:258px;min-height:52px;padding:0 23px;
  border:1px solid rgba(255,255,255,.78);border-radius:999px;
  background:#fff;color:#17456b;
  display:inline-flex;align-items:center;justify-content:center;gap:24px;
  font-size:14px;font-weight:600;
  box-shadow:0 8px 26px rgba(4,34,57,.16);
  transition:transform .32s cubic-bezier(.2,.75,.25,1),box-shadow .32s ease,color .24s ease;
}
.home-explore-link::before{
  content:"";position:absolute;z-index:-1;left:16px;top:50%;width:8px;height:8px;
  border-radius:50%;background:#07558f;
  transform:translate(-50%,-50%) scale(1);transform-origin:center;pointer-events:none;
  transition:transform .82s cubic-bezier(.2,.72,.2,1);
}
.home-explore-link .home-explore-label,.home-explore-link>svg{
  position:relative;z-index:1;transition:transform .32s cubic-bezier(.2,.75,.25,1),color .24s ease;
}
.home-explore-link .home-explore-label{
  position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;
}
.home-explore-link .home-explore-arrow{
  position:absolute;right:24px;opacity:0;transform:translateX(-6px) scale(.88);
  transition:opacity .28s ease .18s,transform .48s cubic-bezier(.2,.75,.25,1) .1s;
}
.home-explore-link:hover,.home-explore-link:focus-visible{
  color:#fff;transform:translateY(-2px);box-shadow:0 12px 30px rgba(0,54,94,.3);
}
.home-explore-link:hover::before,.home-explore-link:focus-visible::before{transform:translate(-50%,-50%) scale(68)}
.home-explore-link:hover .home-explore-label,.home-explore-link:focus-visible .home-explore-label{transform:translateX(-50%)}
.home-explore-link:hover .home-explore-arrow,.home-explore-link:focus-visible .home-explore-arrow{
  opacity:1;transform:translateX(0) scale(1);
}
.home-explore-link:focus-visible{outline:3px solid #8fd0ff;outline-offset:4px}
.home-explore-link:active{transform:translateY(0) scale(.98)}
.home-discover{min-height:100vh;min-height:100svh;max-width:1440px;margin:0 auto;padding:clamp(32px,7svh,90px) 56px 20px;display:flex;flex-direction:column;color:#fff}
.home-discover-heading{position:relative;z-index:1;margin-top:auto;margin-bottom:auto;opacity:var(--discover-visibility);transform:translateY(var(--discover-offset));filter:blur(var(--discover-blur));will-change:transform,opacity,filter}
.home-discover-heading p{margin:0 0 17px;color:rgba(255,255,255,.74);font:600 10px "DM Sans",sans-serif}
.home-discover-heading h2{margin:0;color:#fff;font-size:44px;line-height:1.3;font-weight:600;text-shadow:0 2px 18px rgba(4,28,41,.2)}
.home-discover-heading>span{display:block;margin-top:16px;color:rgba(255,255,255,.86);font-size:14px}
.home-footer{position:relative;z-index:1;display:flex;justify-content:space-between;gap:16px;padding:clamp(20px,5svh,48px) 0 12px;border-top:1px solid rgba(255,255,255,.32);color:rgba(255,255,255,.78);font-size:10px}
@keyframes home-image-in{from{opacity:.72;transform:scale(1.035)}to{opacity:1;transform:scale(1)}}
@keyframes home-copy-in{from{opacity:0;translate:0 12px}to{opacity:1;translate:0 0}}
@keyframes cloud-drift{to{transform:translate3d(-50%,0,0)}}
@media(max-width:900px){.home-discover{padding:clamp(32px,6svh,68px) 28px 18px}}
@media(max-width:600px){.home-hero{min-height:100svh}.home-hero-image{object-position:58% center}.home-hero-shade{background:linear-gradient(90deg,rgba(10,31,43,.48),rgba(10,31,43,.08)),linear-gradient(0deg,rgba(10,31,43,.25),transparent 55%)}.home-cloud-layer{filter:blur(3px)}.home-hero-copy{left:25px;width:calc(100% - 50px)}.home-hero h1{font-size:43px;font-weight:600;margin-bottom:15px}.home-hero-copy>p{font-size:13px;max-width:280px;line-height:1.7}.home-explore-link{margin-top:25px;min-height:46px}.home-discover{padding:clamp(24px,5svh,48px) 18px 14px}.home-discover-heading p{font-size:9px;margin-bottom:8px}.home-discover-heading h2{font-size:32px}.home-discover-heading>span{font-size:12px;line-height:1.6}.home-footer{flex-direction:column;gap:6px;padding:12px 0 0;font-size:8px}}
@media(prefers-reduced-motion:reduce){
  .home-hero-copy,.home-discover-heading{filter:none;will-change:auto}
  .home-hero-copy{opacity:1;transform:translateY(-50%)}
  .home-discover-heading{opacity:1;transform:none}
  .home-hero-image,.home-hero-copy,.home-cloud-layer{animation:none}
  .home-explore-link,.home-explore-link::before,.home-explore-link .home-explore-label,.home-explore-link>svg{transition:none}
  .home-explore-link:hover,.home-explore-link:focus-visible{transform:none}
  .home-explore-link:hover::before,.home-explore-link:focus-visible::before{transform:translate(-50%,-50%) scale(68)}
  .home-explore-link .home-explore-arrow{opacity:0;transform:none;transition:none}
  .home-explore-link:hover .home-explore-arrow,.home-explore-link:focus-visible .home-explore-arrow{opacity:1}
}
</style>
