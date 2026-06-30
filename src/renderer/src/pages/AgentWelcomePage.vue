<template>
  <div class="h-full w-full flex flex-col window-drag-region">
    <div class="flex-1 flex flex-col items-center justify-center px-6">
      <div class="mb-5">
        <img src="@/assets/logo-dark.png" class="w-16 h-16" loading="lazy" />
      </div>

      <h1 class="mb-10 text-3xl font-semibold text-foreground">
        {{ t("welcome.agentPage.title") }}
      </h1>

      <div class="flex w-full max-w-3xl flex-col items-center gap-6">
        <div class="grid w-full grid-cols-3 gap-3">
          <button
            v-for="card in displayedAgentCards"
            :key="card.id"
            class="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-left transition-all duration-150 hover:border-border hover:bg-accent/40"
            @click="selectAgentCard(card)"
          >
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground"
            >
              <FixedIframeAgentIcon
                v-if="card.kind === 'fixed-iframe'"
                :icon-class="card.iconClass"
                size-class="text-[24px]"
              />
              <AgentAvatar
                v-else
                :agent="card.agent"
                class-name="h-6 w-6"
                fallback-class-name="rounded-lg"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-foreground">
                {{ card.name }}
              </div>
              <div class="truncate text-xs text-muted-foreground">
                {{ card.subtitle }}
              </div>
            </div>
            <Icon
              icon="lucide:chevron-right"
              class="h-4 w-4 text-muted-foreground/50"
            />
          </button>
        </div>

        <button
          class="text-xs text-muted-foreground transition-colors hover:text-foreground"
          @click="openAgentSettings"
        >
          {{ t("welcome.agentPage.manageAgents") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import { useI18n } from "vue-i18n";
import { createSettingsClient } from "@api/SettingsClient";
import { useAgentStore, type UIAgent } from "@/stores/ui/agent";
import { isFixedIframeAgentId } from "@shared/fixedIframeAgents";
import AgentAvatar from "@/components/icons/AgentAvatar.vue";
import FixedIframeAgentIcon from "@/components/icons/FixedIframeAgentIcon.vue";

type AgentWelcomeCard =
  | {
      id: string;
      kind: "store";
      agent: UIAgent;
      name: string;
      subtitle: string;
    }
  | {
      id: string;
      kind: "fixed-iframe";
      iconClass: string;
      name: string;
      subtitle: string;
    };

const MAX_USER_AGENT_CARDS = 4;

const { t } = useI18n();
const settingsClient = createSettingsClient();
const agentStore = useAgentStore();

const displayedAgentCards = computed<AgentWelcomeCard[]>(() => {
  const cards: AgentWelcomeCard[] = [];

  if (agentStore.sidebarAgents.deepchat) {
    const agent = agentStore.sidebarAgents.deepchat;
    cards.push({
      id: agent.id,
      kind: "store",
      agent,
      name: agent.name,
      subtitle: t("welcome.agentPage.deepchatType"),
    });
  }

  for (const fixedAgent of agentStore.fixedIframeAgents) {
    cards.push({
      id: fixedAgent.id,
      kind: "fixed-iframe",
      iconClass: fixedAgent.iconClass,
      name: t(fixedAgent.nameKey),
      subtitle: t(fixedAgent.typeKey),
    });
  }

  for (const agent of agentStore.sidebarAgents.userAgents.slice(
    0,
    MAX_USER_AGENT_CARDS,
  )) {
    cards.push({
      id: agent.id,
      kind: "store",
      agent,
      name: agent.name,
      subtitle:
        agent.type === "deepchat"
          ? t("welcome.agentPage.deepchatType")
          : t("welcome.agentPage.acpType"),
    });
  }

  return cards;
});

const selectAgentCard = (card: AgentWelcomeCard) => {
  if (card.kind === "fixed-iframe" && isFixedIframeAgentId(card.id)) {
    agentStore.resetFixedIframeNavigation(card.id);
  }
  agentStore.setSelectedAgent(card.id);
};

const openAgentSettings = async () => {
  await settingsClient.openSettings({
    routeName: "settings-deepchat-agents",
  });
};
</script>

<style scoped>
.window-drag-region {
  -webkit-app-region: drag;
}

button,
[role="button"] {
  -webkit-app-region: no-drag;
}
</style>
