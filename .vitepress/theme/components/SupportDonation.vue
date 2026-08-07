<script setup lang="ts">
import { withBase } from "vitepress";
</script>

<template>
  <div class="support-visual">
    <img
      class="support-qr-image"
      :src="withBase('/support/alipay-reward.jpg')"
      alt="支付宝打赏二维码"
    />
  </div>
</template>
