<script setup lang="ts">
defineOptions({ name: 'OpenPlatformConfirmAction' })

import { Button, Popconfirm, type ButtonProps } from '@arco-design/web-vue'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    description: string
    confirmLabel?: string
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
    confirmVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
    position?: 'top' | 'bottom' | 'left' | 'right'
    disabled?: boolean
    testId?: string
    icon?: string
    popupVisible?: boolean
    popupContainer?: string | HTMLElement
  }>(),
  {
    confirmLabel: '确认',
    variant: 'ghost',
    confirmVariant: 'default',
    position: 'top',
    disabled: false,
    testId: undefined,
    icon: undefined,
    popupVisible: undefined,
    popupContainer: undefined
  }
)

const buttonType = computed(() =>
  props.variant === 'outline'
    ? 'outline'
    : props.variant === 'secondary'
      ? 'secondary'
      : props.variant === 'ghost' || props.variant === 'link'
        ? 'text'
        : 'primary'
)

const buttonStatus = computed(() => (props.variant === 'destructive' ? 'danger' : 'normal'))

const confirmButtonProps = computed<ButtonProps>(() =>
  props.confirmVariant === 'destructive' ? { type: 'primary', status: 'danger' } : {}
)

const emit = defineEmits<{
  confirm: []
  'update:popupVisible': [visible: boolean]
}>()
</script>

<template>
  <span class="open-platform-pane__confirm-action">
    <Popconfirm
      :content="props.description"
      :ok-text="props.confirmLabel"
      cancel-text="取消"
      :type="props.confirmVariant === 'destructive' ? 'warning' : 'info'"
      :ok-button-props="confirmButtonProps"
      :cancel-button-props="{}"
      :position="props.position"
      :popup-container="props.popupContainer"
      :popup-visible="props.popupVisible"
      :content-style="{ minWidth: '240px', maxWidth: '320px' }"
      content-class="open-platform-pane__confirm-popup"
      @ok="emit('confirm')"
      @update:popup-visible="(visible) => emit('update:popupVisible', visible)"
    >
      <Button
        :type="buttonType"
        :status="buttonStatus"
        size="small"
        :disabled="props.disabled"
        :data-testid="props.testId"
      >
        <Icon v-if="props.icon" :icon="props.icon" />
        {{ props.label }}
      </Button>
    </Popconfirm>
  </span>
</template>
