<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import appArt from '../../assets/open-platform-home/app.svg?url'
import componentsArt from '../../assets/open-platform-home/components.webp?url'
import expertArt from '../../assets/open-platform-home/expert.svg?url'
import hardwareArt from '../../assets/open-platform-home/hardware.webp?url'
import knowledgeArt from '../../assets/open-platform-home/knowledge.webp?url'
import mcpArt from '../../assets/open-platform-home/mcp.svg?url'
import pagentArt from '../../assets/open-platform-home/pagent.webp?url'
import skillArt from '../../assets/open-platform-home/skill.webp?url'
import webagentArt from '../../assets/open-platform-home/webagent.webp?url'
import '../styles/open-platform-home.less'

defineOptions({ name: 'OpenPlatformHomePane' })

type EcoKey = 'skill' | 'expert' | 'mcp' | 'app' | 'hardware'

const BASE_ICONS: Record<string, string> = {
  data: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"/><path d="M4.5 12v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6"/>',
  train: '<path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01"/><path d="M20.5 3.5v4.2h-4.2"/>',
  model:
    '<circle cx="5.5" cy="7" r="2.1"/><circle cx="5.5" cy="17" r="2.1"/><circle cx="18.5" cy="12" r="2.1"/><path d="M7.4 7.9l9 2.6M7.4 16.1l9-2.6"/>',
  agent:
    '<rect x="4" y="7.5" width="16" height="11.5" rx="3"/><path d="M12 3.5v4"/><circle cx="12" cy="3" r="1.3"/><path d="M9.2 12.3h.01M14.8 12.3h.01"/><path d="M9.8 15.4h4.4"/>',
  eval: '<path d="M3.5 18a8.5 8.5 0 1 1 17 0"/><path d="M12 18l4.2-5.2"/><circle cx="12" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10.5 4v3M13.5 4v3M10.5 17v3M13.5 17v3M4 10.5h3M4 13.5h3M17 10.5h3M17 13.5h3"/>',
  shield:
    '<path d="M12 3.2l7 2.9v5.9c0 4.4-3 7.9-7 8.9-4-1-7-4.5-7-8.9V6.1l7-2.9z"/><path d="M9.2 12l2 2 3.6-3.8"/>',
  wave: '<path d="M3 12h3.5l2.2-5.5 3.1 11L14.3 12H21"/>'
}

const activeEcoKey = shallowRef<EcoKey>('skill')
const baseMapRef = ref<HTMLDivElement | null>(null)
const baseLinesSvgRef = ref<SVGSVGElement | null>(null)
const baseLinesGroupRef = ref<SVGGElement | null>(null)

const heroStats = computed(() => [
  { value: '5', label: '项开放能力' },
  { value: '4', label: '项开源能力' },
  { value: '8', label: '个底座中心' },
  { value: '1', label: '套统一发布渠道' }
])

const ecoItems = computed(() => [
  {
    key: 'skill' as const,
    label: '技能 Skill',
    tag: 'Skill',
    slogan: '给 Agent 装上任意新技能',
    body: '自建 Skill，把各业务线的专业能力、各系统的数据接口，在安全合规、自主可控的前提下，供 Agent 随时调用、即取即用。',
    art: skillArt,
    pending: false
  },
  {
    key: 'expert' as const,
    label: '专家',
    tag: '专家',
    slogan: '让行业专家随时在线，随问随答',
    body: '构建专属 AI 专家，把多年沉淀的专业经验，变成随时可问的智能专家。',
    art: expertArt,
    pending: false
  },
  {
    key: 'mcp' as const,
    label: '连接器 MCP',
    tag: '连接器 MCP',
    slogan: '连接内外系统，打通系统孤岛，Agent 直达数据',
    body: '接入自建连接器，让各业务系统、各业务线数据与外部数据源，在 Agent 工作流中无缝流转、随取随用。',
    art: mcpArt,
    pending: false
  },
  {
    key: 'app' as const,
    label: '交融应用',
    tag: '交融应用',
    slogan: '打造专属应用，沉淀行业智慧',
    body: '构建专属交融应用，将行业经验、专业数据与业务流程封装成完整场景，开箱即用。',
    art: appArt,
    pending: false
  },
  {
    key: 'hardware' as const,
    label: '硬件',
    tag: '硬件',
    slogan: '设备有 AI，指令随口即达',
    body: '开放智能体硬件生态，支持设备一键唤起交融超级智能体，语音下达指令，实时掌握任务状态，随时记录业务灵感。',
    art: hardwareArt,
    pending: true
  }
])

const activeEcoItem = computed(
  () => ecoItems.value.find((item) => item.key === activeEcoKey.value) ?? ecoItems.value[0]
)

const ossItems = computed(() => [
  {
    title: '知识中枢',
    body: '集团统一的AI 知识底座，提供文档解析API、知识库建设能力；提供输入文档、输出基于文档问答的 API 接口 + 问答界面。',
    art: knowledgeArt,
    badge: ''
  },
  {
    title: '交融AI组件库+能力库',
    body: '提供开箱即用的 AI Chat 对话引擎与前端组件；支持原子化智能体流程图生成、智能填单等能力',
    art: componentsArt,
    badge: ''
  },
  {
    title: '超级智能体研发框架',
    body: '提供代码级开源的企业级智能体研发框架，支持构建高级智能体，助力各业务线快速研发专属智能体。',
    art: pagentArt,
    badge: '管放'
  },
  {
    title: '系统智能体',
    body: '提供代码级开源研发框架，支持基于已建业务系统构建专属AI助手，快速具备智能交互与自动化任务能力。',
    art: webagentArt,
    badge: ''
  }
])

const baseLead = computed(() => ({
  label: '智能生产链路',
  items: [
    { name: '高质量数据集中心', icon: 'data' },
    { name: '训练中心', icon: 'train' },
    { name: '模型中心', icon: 'model' },
    { name: '智能体中心', icon: 'agent' }
  ]
}))

const baseGroups = computed(() => [
  {
    label: '质量与算力',
    guard: false,
    items: [
      { name: '评测中心', icon: 'eval' },
      { name: '算力调度中心', icon: 'chip' }
    ]
  },
  {
    label: '运行保障',
    guard: true,
    items: [
      { name: '安全中心', icon: 'shield' },
      { name: '监控中心', icon: 'wave' }
    ]
  }
])

const cases = computed(() => [
  {
    tag: '智能疏浚',
    title: '疏浚助手',
    body: '实现疏浚知识问答、设备图纸解析、自然语言问数查询、离线运行等功能，构建船舶专属智慧大脑。',
    footer: '由 技能 + 问数平台 + 知识中枢 支撑'
  },
  {
    tag: '工程建设',
    title: '施工方案审查',
    body: '面向工程建设打造的智能化方案审核应用，依托工程知识库实现施工方案合规校验、风险智能预警、审核报告自动生成，快速识别错漏缺项与危大工程隐患，赋能工程安全管控。',
    footer: '由 智能体应用 + 知识中枢 支撑'
  },
  {
    tag: '报告咨询',
    title: '节能报告生成',
    body: '面向节能咨询场景打造的智能应用，以交融超级智能体为底座，融合知识库与 AI 报告生成能力，打通知识管理、报告编制、节能评估智能研判、能耗对比分析全流程一体化作业。',
    footer: '由 交融超级智能体 + 知识中枢 支撑'
  }
])

function drawBaseLines() {
  const map = baseMapRef.value
  const svg = baseLinesSvgRef.value
  const group = baseLinesGroupRef.value
  if (!map || !svg || !group) return

  const width = map.clientWidth
  const height = map.clientHeight
  if (!width || !height) return

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg
    .querySelector<SVGLinearGradientElement>('#open-platform-home-bus-gradient')
    ?.setAttribute('x2', String(width))
  svg
    .querySelector<SVGLinearGradientElement>('#open-platform-home-flow-gradient')
    ?.setAttribute('x2', String(width))

  const mapRect = map.getBoundingClientRect()
  const measure = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left - mapRect.left,
      right: rect.right - mapRect.left,
      bottom: rect.bottom - mapRect.top,
      top: rect.top - mapRect.top,
      centerX: rect.left - mapRect.left + rect.width / 2,
      centerY: rect.top - mapRect.top + rect.height / 2
    }
  }

  const leadNodes = Array.from(
    map.querySelectorAll<HTMLElement>('.open-platform-home__base-node.is-lead')
  ).map(measure)
  const supportNodes = Array.from(
    map.querySelectorAll<HTMLElement>('.open-platform-home__base-node:not(.is-lead)')
  ).map(measure)
  let paths = ''

  for (let index = 0; index < leadNodes.length - 1; index += 1) {
    const current = leadNodes[index]
    const next = leadNodes[index + 1]
    const startX = current.right + 4
    const endX = next.left - 12
    if (endX - startX < 5) continue
    paths += `<path class="open-platform-home__base-flow" d="M${startX.toFixed(1)} ${current.centerY.toFixed(1)}H${endX.toFixed(1)}"/>`
    paths += `<path class="open-platform-home__base-arrow" d="M${(endX + 10).toFixed(1)} ${current.centerY.toFixed(1)}L${endX.toFixed(1)} ${(current.centerY - 5.4).toFixed(1)}L${endX.toFixed(1)} ${(current.centerY + 5.4).toFixed(1)}Z"/>`
  }

  if (leadNodes.length && supportNodes.length) {
    const busY = (leadNodes[0].bottom + supportNodes[0].top) / 2
    const busStartX = leadNodes[0].left + 18
    const busEndX = leadNodes[leadNodes.length - 1].right - 18
    leadNodes.forEach((node) => {
      paths += `<path class="open-platform-home__base-branch" d="M${node.centerX.toFixed(1)} ${node.bottom.toFixed(1)}V${busY.toFixed(1)}"/>`
    })
    supportNodes.forEach((node) => {
      paths += `<path class="open-platform-home__base-branch" d="M${node.centerX.toFixed(1)} ${busY.toFixed(1)}V${node.top.toFixed(1)}"/>`
    })
    paths += `<path class="open-platform-home__base-bus" d="M${busStartX.toFixed(1)} ${busY.toFixed(1)}H${busEndX.toFixed(1)}"/>`
    paths += `<path class="open-platform-home__base-bus-dash" d="M${busStartX.toFixed(1)} ${busY.toFixed(1)}H${busEndX.toFixed(1)}"/>`
    leadNodes.forEach((node) => {
      paths += `<circle class="open-platform-home__base-dot" cx="${node.centerX.toFixed(1)}" cy="${busY.toFixed(1)}" r="2.8"/>`
    })
  }

  group.innerHTML = paths
}

onMounted(async () => {
  await nextTick()
  requestAnimationFrame(drawBaseLines)
  window.addEventListener('resize', drawBaseLines)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', drawBaseLines)
})
</script>

<template>
  <section class="open-platform-home">
    <div class="open-platform-home__hero">
      <p class="open-platform-home__eyebrow">交融超级智能体 · 开放平台</p>
      <h1 class="open-platform-home__title">
        让业务需求，
        <span>更快做成智能体</span>
      </h1>
      <p class="open-platform-home__subtitle">
        底座代码级开源，无需从零开发；按业务需求灵活组合，完成后统一分发。
      </p>
      <dl class="open-platform-home__stats">
        <div v-for="stat in heroStats" :key="stat.label" class="open-platform-home__stat">
          <dt>{{ stat.label }}</dt>
          <dd>{{ stat.value }}</dd>
        </div>
      </dl>
    </div>

    <div class="open-platform-home__ecosystem">
      <section class="open-platform-home__eco-block">
        <h3>五大开放能力，统一发布、统一分发</h3>
        <p>按使用场景选形态，一次发布，各业务条线可直接调用</p>
        <div class="open-platform-home__eco-tabs" role="tablist">
          <button
            v-for="item in ecoItems"
            :key="item.key"
            class="open-platform-home__eco-tab"
            :class="{ 'is-active': activeEcoKey === item.key }"
            type="button"
            role="tab"
            :aria-selected="activeEcoKey === item.key"
            @click="activeEcoKey = item.key"
          >
            <span>{{ item.label }}</span>
            <em v-if="item.pending"> 待开放 </em>
          </button>
        </div>
        <div :key="activeEcoItem.key" class="open-platform-home__eco-detail">
          <div>
            <span class="open-platform-home__eco-tag">{{ activeEcoItem.tag }}</span>
            <h4>{{ activeEcoItem.slogan }}</h4>
            <p>{{ activeEcoItem.body }}</p>
          </div>
          <img :src="activeEcoItem.art" :alt="`${activeEcoItem.label} 示意`" loading="lazy" />
        </div>
      </section>

      <section class="open-platform-home__eco-block">
        <h3>四大开源能力，免去重复建设</h3>
        <p>代码级开源，可直接复用、可二次开发</p>
        <div class="open-platform-home__oss-grid">
          <article v-for="item in ossItems" :key="item.title" class="open-platform-home__oss-card">
            <img :src="item.art" :alt="`${item.title} 示意`" loading="lazy" />
            <h4>
              <span>{{ item.title }}</span>
              <em v-if="item.badge">{{ item.badge }}</em>
            </h4>
            <p>{{ item.body }}</p>
          </article>
        </div>
      </section>

      <section class="open-platform-home__eco-block">
        <h3>八大底座中心，全链路托底</h3>
        <p>从数据集到智能体的全链路能力，向上支撑五大开放能力与四大开源能力</p>
        <div ref="baseMapRef" class="open-platform-home__base-map">
          <svg ref="baseLinesSvgRef" class="open-platform-home__base-lines" aria-hidden="true">
            <defs>
              <linearGradient
                id="open-platform-home-bus-gradient"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="1000"
                y2="0"
              >
                <stop offset="0" stop-color="#7fa6ff" stop-opacity="0" />
                <stop offset="0.16" stop-color="#7fa6ff" />
                <stop offset="0.52" stop-color="#5fd6c8" />
                <stop offset="0.86" stop-color="#7fa6ff" />
                <stop offset="1" stop-color="#7fa6ff" stop-opacity="0" />
              </linearGradient>
              <linearGradient
                id="open-platform-home-flow-gradient"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="1000"
                y2="0"
              >
                <stop offset="0" stop-color="#a9c3ff" />
                <stop offset="1" stop-color="#6fd9cc" />
              </linearGradient>
            </defs>
            <g ref="baseLinesGroupRef" />
          </svg>
          <div class="open-platform-home__base-grid">
            <div class="open-platform-home__base-label">
              <span>{{ baseLead.label }}</span>
              <i aria-hidden="true" />
            </div>
            <div
              v-for="item in baseLead.items"
              :key="item.name"
              class="open-platform-home__base-node is-lead"
            >
              <span class="open-platform-home__base-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <g v-html="BASE_ICONS[item.icon]" />
                </svg>
              </span>
              <span>{{ item.name }}</span>
            </div>
            <template v-for="group in baseGroups" :key="group.label">
              <div
                v-for="item in group.items"
                :key="item.name"
                class="open-platform-home__base-node"
                :class="{ 'is-guard': group.guard }"
              >
                <span class="open-platform-home__base-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <g v-html="BASE_ICONS[item.icon]" />
                  </svg>
                </span>
                <span>{{ item.name }}</span>
              </div>
            </template>
            <div
              v-for="group in baseGroups"
              :key="`${group.label}-label`"
              class="open-platform-home__base-group"
            >
              <span>{{ group.label }}</span>
              <i aria-hidden="true" />
            </div>
          </div>
        </div>
        <p class="open-platform-home__base-note">
          八大中心构成从数据集、训练、模型到智能体的完整生产链路，并由评测、调度、安全与监控全程贯穿，统一支撑五大开放能力与四大开源能力。
        </p>
      </section>
    </div>

    <section class="open-platform-home__cases">
      <h3>看看他们做成了什么</h3>
      <p>不同业务条线，都已经跑通能力落地</p>
      <div class="open-platform-home__case-grid">
        <article v-for="item in cases" :key="item.title" class="open-platform-home__case">
          <span>{{ item.tag }}</span>
          <h4>{{ item.title }}</h4>
          <p>{{ item.body }}</p>
          <footer>{{ item.footer }}</footer>
        </article>
      </div>
    </section>

    <!-- <section class="open-platform-home__cta">
      <p>交融超级智能体客户端</p>
      <h3>从创建到发布，同一个工作台</h3>
      <p>调试、版本与分发，都在客户端内完成。下载后，创建第一个能力。</p>
      <button type="button">
        <span>立即下载客户端</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 12h15M13 6l6 6-6 6" />
        </svg>
      </button>
    </section> -->
  </section>
</template>
