<template>
  <svg class="message-loading" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="4" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="20" cy="12" r="2" fill="currentColor" />
  </svg>
</template>

<style scoped>
.message-loading{display:block;flex:none;overflow:visible}
.message-loading circle{animation:message-bounce 1.05s cubic-bezier(.33,.66,.66,1) infinite}
.message-loading circle:nth-child(2){animation-delay:.1s}
.message-loading circle:nth-child(3){animation-delay:.2s}
@keyframes message-bounce{0%,57%,100%{transform:translateY(0)}28%{transform:translateY(-6px)}}
/* 保留等待状态的明暗提示，减少动态效果时不使用位移动画。 */
@media(prefers-reduced-motion:reduce){
  .message-loading circle{animation-name:message-pulse;animation-duration:1.2s!important;animation-iteration-count:infinite!important}
}
@keyframes message-pulse{0%,57%,100%{opacity:.35}28%{opacity:1}}
</style>
