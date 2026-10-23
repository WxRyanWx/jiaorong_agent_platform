<script setup lang="ts">
defineOptions({ name: 'OpenPlatformPendingModulePane' })

const props = defineProps<{
  title: string
  subtitle: string
  description: string
  icon: string
}>()
</script>

<template>
  <section class="open-platform-page__pane-body">
    <header class="open-platform-page__pane-head">
      <div>
        <h2>{{ props.title }}</h2>
        <p>{{ props.subtitle }}</p>
      </div>
    </header>
    <div class="open-platform-page__empty">
      <div class="open-platform-page__empty-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          v-html="props.icon"
        />
      </div>
      <p>{{ props.description }}</p>
    </div>
  </section>
</template>
